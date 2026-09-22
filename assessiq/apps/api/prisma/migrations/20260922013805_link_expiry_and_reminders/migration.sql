-- AlterTable
ALTER TABLE "assessment_links" ADD COLUMN     "auto_reminder_sent_at" TIMESTAMP(3),
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3),
ALTER COLUMN "expires_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "auto_reminder_days" INTEGER;
