// Auth context resolution.
//
// Two providers behind one interface:
//   - DemoAuthProvider:  no Clerk keys -> single demo user + org (dev behavior)
//   - ClerkAuthProvider: CLERK_SECRET_KEY set -> verify Clerk session token,
//     map the Clerk user to a Pulse User + Membership, derive org + role.
//
// The Fastify hook (plugin.ts) attaches the resolved context to request.authContext.
// Routes read organizationId / userId / role from there; never the demo fallback
// directly anymore.

import type { FastifyRequest } from "fastify";
import { createClerkClient, verifyToken } from "@clerk/backend";
import type { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const env = loadEnv();

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: OrgRole;
  email: string;
  /** "demo" when running without Clerk, "clerk" when authenticated. */
  source: "demo" | "clerk";
}

export function isClerkConfigured(): boolean {
  return Boolean(env.CLERK_SECRET_KEY);
}

const clerkClient = env.CLERK_SECRET_KEY ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY }) : null;

function isKnownUniqueError(error: unknown, field: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002" &&
    String((error as { meta?: { target?: unknown } }).meta?.target ?? "").includes(field)
  );
}

// ---------- Demo provider ----------

let demoContextCache: AuthContext | null = null;

async function resolveDemoContext(): Promise<AuthContext> {
  if (demoContextCache) return demoContextCache;
  // Demo org runs on SCALE so single-tenant dev isn't plan-limited.
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    create: { slug: "demo", name: "Demo Organization", plan: "SCALE" },
    update: { plan: "SCALE" }
  });
  let user = await prisma.user.findUnique({ where: { email: "demo@pulse.local" } });
  if (!user) {
    user = await prisma.user.create({ data: { email: "demo@pulse.local", name: "Demo Operator" } });
  }
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: { userId: user.id, organizationId: org.id, role: "OWNER", acceptedAt: new Date() },
    update: {}
  });
  demoContextCache = { userId: user.id, organizationId: org.id, role: "OWNER", email: user.email, source: "demo" };
  return demoContextCache;
}

// ---------- Clerk provider ----------

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

interface ClerkClaims {
  sub: string; // clerk user id
  org_id?: string; // active clerk org id
  org_role?: string; // e.g. "org:admin"
  org_slug?: string;
  email?: string;
}

function mapClerkRole(orgRole?: string): OrgRole {
  switch (orgRole) {
    case "org:owner":
    case "owner":
      return "OWNER";
    case "org:admin":
    case "admin":
      return "ADMIN";
    case "org:analyst":
    case "analyst":
      return "ANALYST";
    default:
      return "VIEWER";
  }
}

export function isEmailAllowed(email: string, allowedEmails = env.AUTH_ALLOWED_EMAILS): boolean {
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(email.trim().toLowerCase());
}

async function resolveClerkContext(request: FastifyRequest): Promise<AuthContext | null> {
  const token = extractBearer(request);
  if (!token || !env.CLERK_SECRET_KEY) return null;

  let claims: ClerkClaims;
  try {
    claims = (await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY })) as unknown as ClerkClaims;
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "Clerk token verification failed");
    return null;
  }

  // Resolve email: prefer claim, fall back to Clerk API.
  let email = claims.email;
  if (!email && clerkClient) {
    try {
      const clerkUser = await clerkClient.users.getUser(claims.sub);
      email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
    } catch (error) {
      logger.warn({ err: (error as Error).message, sub: claims.sub }, "Clerk getUser failed");
    }
  }
  if (!email) email = `${claims.sub}@clerk.local`;
  if (!isEmailAllowed(email)) {
    logger.warn({ email }, "Authenticated Clerk user is not in AUTH_ALLOWED_EMAILS");
    throw new UnauthorizedError();
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Resolve by email without racing concurrent first-page API calls. Clerk may
  // trigger several requests at once; create can lose the race on User.email.
  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    try {
      user = await prisma.user.create({ data: { email: normalizedEmail, name: normalizedEmail.split("@")[0] } });
    } catch (error) {
      if (!isKnownUniqueError(error, "email")) throw error;
      user = await prisma.user.findUniqueOrThrow({ where: { email: normalizedEmail } });
    }
  }

  // Resolve organization. If Clerk org present, map it; otherwise use/create a personal org.
  const orgSlug = claims.org_slug ?? `clerk-${claims.org_id ?? claims.sub}`.slice(0, 48);
  const orgName = claims.org_slug ?? "Personal";
  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    create: { slug: orgSlug, name: orgName, plan: "FREE" },
    update: {}
  });

  await adoptLegacyDemoMetaData({ organizationId: org.id, email: normalizedEmail });

  const role = mapClerkRole(claims.org_role);
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: { userId: user.id, organizationId: org.id, role, acceptedAt: new Date() },
    update: { role }
  });

  return { userId: user.id, organizationId: org.id, role, email: normalizedEmail, source: "clerk" };
}

