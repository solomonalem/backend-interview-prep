-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('manual', 'generated', 'repo_grounded');

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "repo_finding_id" TEXT,
ADD COLUMN     "source" "QuestionSource" NOT NULL DEFAULT 'manual';

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_repo_finding_id_fkey" FOREIGN KEY ("repo_finding_id") REFERENCES "repo_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
