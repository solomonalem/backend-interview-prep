-- AlterTable
ALTER TABLE "assessment_links" ADD COLUMN     "candidate_email" TEXT;

-- CreateIndex
CREATE INDEX "assessment_links_assessment_id_candidate_email_idx" ON "assessment_links"("assessment_id", "candidate_email");
