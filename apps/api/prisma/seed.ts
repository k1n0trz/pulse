import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    create: {
      slug: "demo",
      name: "Demo Organization",
      plan: "FREE"
    },
    update: {}
  });

  await prisma.policy.upsert({
    where: { id: "policy_demo_default" },
    create: {
      id: "policy_demo_default",
      organizationId: org.id,
      name: "Default",
      mode: "ASSISTED",
      targetCpa: 300,
      targetRoas: 3,
      maxDailyBudgetIncreasePercent: 20,
      maxDailySpend: 200000,
      maxDailyChanges: 8,
      killSwitch: false,
      blockedCriticalCampaigns: true
    },
    update: {}
  });

  console.log("Seed completed. Organization:", org.slug);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
