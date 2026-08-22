-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('active', 'revoked');

-- CreateTable
CREATE TABLE "repo_integrations" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'github',
    "installation_id" TEXT NOT NULL,
    "account_login" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'active',
    "strict_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repo_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_refs" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL,
    "last_scan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repo_refs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repo_integrations_owner_id_provider_key" ON "repo_integrations"("owner_id", "provider");

-- CreateIndex
CREATE INDEX "repo_refs_integration_id_idx" ON "repo_refs"("integration_id");

-- CreateIndex
CREATE UNIQUE INDEX "repo_refs_integration_id_full_name_key" ON "repo_refs"("integration_id", "full_name");

-- AddForeignKey
ALTER TABLE "repo_integrations" ADD CONSTRAINT "repo_integrations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_refs" ADD CONSTRAINT "repo_refs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "repo_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
