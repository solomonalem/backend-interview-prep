-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('vetted', 'draft');

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "status" "QuestionStatus" NOT NULL DEFAULT 'vetted';

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");