async function adoptLegacyDemoMetaData({ organizationId, email }: { organizationId: string; email: string }) {
  if (!isEmailAllowed(email) || email !== "kinotrance@gmail.com") return;

  const [existing, demoOrg] = await Promise.all([
    prisma.metaConnection.count({ where: { organizationId } }),
    prisma.organization.findUnique({ where: { slug: "demo" }, select: { id: true } })
  ]);
  if (existing > 0 || !demoOrg || demoOrg.id === organizationId) return;

  const demoConnections = await prisma.metaConnection.findMany({
    where: { organizationId: demoOrg.id, status: "ACTIVE" },
    include: { accounts: { select: { id: true } } }
  });
  if (demoConnections.length === 0) return;

  const accountIds = demoConnections.flatMap((connection) => connection.accounts.map((account) => account.id));

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const campaigns = await tx.campaignSnapshot.findMany({
        where: { organizationId: demoOrg.id, accountId: { in: accountIds } },
        select: { id: true }
      });
      const campaignIds = campaigns.map((campaign) => campaign.id);

      await tx.metaConnection.updateMany({
        where: { organizationId: demoOrg.id, id: { in: demoConnections.map((connection) => connection.id) } },
        data: { organizationId }
      });
      await tx.metaAdAccount.updateMany({
        where: { organizationId: demoOrg.id, id: { in: accountIds } },
        data: { organizationId }
      });
      await tx.campaignSnapshot.updateMany({
        where: { organizationId: demoOrg.id, id: { in: campaignIds } },
        data: { organizationId }
      });
      await tx.auditEvent.updateMany({
        where: { organizationId: demoOrg.id, type: { startsWith: "meta." } },
        data: { organizationId }
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          type: "meta.connection.adopted",
          severity: "INFO",
          message: `Legacy demo Meta connection adopted for ${email}`,
          metadata: { connections: demoConnections.length, accounts: accountIds.length, campaigns: campaignIds.length }
        }
      });
    });
    logger.info({ email, connections: demoConnections.length, accounts: accountIds.length }, "Adopted legacy demo Meta data");
  } catch (error) {
    logger.warn({ err: (error as Error).message, email }, "Legacy demo Meta adoption skipped");
  }
}

export async function resolveAuthContext(request: FastifyRequest): Promise<AuthContext> {
  if (isClerkConfigured()) {
    const ctx = await resolveClerkContext(request);
    if (ctx) return ctx;
    // Clerk configured but no/invalid token -> unauthenticated.
    throw new UnauthorizedError();
  }
  return resolveDemoContext();
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

// ---------- Role helper ----------

const ROLE_RANK: Record<OrgRole, number> = { VIEWER: 0, ANALYST: 1, ADMIN: 2, OWNER: 3 };

export function hasRole(ctx: AuthContext, minimum: OrgRole): boolean {
  return ROLE_RANK[ctx.role] >= ROLE_RANK[minimum];
}

export class ForbiddenError extends Error {
  statusCode = 403;
  constructor(required: OrgRole) {
    super(`Requires ${required} role or higher`);
    this.name = "ForbiddenError";
  }
}

export function requireRole(ctx: AuthContext, minimum: OrgRole): void {
  if (!hasRole(ctx, minimum)) throw new ForbiddenError(minimum);
}
