-- CreateTable
CREATE TABLE "assessment_templates" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "question_ids" TEXT[],
    "timer_minutes" INTEGER,
    "proctoring_config" JSONB,
    "probes_mode" "ProbesMode" NOT NULL DEFAULT 'flagged_only',
    "probe_time_seconds" INTEGER NOT NULL DEFAULT 90,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_templates_owner_id_idx" ON "assessment_templates"("owner_id");

-- AddForeignKey
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
