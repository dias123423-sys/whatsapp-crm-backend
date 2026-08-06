-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CALLING', 'BOOKED', 'FOLLOW_UP', 'NO_ANSWER', 'CLOSED');
CREATE TYPE "LeadSource" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'MANUAL', 'OTHER');
CREATE TYPE "LeadPeriod" AS ENUM ('DAY', 'NIGHT');
CREATE TYPE "WhatsAppStatus" AS ENUM ('ONLINE', 'OFFLINE', 'CONNECTING');
CREATE TYPE "AssignmentStrategy" AS ENUM ('ROUND_ROBIN', 'LEAST_BUSY', 'MANUAL');
CREATE TYPE "OperatorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable: users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable: operators
CREATE TABLE "operators" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "OperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operators_userId_key" ON "operators"("userId");

-- CreateTable: procedures
CREATE TABLE "procedures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "keywords" TEXT[],
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable: whatsapp_accounts
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "WhatsAppStatus" NOT NULL DEFAULT 'OFFLINE',
    "sessionData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_accounts_instanceName_key" ON "whatsapp_accounts"("instanceName");

-- CreateTable: clients
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'WHATSAPP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clients_phone_key" ON "clients"("phone");

-- CreateTable: leads
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "operatorId" TEXT,
    "procedureId" TEXT,
    "price" DOUBLE PRECISION,
    "source" "LeadSource" NOT NULL DEFAULT 'WHATSAPP',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "period" "LeadPeriod" NOT NULL DEFAULT 'DAY',
    "comment" TEXT,
    "result" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable: lead_history
CREATE TABLE "lead_history" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable: messages
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "whatsappAccountId" TEXT,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: calls
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,
    "result" TEXT,
    "notes" TEXT,
    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable: appointments
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "appointments_leadId_key" ON "appointments"("leadId");

-- CreateTable: reports
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "filePath" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable: assignment_config
CREATE TABLE "assignment_config" (
    "id" TEXT NOT NULL,
    "strategy" "AssignmentStrategy" NOT NULL DEFAULT 'ROUND_ROBIN',
    "lastIdx" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assignment_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "operators"      ADD CONSTRAINT "operators_userId_fkey"             FOREIGN KEY ("userId")            REFERENCES "users"("id")             ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads"          ADD CONSTRAINT "leads_clientId_fkey"               FOREIGN KEY ("clientId")          REFERENCES "clients"("id")           ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads"          ADD CONSTRAINT "leads_operatorId_fkey"             FOREIGN KEY ("operatorId")        REFERENCES "operators"("id")         ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads"          ADD CONSTRAINT "leads_procedureId_fkey"            FOREIGN KEY ("procedureId")       REFERENCES "procedures"("id")        ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_history"   ADD CONSTRAINT "lead_history_leadId_fkey"          FOREIGN KEY ("leadId")            REFERENCES "leads"("id")             ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages"       ADD CONSTRAINT "messages_clientId_fkey"            FOREIGN KEY ("clientId")          REFERENCES "clients"("id")           ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages"       ADD CONSTRAINT "messages_whatsappAccountId_fkey"   FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calls"          ADD CONSTRAINT "calls_leadId_fkey"                 FOREIGN KEY ("leadId")            REFERENCES "leads"("id")             ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs"     ADD CONSTRAINT "audit_logs_userId_fkey"            FOREIGN KEY ("userId")            REFERENCES "users"("id")             ON DELETE SET NULL ON UPDATE CASCADE;
