// Competitive intelligence (Fase 6) — queries the Meta Ad Library for ACTIVE ads
// matching a search term, so operators can see what similar brands are running.
//
// The Ad Library API (`/ads_archive`) requires an approved app + identity
// confirmation and, outside the EU, is limited to issue/political ads. When the
// live call isn't available we fall back to a clearly-labelled demo dataset so
// the panel is always functional and the upgrade path is automatic.

import { graphPaginate } from "./graphClient.js";
import { prisma } from "../db/prisma.js";
import { decryptString } from "../lib/crypto.js";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const env = loadEnv();

export interface CompetitorAd {
  pageName: string;
  body: string;
  linkTitle: string | null;
  snapshotUrl: string | null;
  platforms: string[];
}

export interface CompetitiveInsights {
  totalAds: number;
  topAdvertisers: Array<{ pageName: string; ads: number }>;
  platforms: Array<{ platform: string; ads: number }>;
}

export interface CompetitiveResult {
  source: "live" | "demo";
  query: string;
  country: string;
  ads: CompetitorAd[];
  insights: CompetitiveInsights;
  note?: string;
}

interface AdArchiveRow {
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
}

async function activeToken(organizationId: string): Promise<string | null> {
  const conn = await prisma.metaConnection.findFirst({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" }
  });
  return conn ? decryptString(conn.accessTokenEnc) : null;
}

function normalize(row: AdArchiveRow): CompetitorAd {
  return {
    pageName: row.page_name ?? "—",
    body: row.ad_creative_bodies?.[0] ?? "",
    linkTitle: row.ad_creative_link_titles?.[0] ?? null,
    snapshotUrl: row.ad_snapshot_url ?? null,
    platforms: row.publisher_platforms ?? []
  };
}

function summarize(ads: CompetitorAd[]): CompetitiveInsights {
  const byAdvertiser = new Map<string, number>();
  const byPlatform = new Map<string, number>();
  for (const ad of ads) {
    byAdvertiser.set(ad.pageName, (byAdvertiser.get(ad.pageName) ?? 0) + 1);
    for (const p of ad.platforms) byPlatform.set(p, (byPlatform.get(p) ?? 0) + 1);
  }
  const topAdvertisers = [...byAdvertiser.entries()]
    .map(([pageName, count]) => ({ pageName, ads: count }))
    .sort((a, b) => b.ads - a.ads)
    .slice(0, 6);
  const platforms = [...byPlatform.entries()]
    .map(([platform, count]) => ({ platform, ads: count }))
    .sort((a, b) => b.ads - a.ads);
  return { totalAds: ads.length, topAdvertisers, platforms };
}

function demoResult(query: string, country: string, note: string): CompetitiveResult {
  const ads: CompetitorAd[] = [
    { pageName: "Marca Líder A", body: `Descubre nuestra nueva colección de ${query}. Envío gratis esta semana.`, linkTitle: "Compra ahora", snapshotUrl: null, platforms: ["facebook", "instagram"] },
    { pageName: "Competidor B", body: `${query} con 30% de descuento. Solo por tiempo limitado.`, linkTitle: "Ver oferta", snapshotUrl: null, platforms: ["instagram"] },
    { pageName: "Competidor B", body: `Testimonios reales de clientes usando ${query}.`, linkTitle: "Conoce más", snapshotUrl: null, platforms: ["facebook", "messenger"] },
    { pageName: "Tienda C", body: `Guía: cómo elegir el mejor ${query} para ti.`, linkTitle: "Leer guía", snapshotUrl: null, platforms: ["facebook"] },
    { pageName: "Marca Líder A", body: `Reels mostrando ${query} en acción. ¡Míralo!`, linkTitle: "Ver video", snapshotUrl: null, platforms: ["instagram"] }
  ];
  return { source: "demo", query, country, ads, insights: summarize(ads), note };
}

export interface SearchCompetitorsInput {
  organizationId: string;
  searchTerms: string;
  country?: string;
  limit?: number;
}

export async function searchCompetitorAds(input: SearchCompetitorsInput): Promise<CompetitiveResult> {
  const country = (input.country ?? "CO").toUpperCase();
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
  const query = input.searchTerms.trim();

  const token = await activeToken(input.organizationId);
  if (!token) {
    return demoResult(query, country, "Conecta una cuenta de Meta para consultar el Ad Library real.");
  }

  try {
    const rows = await graphPaginate<AdArchiveRow>(
      "/ads_archive",
      {
        accessToken: token,
        appsecretProofSecret: env.META_APP_SECRET,
        query: {
          search_terms: query,
          ad_reached_countries: JSON.stringify([country]),
          ad_active_status: "ACTIVE",
          ad_type: "ALL",
          fields: "page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,publisher_platforms",
          limit
        }
      },
      { limit, maxPages: 1 }
    );
    const ads = rows.map(normalize);
    return { source: "live", query, country, ads, insights: summarize(ads) };
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "Ad Library query failed; serving demo data");
    return demoResult(query, country, `El Ad Library no está disponible para esta cuenta (${(error as Error).message}). Requiere acceso aprobado por Meta.`);
  }
}
