-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('junior', 'mid', 'senior', 'staff');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('conceptual', 'scenario', 'rca', 'design', 'behavioral');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('not_started', 'in_progress', 'submitted', 'expired');

-- CreateEnum
CREATE TYPE "ScoringStatus" AS ENUM ('pending', 'scoring', 'scored', 'failed');

-- CreateEnum
CREATE TYPE "ConfidenceFlag" AS ENUM ('well_calibrated', 'overconfident', 'underconfident');

-- CreateEnum
CREATE TYPE "BehaviorEventType" AS ENUM ('tab_switch', 'focus_loss', 'paste', 'idle');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('Strong_Senior', 'Approaching_Senior', 'Mid_Level', 'Junior');

-- CreateEnum
CREATE TYPE "PdfStatus" AS ENUM ('pending', 'generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "StudyRating" AS ENUM ('missed', 'partial', 'got_it');

-- CreateEnum
CREATE TYPE "StoryType" AS ENUM ('bug_fix', 'feature', 'incident', 'architecture');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "google_id" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "type" "QuestionType" NOT NULL,
    "domain" TEXT,
    "core_answer_guide" TEXT NOT NULL,
    "senior_signal_guide" TEXT NOT NULL,
    "trap_guide" TEXT NOT NULL,
    "evidence_guide" TEXT NOT NULL,
    "core_answer_display" TEXT NOT NULL,
    "senior_signal_display" TEXT NOT NULL,
    "trap_display" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "timer_enabled" BOOLEAN NOT NULL DEFAULT false,
    "timer_seconds" INTEGER,
    "proctoring_config" JSONB NOT NULL DEFAULT '{"track_tab_switches":true,"track_focus_loss":true,"detect_paste":true,"detect_idle":true,"tab_switch_flag_threshold":3}',
    "confidence_rating_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "candidate_label" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "opened_at" TIMESTAMP(3),
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "candidate_label" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'not_started',
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "auto_submitted" BOOLEAN NOT NULL DEFAULT false,
    "session_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "confidence_rating" INTEGER,
    "time_spent_ms" INTEGER NOT NULL,
    "paste_detected" BOOLEAN NOT NULL DEFAULT false,
    "paste_char_count" INTEGER,
    "scoring_status" "ScoringStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" TEXT NOT NULL,
    "answer_id" TEXT NOT NULL,
    "core_pct" INTEGER NOT NULL,
    "senior_signal_pct" INTEGER NOT NULL,
    "trap_pct" INTEGER NOT NULL,
    "evidence_pct" INTEGER NOT NULL,
    "core_reasoning" TEXT NOT NULL,
    "senior_signal_reasoning" TEXT NOT NULL,
    "trap_reasoning" TEXT NOT NULL,
    "evidence_reasoning" TEXT NOT NULL,
    "total_pct" INTEGER NOT NULL,
    "what_was_hit" TEXT[],
    "what_was_missed" TEXT[],
    "recommended_probe" TEXT NOT NULL,
    "confidence_flag" "ConfidenceFlag",
    "model_used" TEXT NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" "BehaviorEventType" NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "question_index" INTEGER NOT NULL,
    "char_count" INTEGER,
    "idle_duration_ms" INTEGER,

    CONSTRAINT "behavior_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "overall_pct" INTEGER NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "tab_switch_count" INTEGER NOT NULL,
    "focus_loss_count" INTEGER NOT NULL,
    "paste_count" INTEGER NOT NULL,
    "idle_count" INTEGER NOT NULL,
    "proctoring_context" TEXT NOT NULL,
    "pdf_url" TEXT,
    "pdf_status" "PdfStatus" NOT NULL DEFAULT 'pending',
    "email_sent_at" TIMESTAMP(3),
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "rating" "StudyRating" NOT NULL,
    "next_review" TIMESTAMP(3) NOT NULL,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "StoryType" NOT NULL,
    "situation" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "questions_topic_idx" ON "questions"("topic");

-- CreateIndex
CREATE INDEX "questions_difficulty_idx" ON "questions"("difficulty");

-- CreateIndex
CREATE INDEX "questions_domain_idx" ON "questions"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessment_id_position_key" ON "assessment_questions"("assessment_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessment_id_question_id_key" ON "assessment_questions"("assessment_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_links_token_key" ON "assessment_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_links_session_id_key" ON "assessment_links"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_assessment_id_idx" ON "sessions"("assessment_id");

-- CreateIndex
CREATE INDEX "answers_session_id_idx" ON "answers"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_session_id_question_id_key" ON "answers"("session_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "scores_answer_id_key" ON "scores"("answer_id");

-- CreateIndex
CREATE INDEX "behavior_events_session_id_idx" ON "behavior_events"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_session_id_key" ON "reports"("session_id");

-- CreateIndex
CREATE INDEX "study_progress_user_id_next_review_idx" ON "study_progress"("user_id", "next_review");

-- CreateIndex
CREATE UNIQUE INDEX "study_progress_user_id_question_id_key" ON "study_progress"("user_id", "question_id");

-- CreateIndex
CREATE INDEX "stories_user_id_idx" ON "stories"("user_id");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_links" ADD CONSTRAINT "assessment_links_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_links" ADD CONSTRAINT "assessment_links_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_events" ADD CONSTRAINT "behavior_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
