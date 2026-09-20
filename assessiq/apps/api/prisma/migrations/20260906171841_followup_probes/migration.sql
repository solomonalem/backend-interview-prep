-- CreateEnum
CREATE TYPE "ProbesMode" AS ENUM ('off', 'flagged_only', 'all');

-- CreateEnum
CREATE TYPE "ProbeStatus" AS ENUM ('generated', 'answered', 'unanswered', 'generation_failed');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "probe_time_seconds" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "probes_mode" "ProbesMode" NOT NULL DEFAULT 'off';

-- CreateTable
CREATE TABLE "probes" (
    "id" TEXT NOT NULL,
    "answer_id" TEXT NOT NULL,
    "text" TEXT,
    "status" "ProbeStatus" NOT NULL DEFAULT 'generated',
    "candidate_answer" TEXT,
    "time_spent_ms" INTEGER,
    "defense_core_pct" INTEGER,
    "defense_senior_signal_pct" INTEGER,
    "defense_core_reasoning" TEXT,
    "defense_senior_reasoning" TEXT,
    "defense_pct" INTEGER,
    "model_used" TEXT,
    "scored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "probes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "probes_answer_id_key" ON "probes"("answer_id");

-- AddForeignKey
ALTER TABLE "probes" ADD CONSTRAINT "probes_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
