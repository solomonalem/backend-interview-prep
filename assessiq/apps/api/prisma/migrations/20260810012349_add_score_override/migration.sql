-- CreateEnum
CREATE TYPE "OverrideFlag" AS ENUM ('adjusted', 'disagree');

-- AlterTable
ALTER TABLE "scores" ADD COLUMN     "overridden_at" TIMESTAMP(3),
ADD COLUMN     "overridden_by" TEXT,
ADD COLUMN     "overridden_core_pct" INTEGER,
ADD COLUMN     "overridden_evidence_pct" INTEGER,
ADD COLUMN     "overridden_senior_signal_pct" INTEGER,
ADD COLUMN     "overridden_total_pct" INTEGER,
ADD COLUMN     "overridden_trap_pct" INTEGER,
ADD COLUMN     "override_flag" "OverrideFlag",
ADD COLUMN     "override_note" TEXT;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
