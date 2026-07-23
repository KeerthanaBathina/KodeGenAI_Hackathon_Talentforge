-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('candidate', 'recruiter', 'hr_reviewer', 'hr_manager', 'tech_interviewer', 'admin');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('pending', 'active', 'anonymized');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('draft', 'open', 'closed', 'filled', 'cancelled');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('full_time', 'part_time', 'contract', 'internship');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('submitted', 'screening', 'pending_review', 'shortlisted', 'rejected', 'withdrawn', 'interviewing', 'offer_pending', 'offered', 'hired', 'closed');

-- CreateEnum
CREATE TYPE "ApplicationPath" AS ENUM ('fresher', 'experienced');

-- CreateEnum
CREATE TYPE "ResumeScanStatus" AS ENUM ('pending', 'clean', 'infected');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('shortlisted', 'rejected', 'hold');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('aptitude', 'coding', 'technical');

-- CreateEnum
CREATE TYPE "InterviewStageType" AS ENUM ('aptitude', 'coding', 'technical', 'hr');

-- CreateEnum
CREATE TYPE "InterviewStageState" AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "ScorecardRecommendation" AS ENUM ('strong_yes', 'yes', 'no', 'strong_no');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('offer', 'reject', 'hold', 'withdraw');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('email', 'sms');

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('queued', 'sent', 'delivered', 'bounced', 'failed');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('offer', 'rejection', 'screening_invite', 'interview_invite', 'assessment_invite', 'withdrawal_ack', 'general');

-- CreateEnum
CREATE TYPE "ReasonCodeCategory" AS ENUM ('rejection', 'withdrawal', 'interview_cancellation', 'decision');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "fullName" VARCHAR(255) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "consentVersion" VARCHAR(20) NOT NULL,
    "consentTimestamp" TIMESTAMP(3) NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "fullName" VARCHAR(255) NOT NULL,
    "experienceYears" INTEGER NOT NULL,
    "skills" TEXT[],
    "education" JSONB NOT NULL,
    "rawParseJson" JSONB NOT NULL,
    "editedById" UUID,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_families" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "thresholdVersion" INTEGER NOT NULL DEFAULT 1,
    "matchScoreThreshold" INTEGER NOT NULL,
    "confidenceThreshold" DECIMAL(5,4) NOT NULL,
    "experienceThresholdYears" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reason_codes" (
    "id" UUID NOT NULL,
    "category" "ReasonCodeCategory" NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "displayText" VARCHAR(255) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reason_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "TemplateType" NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject" VARCHAR(500) NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_policies" (
    "id" UUID NOT NULL,
    "compensationBandMin" DECIMAL(12,2) NOT NULL,
    "compensationBandMax" DECIMAL(12,2) NOT NULL,
    "requiredApprovers" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisitions" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "department" VARCHAR(100) NOT NULL,
    "jobFamilyId" UUID NOT NULL,
    "location" VARCHAR(255) NOT NULL,
    "jobType" "JobType" NOT NULL,
    "slots" INTEGER NOT NULL,
    "filledSlots" INTEGER NOT NULL DEFAULT 0,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'draft',
    "eligibilityCriteria" JSONB NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "requisitionId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "path" "ApplicationPath",
    "pathOverridden" BOOLEAN NOT NULL DEFAULT false,
    "pathOverrideJustification" TEXT,
    "pathOverrideApproverId" UUID,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "storageKey" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "scanStatus" "ResumeScanStatus" NOT NULL DEFAULT 'pending',
    "scanResult" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screenings" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "modelVersion" VARCHAR(50) NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "factorsJson" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "screenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "reasonCodeId" UUID,
    "notes" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "providerRef" VARCHAR(255) NOT NULL,
    "score" DECIMAL(6,2),
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_stages" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "type" "InterviewStageType" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "timezone" VARCHAR(50) NOT NULL,
    "panelMembers" UUID[],
    "state" "InterviewStageState" NOT NULL DEFAULT 'scheduled',
    "reasonCodeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecards" (
    "id" UUID NOT NULL,
    "interviewStageId" UUID NOT NULL,
    "interviewerId" UUID NOT NULL,
    "rubricJson" JSONB NOT NULL,
    "recommendation" "ScorecardRecommendation" NOT NULL,
    "comments" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "reasonCodeId" UUID,
    "compensationBand" VARCHAR(50),
    "offerDetails" JSONB,
    "decidedById" UUID NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "decisionId" UUID NOT NULL,
    "approverId" UUID NOT NULL,
    "tier" VARCHAR(50) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "comments" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "providerName" VARCHAR(50) NOT NULL,
    "messageId" VARCHAR(255),
    "status" "CommunicationStatus" NOT NULL DEFAULT 'queued',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "eventType" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ipAddress" INET,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_email_key" ON "candidates"("email");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_phone_key" ON "candidates"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_candidateId_key" ON "profiles"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "reason_codes_category_code_key" ON "reason_codes"("category", "code");

-- CreateIndex
CREATE UNIQUE INDEX "templates_type_locale_version_key" ON "templates"("type", "locale", "version");

-- CreateIndex
CREATE INDEX "idx_applications_requisition_status" ON "applications"("requisitionId", "status");

-- CreateIndex
CREATE INDEX "idx_applications_candidate_status" ON "applications"("candidateId", "status");

-- CreateIndex
CREATE INDEX "idx_applications_status_submitted_at" ON "applications"("status", "submittedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "resumes_applicationId_key" ON "resumes"("applicationId");

-- CreateIndex
CREATE INDEX "idx_screenings_application_version" ON "screenings"("applicationId", "version" DESC);

-- CreateIndex
CREATE INDEX "idx_reviews_application_decided_at" ON "reviews"("applicationId", "decidedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_interview_stages_application_type" ON "interview_stages"("applicationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "decisions_applicationId_key" ON "decisions"("applicationId");

-- CreateIndex
CREATE INDEX "idx_communications_application_status" ON "communications"("applicationId", "status");

-- CreateIndex
CREATE INDEX "idx_audit_events_entity" ON "audit_events"("entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_events_actor" ON "audit_events"("actorId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_families" ADD CONSTRAINT "job_families_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "job_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_pathOverrideApproverId_fkey" FOREIGN KEY ("pathOverrideApproverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reasonCodeId_fkey" FOREIGN KEY ("reasonCodeId") REFERENCES "reason_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_stages" ADD CONSTRAINT "interview_stages_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_stages" ADD CONSTRAINT "interview_stages_reasonCodeId_fkey" FOREIGN KEY ("reasonCodeId") REFERENCES "reason_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interviewStageId_fkey" FOREIGN KEY ("interviewStageId") REFERENCES "interview_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_reasonCodeId_fkey" FOREIGN KEY ("reasonCodeId") REFERENCES "reason_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

