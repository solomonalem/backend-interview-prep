-- AlterEnum
ALTER TYPE "QuestionSource" ADD VALUE 'document_grounded';

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "grounding_document_id" TEXT;

-- CreateTable
CREATE TABLE "grounding_documents" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "elicitation_qa" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grounding_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grounding_documents_owner_id_idx" ON "grounding_documents"("owner_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_grounding_document_id_fkey" FOREIGN KEY ("grounding_document_id") REFERENCES "grounding_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grounding_documents" ADD CONSTRAINT "grounding_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
