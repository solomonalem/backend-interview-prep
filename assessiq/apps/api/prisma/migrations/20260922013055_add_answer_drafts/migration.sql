-- CreateEnum
CREATE TYPE "AnswerSource" AS ENUM ('submitted', 'draft_at_expiry');

-- AlterEnum
ALTER TYPE "BehaviorEventType" ADD VALUE 'late_write';

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "source" "AnswerSource" NOT NULL DEFAULT 'submitted';

-- CreateTable
CREATE TABLE "answer_drafts" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "snippet_code" TEXT,
    "snippet_language" TEXT,
    "saved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answer_drafts_session_id_idx" ON "answer_drafts"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_drafts_session_id_question_id_key" ON "answer_drafts"("session_id", "question_id");

-- AddForeignKey
ALTER TABLE "answer_drafts" ADD CONSTRAINT "answer_drafts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_drafts" ADD CONSTRAINT "answer_drafts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
