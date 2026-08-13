-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('queued', 'cloning', 'analyzing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "FindingKind" AS ENUM ('stack', 'pattern', 'risk', 'architecture', 'domain');

-- CreateTable
CREATE TABLE "repo_scans" (
    "id" TEXT NOT NULL,
    "repo_ref_id" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'queued',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "stats" JSONB,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repo_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_findings" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "kind" "FindingKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "file_path" TEXT,
    "line_start" INTEGER,
    "line_end" INTEGER,
    "excerpt" TEXT,
    "used_in_questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repo_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repo_scans_repo_ref_id_idx" ON "repo_scans"("repo_ref_id");

-- CreateIndex
CREATE INDEX "repo_findings_scan_id_idx" ON "repo_findings"("scan_id");

-- CreateIndex
CREATE INDEX "repo_findings_kind_idx" ON "repo_findings"("kind");

-- AddForeignKey
ALTER TABLE "repo_scans" ADD CONSTRAINT "repo_scans_repo_ref_id_fkey" FOREIGN KEY ("repo_ref_id") REFERENCES "repo_refs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_findings" ADD CONSTRAINT "repo_findings_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "repo_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
