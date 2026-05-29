// Auth context resolution.
//
// Two providers behind one interface:
//   - DemoAuthProvider:  no Clerk keys → single demo user + org (dev behavior)
//   - ClerkAuthProvider: CLERK_SECRET_KEY set → verify Clerk session token,
//     map the Clerk user to a Pulse User + Membership, derive org + role.
//
// The Fastify hook (plugin.ts) attaches the resolved context to request.authContext.
// Routes read organizationId / userId / role from there — never the demo fallback
// directly anymore.

import type { FastifyRequest } from "fastify";
import { createClerkClient, verifyToken } from "@clerk/backend";
import type { OrgRole } from "@prisma/client";
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

// ---------- Demo provider ----------

let demoContextCache: AuthContext | null = null;

async function resolveDemoContext(): Promise<AuthContext> {
  if (demoContextCache) return demoContextCache;
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    create: { slug: "demo", name: "Demo Organization", plan: "FREE" },
    update: {}
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

  // Resolve email — prefer claim, fall back to Clerk API.
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

  // Upsert Pulse user keyed by Clerk subject (stored as email-or-external mapping).
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: email.split("@")[0] },
    update: {}
  });

  // Resolve organization. If Clerk org present, map it; otherwise use/create a personal org.
  const orgSlug = claims.org_slug ?? `clerk-${claims.org_id ?? claims.sub}`.slice(0, 48);
  const orgName = claims.org_slug ?? "Personal";
  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    create: { slug: orgSlug, name: orgName, plan: "FREE" },
    update: {}
  });

  const role = mapClerkRole(claims.org_role);
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: { userId: user.id, organizationId: org.id, role, acceptedAt: new Date() },
    update: { role }
  });

  return { userId: user.id, organizationId: org.id, role, email, source: "clerk" };
}

export async function resolveAuthContext(request: FastifyRequest): Promise<AuthContext> {
  if (isClerkConfigured()) {
    const ctx = await resolveClerkContext(request);
    if (ctx) return ctx;
    // Clerk configured but no/invalid token → unauthenticated.
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
