-- CreateTable
CREATE TABLE "report_shares" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "report_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_shares_token_key" ON "report_shares"("token");

-- CreateIndex
CREATE INDEX "report_shares_session_id_idx" ON "report_shares"("session_id");

-- AddForeignKey
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
