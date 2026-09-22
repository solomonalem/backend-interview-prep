-- AlterTable
ALTER TABLE "assessment_questions" ADD COLUMN     "snapshot_core_answer_guide" TEXT,
ADD COLUMN     "snapshot_evidence_guide" TEXT,
ADD COLUMN     "snapshot_senior_signal_guide" TEXT,
ADD COLUMN     "snapshot_text" TEXT,
ADD COLUMN     "snapshot_trap_guide" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
