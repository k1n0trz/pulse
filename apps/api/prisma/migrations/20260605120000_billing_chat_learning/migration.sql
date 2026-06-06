-- Fase 2 · MercadoPago billing fields on Organization
ALTER TABLE "Organization" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "Organization" ADD COLUMN "mpPreapprovalId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "mpPayerEmail" TEXT;

CREATE UNIQUE INDEX "Organization_mpPreapprovalId_key" ON "Organization"("mpPreapprovalId");

-- Fase 9 · Per-rule learning weights
CREATE TABLE "RuleWeight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "samples" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleWeight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RuleWeight_organizationId_idx" ON "RuleWeight"("organizationId");

CREATE UNIQUE INDEX "RuleWeight_organizationId_rule_key" ON "RuleWeight"("organizationId", "rule");

-- Fase 5 · Chat conversations + messages
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nueva conversación',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversation_organizationId_userId_updatedAt_idx" ON "Conversation"("organizationId", "userId", "updatedAt");

CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "toolEvents" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
