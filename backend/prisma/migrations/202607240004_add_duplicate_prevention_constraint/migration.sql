-- CreateIndex: Add partial unique index to prevent duplicate active applications
-- This constraint ensures a candidate cannot have multiple active applications
-- for the same requisition. Terminal statuses (rejected, withdrawn, hired, closed)
-- are excluded to allow re-application after rejection (subject to cooling period).

CREATE UNIQUE INDEX "idx_unique_active_application" ON "applications"("candidate_id", "requisition_id")
WHERE "status" NOT IN ('rejected', 'withdrawn', 'hired', 'closed');
