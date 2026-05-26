import type { AutopilotPolicy, Campaign, DailyMetric } from "@pulse/shared";

const days = ["26 Abr", "27 Abr", "28 Abr", "29 Abr", "30 Abr", "1 May", "2 May"];

function makeMetrics(seed: {
  spend: number;
  cpa: number;
  roas: number;
  ctr: number;
  cpm: number;
  conversions: number;
  frequency: number;
}): DailyMetric[] {
  return days.map((date, index) => {
    const drift = index - 3;
    return {
      date,
      spend: Math.max(0, Math.round(seed.spend + drift * seed.spend * 0.06)),
      results: Math.max(0, Math.round(seed.conversions + drift * 3)),
      cpa: Math.max(1, Math.round(seed.cpa + drift * seed.cpa * 0.025)),
      roas: Number(Math.max(0, seed.roas + drift * 0.12).toFixed(2)),
      ctr: Number(Math.max(0.1, seed.ctr + drift * 0.05).toFixed(2)),
      cpm: Number(Math.max(1, seed.cpm + drift * 0.45).toFixed(2)),
      conversions: Math.max(0, Math.round(seed.conversions + drift * 2)),
      frequency: Number(Math.max(0.5, seed.frequency + drift * 0.08).toFixed(2))
    };
  });
}

export const defaultPolicy: AutopilotPolicy = {
  targetCpa: 300,
  targetRoas: 3,
  maxDailyBudgetIncreasePercent: 20,
  maxDailySpend: 200000,
  maxDailyChanges: 8,
  killSwitch: false,
  blockedCriticalCampaigns: true
};

export const mockCampaigns: Campaign[] = [
  {
    id: "cmp_black_friday",
    name: "Black Friday | CBO",
    objective: "Ventas",
    status: "active",
    budget: 100000,
    spend: 152430,
    results: 512,
    cpa: 297,
    roas: 3.85,
    ctr: 2.41,
    cpm: 18.7,
    frequency: 2.2,
    phase: "active",
    critical: false,
    metrics: makeMetrics({ spend: 22000, cpa: 294, roas: 3.75, ctr: 2.35, cpm: 18.4, conversions: 74, frequency: 2.1 })
  },
  {
    id: "cmp_leads_advantage",
    name: "Leads | Advantage+",
    objective: "Leads",
    status: "active",
    budget: 60000,
    spend: 78230,
    results: 680,
    cpa: 115,
    roas: 2.12,
    ctr: 1.87,
    cpm: 13.4,
    frequency: 1.9,
    phase: "active",
    critical: false,
    metrics: makeMetrics({ spend: 11200, cpa: 118, roas: 2.1, ctr: 1.85, cpm: 13.4, conversions: 97, frequency: 1.9 })
  },
  {
    id: "cmp_interest_cold",
    name: "Interes Frio 25-65",
    objective: "Ventas",
    status: "limited",
    budget: 80000,
    spend: 96872,
    results: 154,
    cpa: 629,
    roas: 1.12,
    ctr: 1.12,
    cpm: 26.8,
    frequency: 3.35,
    phase: "learning",
    critical: false,
    learningLimited: true,
    metrics: [
      ...makeMetrics({ spend: 16000, cpa: 610, roas: 1.08, ctr: 1.08, cpm: 26.2, conversions: 0, frequency: 3.2 }).slice(0, 4),
      { date: "30 Abr", spend: 18600, results: 0, cpa: 635, roas: 1.05, ctr: 1.08, cpm: 27.1, conversions: 0, frequency: 3.28 },
      { date: "1 May", spend: 19320, results: 0, cpa: 642, roas: 1.02, ctr: 1.02, cpm: 27.6, conversions: 0, frequency: 3.41 },
      { date: "2 May", spend: 20100, results: 0, cpa: 651, roas: 0.98, ctr: 0.97, cpm: 28.4, conversions: 0, frequency: 3.62 }
    ]
  },
  {
    id: "cmp_remarketing_7d",
    name: "Remarketing | 7 dias",
    objective: "Ventas",
    status: "active",
    budget: 40000,
    spend: 32540,
    results: 96,
    cpa: 339,
    roas: 5.21,
    ctr: 2.91,
    cpm: 16.1,
    frequency: 2.95,
    phase: "winner",
    critical: false,
    metrics: [
      ...makeMetrics({ spend: 5200, cpa: 330, roas: 4.6, ctr: 2.65, cpm: 15.2, conversions: 12, frequency: 2.65 }).slice(0, 4),
      { date: "30 Abr", spend: 5700, results: 18, cpa: 285, roas: 4.95, ctr: 2.82, cpm: 15.8, conversions: 18, frequency: 2.74 },
      { date: "1 May", spend: 6100, results: 21, cpa: 272, roas: 5.31, ctr: 2.94, cpm: 16.1, conversions: 21, frequency: 2.84 },
      { date: "2 May", spend: 6500, results: 22, cpa: 268, roas: 5.62, ctr: 3.06, cpm: 16.5, conversions: 22, frequency: 2.96 }
    ]
  },
  {
    id: "cmp_traffic_site",
    name: "Trafico | Sitio Web",
    objective: "Trafico",
    status: "active",
    budget: 30000,
    spend: 18450,
    results: 1250,
    cpa: 15,
    roas: 0,
    ctr: 3.45,
    cpm: 9.8,
    frequency: 1.42,
    phase: "active",
    critical: false,
    metrics: makeMetrics({ spend: 2700, cpa: 15, roas: 0, ctr: 3.45, cpm: 9.8, conversions: 0, frequency: 1.42 })
  }
];

export const accountTrend = days.map((date, index) => ({
  date,
  spend: [82000, 176000, 168000, 230000, 268000, 286000, 258000][index],
  roas: [4.2, 4.4, 5.7, 5.9, 5.0, 4.55, 4.25][index],
  cpa: [380, 340, 318, 305, 331, 326, 321][index],
  conversions: [320, 520, 610, 730, 690, 715, 690][index]
}));
