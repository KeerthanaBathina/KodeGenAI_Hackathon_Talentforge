-- AlterTable
ALTER TABLE "approval_policies" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "effectiveFrom" TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone;

-- CreateTable
CREATE TABLE "scoring_thresholds" (
    "id" UUID NOT NULL,
    "jobFamilyId" UUID NOT NULL,
    "aiShortlistThreshold" DECIMAL(5,4) NOT NULL,
    "confidenceThreshold" DECIMAL(5,4) NOT NULL,
    "experienceThresholdYears" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMPTZ NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_scoring_thresholds_jf_effective" ON "scoring_thresholds"("jobFamilyId", "effectiveFrom" DESC);

-- CreateIndex
CREATE INDEX "idx_approval_policies_band_effective" ON "approval_policies"("compensationBandMin", "compensationBandMax", "effectiveFrom" DESC);

-- AddForeignKey
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_thresholds" ADD CONSTRAINT "scoring_thresholds_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "job_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_thresholds" ADD CONSTRAINT "scoring_thresholds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

