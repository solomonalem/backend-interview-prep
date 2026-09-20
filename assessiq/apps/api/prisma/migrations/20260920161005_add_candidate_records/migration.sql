-- AlterTable
ALTER TABLE "assessment_links" ADD COLUMN     "candidate_id" TEXT;

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidates_owner_id_idx" ON "candidates"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_owner_id_email_key" ON "candidates"("owner_id", "email");

-- CreateIndex
CREATE INDEX "assessment_links_candidate_id_idx" ON "assessment_links"("candidate_id");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_links" ADD CONSTRAINT "assessment_links_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL — every link ever emailed becomes a candidate record.
--
-- Run here rather than as a separate script so it cannot be forgotten: it
-- executes exactly once, in the same transaction as the columns it fills, on
-- every environment that runs migrations. The cost is that ids come from
-- gen_random_uuid() rather than cuid() — backfilled rows are recognisable by
-- their id shape, which is harmless and arguably useful.
--
-- The NAME is chosen carefully. Most links carry an auto-generated label
-- ("Candidate 3"), which is a handle for a link and a terrible name for a
-- person, so a record only takes the label when a human actually typed one;
-- otherwise it takes the email's local part. A real name wins over an
-- auto-label regardless of which link came first.
INSERT INTO "candidates" ("id", "owner_id", "name", "email", "created_at", "updated_at")
SELECT gen_random_uuid()::text, src.owner_id, src.name, src.email, src.first_seen, NOW()
FROM (
  SELECT DISTINCT ON (a."owner_id", lower(btrim(l."candidate_email")))
    a."owner_id" AS owner_id,
    lower(btrim(l."candidate_email")) AS email,
    CASE
      WHEN btrim(COALESCE(l."candidate_label", '')) = ''
        OR btrim(l."candidate_label") ~ '^Candidate [0-9]+$'
      THEN split_part(lower(btrim(l."candidate_email")), '@', 1)
      ELSE btrim(l."candidate_label")
    END AS name,
    l."created_at" AS first_seen
  FROM "assessment_links" l
  JOIN "assessments" a ON a."id" = l."assessment_id"
  WHERE l."candidate_email" IS NOT NULL AND btrim(l."candidate_email") <> ''
  ORDER BY
    a."owner_id",
    lower(btrim(l."candidate_email")),
    -- a human-typed label first, then oldest link
    (btrim(COALESCE(l."candidate_label", '')) = '' OR btrim(l."candidate_label") ~ '^Candidate [0-9]+$'),
    l."created_at"
) src
ON CONFLICT ("owner_id", "email") DO NOTHING;

-- Attach every emailed link to its record. Links with no email stay standalone,
-- which is the correct outcome: without an email there is no identity to file
-- them under, and guessing one from a label would invent a person.
UPDATE "assessment_links" l
SET "candidate_id" = c."id"
FROM "assessments" a, "candidates" c
WHERE a."id" = l."assessment_id"
  AND l."candidate_email" IS NOT NULL
  AND c."owner_id" = a."owner_id"
  AND c."email" = lower(btrim(l."candidate_email"))
  AND l."candidate_id" IS NULL;
