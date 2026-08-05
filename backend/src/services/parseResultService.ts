import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import { enqueueScreening } from '../queues/screeningQueue';
import { calculateProfileCompletion } from './profileService';
import logger from '../utils/logger';

export interface ParsedResumeData {
    name: string;
    email: string;
    phone: string;
    skills: string[];
    experience_years: number;
    employers: Array<{
        name: string;
        title: string;
        duration?: string;
    }>;
    education: Array<{
        degree: string;
        field: string;
        institution: string;
    }>;
    raw_text?: string;
    extracted_at: string;
}

export interface ParseResultPayload {
    resumeId: string;
    status: 'success' | 'failed';
    parsedData?: ParsedResumeData;
    error?: string;
}

export class ParseResultError extends Error {
    code: string;
    statusCode: number;

    constructor(message: string, code: string, statusCode: number = 500) {
        super(message);
        this.name = 'ParseResultError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

type ProfilePopulationStatus = 'pending_consent' | 'pending_profile_sync' | 'applied';

type PopulationSource = 'parse_webhook' | 'consent_accept';

interface ProfileSyncResult {
    profileId: string;
    createdProfile: boolean;
    addedSkillsCount: number;
    totalSkills: number;
    populatedFields: string[];
}

interface ParseMergeSummary {
    source: PopulationSource;
    appliedAt: string;
    createdProfile: boolean;
    populatedFields: string[];
    addedSkillsCount: number;
    totalSkills: number;
    importedEducationEntries: number;
    importedWorkHistoryEntries: number;
    importedExperienceYears: boolean;
    importedFullName: boolean;
}

interface ProfileEducationEntry {
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    startDate: string;
    endDate?: string | null;
    isCurrent: boolean;
}

interface ProfileWorkHistoryEntry {
    company: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    description?: string;
    isCurrent: boolean;
}

interface LatestProfilePopulationResult {
    status:
        | 'applied'
        | 'already_applied'
        | 'no_active_consent'
        | 'no_parsed_resume'
        | 'invalid_parsed_resume';
    resumeId?: string;
    profileId?: string;
}

function normalizeSkill(skill: string): string {
    return skill.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function coerceStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function coerceNonNegativeInt(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        return 0;
    }

    return Math.floor(value);
}

function coerceEmployers(value: unknown): ParsedResumeData['employers'] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item) => {
            const employerName = coerceString(item.name);
            const title = coerceString(item.title);
            const duration = coerceString(item.duration);

            return {
                name: employerName,
                title,
                ...(duration.length > 0 ? { duration } : {}),
            };
        })
        .filter((item) => item.name.length > 0 || item.title.length > 0);
}

function coerceEducation(value: unknown): ParsedResumeData['education'] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item) => ({
            degree: coerceString(item.degree),
            field: coerceString(item.field),
            institution: coerceString(item.institution),
        }))
        .filter(
            (item) =>
                item.degree.length > 0 ||
                item.field.length > 0 ||
                item.institution.length > 0
        );
}

function sanitizeParsedResumeData(parsedData: ParsedResumeData): ParsedResumeData {
    const extractedAt = coerceString(parsedData.extracted_at);
    const rawText = coerceString(parsedData.raw_text);

    return {
        name: coerceString(parsedData.name),
        email: coerceString(parsedData.email),
        phone: coerceString(parsedData.phone),
        skills: coerceStringArray(parsedData.skills),
        experience_years: coerceNonNegativeInt(parsedData.experience_years),
        employers: coerceEmployers(parsedData.employers),
        education: coerceEducation(parsedData.education),
        ...(rawText.length > 0 ? { raw_text: rawText } : {}),
        extracted_at: extractedAt.length > 0 ? extractedAt : new Date().toISOString(),
    };
}

function parseStoredResumeData(value: unknown): ParsedResumeData | null {
    if (!isRecord(value)) {
        return null;
    }

    const extractedAt = coerceString(value.extracted_at);

    return {
        name: coerceString(value.name),
        email: coerceString(value.email),
        phone: coerceString(value.phone),
        skills: coerceStringArray(value.skills),
        experience_years: coerceNonNegativeInt(value.experience_years),
        employers: coerceEmployers(value.employers),
        education: coerceEducation(value.education),
        raw_text: coerceString(value.raw_text),
        extracted_at: extractedAt.length > 0 ? extractedAt : new Date().toISOString(),
    };
}

function shouldPopulateName(existingFullName: string, parsedName: string, fallbackEmail: string): boolean {
    const normalizedParsed = parsedName.trim();
    if (normalizedParsed.length === 0) {
        return false;
    }

    const normalizedExisting = existingFullName.trim();
    if (normalizedExisting.length === 0) {
        return true;
    }

    if (normalizedExisting.includes('@')) {
        return true;
    }

    return normalizedExisting.toLowerCase() === fallbackEmail.trim().toLowerCase();
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

function getArrayLength(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
}

function hasArtifactMarkers(value: string): boolean {
    const markers = [
        '%pdf',
        '/fontname',
        '/name',
        '/f1',
        '/fontbbox',
        '/descent',
        '/ascent',
        '/filter',
        'endobj',
        'xref',
        'stream',
        'obj',
    ];

    const normalized = value.toLowerCase();
    if (value.includes('�')) {
        return true;
    }

    return markers.some((marker) => normalized.includes(marker));
}

function looksCorruptedText(value: string): boolean {
    const normalized = value.trim();
    if (!normalized) {
        return false;
    }

    if (hasArtifactMarkers(normalized)) {
        return true;
    }

    const letters = (normalized.match(/[A-Za-z]/g) ?? []).length;
    const symbols = (normalized.match(/[^A-Za-z0-9\s.,&()/'\-:+]/g) ?? []).length;
    const alphaRatio = letters / Math.max(1, normalized.length);
    const symbolRatio = symbols / Math.max(1, normalized.length);

    return alphaRatio < 0.3 || symbolRatio > 0.35;
}

function isCorruptedEducationCollection(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }

    const entries = value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
    if (entries.length === 0) {
        return false;
    }

    const corruptedEntries = entries.filter((entry) => {
        const institution = coerceString(entry.institution);
        const degree = coerceString(entry.degree);
        const field = coerceString(entry.fieldOfStudy) || coerceString(entry.field);

        return (
            looksCorruptedText(institution) ||
            looksCorruptedText(degree) ||
            looksCorruptedText(field)
        );
    });

    return corruptedEntries.length / entries.length >= 0.5;
}

function isCorruptedWorkHistoryCollection(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }

    const entries = value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
    if (entries.length === 0) {
        return false;
    }

    const corruptedEntries = entries.filter((entry) => {
        const company = coerceString(entry.company) || coerceString(entry.name);
        const title = coerceString(entry.title);
        return looksCorruptedText(company) || looksCorruptedText(title);
    });

    return corruptedEntries.length / entries.length >= 0.5;
}

const DEFAULT_IMPORTED_START_DATE = '2000-01-01';

function toDateFromYear(year: number, isEndDate: boolean): string {
    return `${year}-${isEndDate ? '12-31' : '01-01'}`;
}

function extractDurationYears(duration?: string): {
    startYear?: number;
    endYear?: number;
    isCurrent: boolean;
} {
    if (!duration) {
        return { isCurrent: false };
    }

    const normalized = duration.trim().toLowerCase();
    const isCurrent = /present|current|now/.test(normalized);
    const yearMatches = normalized.match(/\b(19|20)\d{2}\b/g) ?? [];

    if (yearMatches.length === 0) {
        return { isCurrent };
    }

    const parsedYears = yearMatches
        .map((year) => Number.parseInt(year, 10))
        .filter((year) => Number.isFinite(year) && year >= 1900 && year <= 2100);

    if (parsedYears.length === 0) {
        return { isCurrent };
    }

    const startYear = parsedYears[0];
    const endYear = parsedYears.length > 1 ? parsedYears[1] : undefined;

    return {
        startYear,
        endYear,
        isCurrent,
    };
}

function toProfileEducationEntries(
    education: ParsedResumeData['education']
): ProfileEducationEntry[] {
    const mappedEntries: ProfileEducationEntry[] = [];

    for (const entry of education) {
        const institution = entry.institution.trim();
        const degree = entry.degree.trim();
        const fieldOfStudy = entry.field.trim();

        if (!institution && !degree) {
            continue;
        }

        const mappedEntry: ProfileEducationEntry = {
            institution: institution || 'Institution',
            degree: degree || 'Degree',
            startDate: DEFAULT_IMPORTED_START_DATE,
            endDate: null,
            isCurrent: false,
        };

        if (fieldOfStudy) {
            mappedEntry.fieldOfStudy = fieldOfStudy;
        }

        mappedEntries.push(mappedEntry);
    }

    return mappedEntries;
}

function toProfileWorkHistoryEntries(
    employers: ParsedResumeData['employers']
): ProfileWorkHistoryEntry[] {
    const mappedEntries: ProfileWorkHistoryEntry[] = [];

    for (const entry of employers) {
        const company = entry.name.trim();
        const title = entry.title.trim();
        const duration = entry.duration?.trim();

        if (!company && !title) {
            continue;
        }

        const { startYear, endYear, isCurrent } = extractDurationYears(duration);
        const startDate =
            typeof startYear === 'number'
                ? toDateFromYear(startYear, false)
                : DEFAULT_IMPORTED_START_DATE;

        const endDate = isCurrent
            ? null
            : typeof endYear === 'number'
              ? toDateFromYear(endYear, true)
              : null;

        const mappedEntry: ProfileWorkHistoryEntry = {
            company: company || 'Employer',
            title: title || 'Role',
            startDate,
            endDate,
            isCurrent,
        };

        if (duration) {
            mappedEntry.description = `Duration: ${duration}`;
        }

        mappedEntries.push(mappedEntry);
    }

    return mappedEntries;
}

function buildRawParsePayload(
    existingRawParse: unknown,
    parsedData: ParsedResumeData,
    resumeId: string,
    populationStatus: ProfilePopulationStatus,
    source: PopulationSource,
    mergeSummary?: ParseMergeSummary
): Record<string, unknown> {
    const existingPayload = normalizeJsonObject(existingRawParse);

    return {
        ...existingPayload,
        latestResumeInsights: {
            skills: parsedData.skills,
            experienceYears: parsedData.experience_years,
            employers: parsedData.employers.slice(0, 10),
            education: parsedData.education.slice(0, 10),
        },
        lastResumeParsedAt: parsedData.extracted_at,
        latestResumeId: resumeId,
        parsePopulation: {
            status: populationStatus,
            source,
            updatedAt: new Date().toISOString(),
            ...(mergeSummary ? { mergeSummary } : {}),
        },
        ...(mergeSummary ? { latestResumeMergeSummary: mergeSummary } : {}),
    };
}

function getPopulationStatus(scanResult: unknown): ProfilePopulationStatus | null {
    if (!isRecord(scanResult)) {
        return null;
    }

    const status = scanResult.parsePopulationStatus;
    if (
        status === 'pending_consent' ||
        status === 'pending_profile_sync' ||
        status === 'applied'
    ) {
        return status;
    }

    return null;
}

async function triggerScreeningInBackground(
    applicationId: string,
    resumeId: string
): Promise<void> {
    setImmediate(async () => {
        try {
            const application = await prisma.application.findUnique({
                where: { id: applicationId },
                select: {
                    status: true,
                },
            });

            if (!application) {
                logger.warn('Skipping screening enqueue because application was not found', {
                    resumeId,
                    applicationId,
                });
                return;
            }

            if (application.status === 'draft') {
                logger.info('Skipping screening enqueue for draft application', {
                    resumeId,
                    applicationId,
                });
                return;
            }

            await enqueueScreening({
                applicationId,
                resumeId,
                triggeredBy: 'parsing',
            });
            logger.info('Screening enqueued after parsing', {
                resumeId,
                applicationId,
            });
        } catch (error) {
            logger.error('Failed to enqueue screening', {
                resumeId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
}

async function syncParsedResumeToProfile(params: {
    resumeId: string;
    candidateId: string;
    candidateEmail: string;
    applicationId: string;
    parsedData: ParsedResumeData;
    resumeScanResult: unknown;
    source: PopulationSource;
}): Promise<ProfileSyncResult> {
    const {
        resumeId,
        candidateId,
        candidateEmail,
        applicationId,
        parsedData,
        resumeScanResult,
        source,
    } = params;

    const profile = await prisma.profile.findUnique({
        where: { candidateId },
        select: {
            id: true,
            fullName: true,
            experienceYears: true,
            education: true,
            workHistory: true,
            skills: true,
            rawParseJson: true,
        },
    });

    const existingSkills = Array.isArray(profile?.skills) ? profile.skills : [];
    const mergedSkills = mergeSkills(existingSkills, parsedData.skills ?? []);
    const addedSkillsCount = Math.max(mergedSkills.length - existingSkills.length, 0);

    const mappedEducation = toProfileEducationEntries(parsedData.education);
    const mappedWorkHistory = toProfileWorkHistoryEntries(parsedData.employers);

    const existingEducationCount = profile ? getArrayLength(profile.education) : 0;
    const existingWorkHistoryCount = profile ? getArrayLength(profile.workHistory) : 0;
    const existingEducationCorrupted =
        profile !== null && isCorruptedEducationCollection(profile.education);
    const existingWorkHistoryCorrupted =
        profile !== null && isCorruptedWorkHistoryCollection(profile.workHistory);

    const shouldPopulateFullName =
        profile !== null &&
        shouldPopulateName(profile.fullName, parsedData.name, candidateEmail);
    const shouldPopulateExperience =
        profile !== null &&
        profile.experienceYears <= 0 &&
        parsedData.experience_years > 0;
    const shouldPopulateEducation =
        profile !== null &&
        (existingEducationCount === 0 || existingEducationCorrupted) &&
        mappedEducation.length > 0;
    const shouldPopulateWorkHistory =
        profile !== null &&
        (existingWorkHistoryCount === 0 || existingWorkHistoryCorrupted) &&
        mappedWorkHistory.length > 0;

    const createdProfile = profile === null;

    const populatedFields = createdProfile
        ? ['fullName', 'experienceYears', 'education', 'workHistory', 'skills']
        : [
              ...(shouldPopulateFullName ? ['fullName'] : []),
              ...(shouldPopulateExperience ? ['experienceYears'] : []),
              ...(shouldPopulateEducation ? ['education'] : []),
              ...(shouldPopulateWorkHistory ? ['workHistory'] : []),
              ...(addedSkillsCount > 0 ? ['skills'] : []),
          ];

    const mergeSummary: ParseMergeSummary = {
        source,
        appliedAt: new Date().toISOString(),
        createdProfile,
        populatedFields,
        addedSkillsCount,
        totalSkills: mergedSkills.length,
        importedEducationEntries: createdProfile
                        ? mappedEducation.length
            : shouldPopulateEducation
                            ? mappedEducation.length
              : 0,
        importedWorkHistoryEntries: createdProfile
                        ? mappedWorkHistory.length
            : shouldPopulateWorkHistory
                            ? mappedWorkHistory.length
              : 0,
        importedExperienceYears: createdProfile || shouldPopulateExperience,
        importedFullName: createdProfile || shouldPopulateFullName,
    };

    const rawParsePayload = buildRawParsePayload(
        profile?.rawParseJson,
        parsedData,
        resumeId,
        'applied',
        source,
        mergeSummary
    );

    const updatedOrCreatedProfile = profile
        ? await prisma.profile.update({
              where: { id: profile.id },
              data: {
                  ...(shouldPopulateFullName && { fullName: parsedData.name }),
                  ...(shouldPopulateExperience && {
                      experienceYears: parsedData.experience_years,
                  }),
                  ...(shouldPopulateEducation && {
                      education: mappedEducation as any,
                  }),
                  ...(shouldPopulateWorkHistory && {
                      workHistory: mappedWorkHistory as any,
                  }),
                  skills: mergedSkills,
                  rawParseJson: rawParsePayload as any,
              },
          })
        : await prisma.profile.create({
              data: {
                  candidateId,
                  fullName: parsedData.name || candidateEmail || 'Candidate',
                  experienceYears: parsedData.experience_years,
                  skills: mergedSkills,
                  education: mappedEducation as any,
                  workHistory: mappedWorkHistory as any,
                  rawParseJson: rawParsePayload as any,
                  profileCompletionPercentage: 0,
                  lastCompletedSection: null,
              },
          });

    const completion = await calculateProfileCompletion(candidateId);
    await prisma.profile.update({
        where: { id: updatedOrCreatedProfile.id },
        data: {
            profileCompletionPercentage: completion.percentage,
        },
    });

    await prisma.resume.update({
        where: { id: resumeId },
        data: {
            scanResult: {
                ...normalizeJsonObject(resumeScanResult),
                parsingStatus: 'completed',
                parsePopulationStatus: 'applied',
                parseMergeSummary: mergeSummary,
                profileSyncAt: new Date().toISOString(),
                profileSyncSource: source,
            } as any,
        },
    });

    await auditEvent({
        entityType: 'profile',
        entityId: updatedOrCreatedProfile.id,
        action: 'profile.resume_skills_synced',
        actorId: 'system',
        metadata: {
            candidateId,
            resumeId,
            totalSkills: mergedSkills.length,
            addedSkills: addedSkillsCount,
            createdProfile,
            populatedFields,
            source,
        },
    });

    logger.info('Profile updated from parsed resume', {
        resumeId,
        candidateId,
        addedSkills: addedSkillsCount,
        totalSkills: mergedSkills.length,
        createdProfile,
        populatedFields,
        source,
    });

    await triggerScreeningInBackground(applicationId, resumeId);

    return {
        profileId: updatedOrCreatedProfile.id,
        createdProfile,
        addedSkillsCount,
        totalSkills: mergedSkills.length,
        populatedFields,
    };
}

async function hasActiveConsent(candidateId: string): Promise<boolean> {
    const consent = await prisma.privacyConsent.findFirst({
        where: {
            candidateId,
            revokedAt: null,
        },
        select: {
            id: true,
        },
    });

    return consent !== null;
}

async function updateResumeParseState(params: {
    resumeId: string;
    scanResult: unknown;
    parsedData: ParsedResumeData;
    populationStatus: ProfilePopulationStatus;
}): Promise<void> {
    const { resumeId, scanResult, parsedData, populationStatus } = params;

    await prisma.resume.update({
        where: { id: resumeId },
        data: {
            parsedData: parsedData as any,
            scanResult: {
                ...normalizeJsonObject(scanResult),
                parsingStatus: 'completed',
                parsedAt: parsedData.extracted_at,
                parsePopulationStatus: populationStatus,
                parseMergeSummary: null,
            } as any,
        },
    });
}

export async function applyLatestParsedResumeToProfile(
    candidateId: string,
    source: PopulationSource = 'consent_accept'
): Promise<LatestProfilePopulationResult> {
    const consentExists = await hasActiveConsent(candidateId);
    if (!consentExists) {
        return { status: 'no_active_consent' };
    }

    const recentResumes = await prisma.resume.findMany({
        where: {
            application: {
                candidateId,
            },
            scanStatus: 'clean',
        },
        orderBy: {
            uploadedAt: 'desc',
        },
        take: 5,
        include: {
            application: {
                include: {
                    candidate: {
                        select: {
                            email: true,
                        },
                    },
                },
            },
        },
    });

    const latestParsedResume = recentResumes.find((resume) => resume.parsedData !== null);

    if (!latestParsedResume || latestParsedResume.parsedData === null) {
        return { status: 'no_parsed_resume' };
    }

    const populationStatus = getPopulationStatus(latestParsedResume.scanResult);
    if (populationStatus === 'applied') {
        return {
            status: 'already_applied',
            resumeId: latestParsedResume.id,
        };
    }

    const parsedData = parseStoredResumeData(latestParsedResume.parsedData);
    if (!parsedData) {
        return {
            status: 'invalid_parsed_resume',
            resumeId: latestParsedResume.id,
        };
    }

    const profileSyncResult = await syncParsedResumeToProfile({
        resumeId: latestParsedResume.id,
        candidateId,
        candidateEmail: latestParsedResume.application.candidate.email,
        applicationId: latestParsedResume.applicationId,
        parsedData,
        resumeScanResult: latestParsedResume.scanResult,
        source,
    });

    return {
        status: 'applied',
        resumeId: latestParsedResume.id,
        profileId: profileSyncResult.profileId,
    };
}

function mergeSkills(existingSkills: string[], extractedSkills: string[]): string[] {
    const merged = [...existingSkills];
    const seen = new Set(existingSkills.map(normalizeSkill).filter((skill) => skill.length > 0));

    for (const skill of extractedSkills) {
        const cleaned = skill.trim();
        if (!cleaned) {
            continue;
        }

        const normalized = normalizeSkill(cleaned);
        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        merged.push(cleaned);
    }

    return merged;
}

export async function processParseResult(payload: ParseResultPayload): Promise<void> {
    const { resumeId, status, parsedData, error } = payload;

    try {
        // Find resume
        const resume = await prisma.resume.findUnique({
            where: { id: resumeId },
            include: {
                application: {
                    include: {
                        candidate: true,
                    },
                },
            },
        });

        if (!resume) {
            throw new ParseResultError('Resume not found', 'RESUME_NOT_FOUND', 404);
        }

        if (status === 'success' && parsedData) {
            const sanitizedParsedData = sanitizeParsedResumeData(parsedData);
            const consentExists = await hasActiveConsent(resume.application.candidateId);

            await updateResumeParseState({
                resumeId,
                scanResult: resume.scanResult,
                parsedData: sanitizedParsedData,
                populationStatus: consentExists ? 'pending_profile_sync' : 'pending_consent',
            });

            let profileSyncResult: ProfileSyncResult | null = null;

            if (consentExists) {
                profileSyncResult = await syncParsedResumeToProfile({
                    resumeId,
                    candidateId: resume.application.candidateId,
                    candidateEmail: resume.application.candidate.email,
                    applicationId: resume.application.id,
                    parsedData: sanitizedParsedData,
                    resumeScanResult: resume.scanResult,
                    source: 'parse_webhook',
                });
            } else {
                logger.info('Resume parsed and staged pending consent', {
                    resumeId,
                    candidateId: resume.application.candidateId,
                });
            }

            // Log audit event
            await auditEvent({
                entityType: 'resume',
                entityId: resumeId,
                action: 'resume.parsed',
                actorId: 'system',
                metadata: {
                    skillsCount: sanitizedParsedData.skills.length,
                    experienceYears: sanitizedParsedData.experience_years,
                    employersCount: sanitizedParsedData.employers.length,
                    educationCount: sanitizedParsedData.education.length,
                    profilePopulationDeferred: !consentExists,
                    profilePopulated: consentExists,
                    profileId: profileSyncResult?.profileId,
                },
            });

            logger.info('Resume parsed successfully', {
                resumeId,
                candidateId: resume.application.candidateId,
                skillsCount: sanitizedParsedData.skills.length,
                experienceYears: sanitizedParsedData.experience_years,
                profilePopulationDeferred: !consentExists,
            });
        } else if (status === 'failed') {
            // Update with parse error
            await prisma.resume.update({
                where: { id: resumeId },
                data: {
                    scanResult: {
                        ...normalizeJsonObject(resume.scanResult),
                        parsingStatus: 'failed',
                        parseError: error,
                        parseFailedAt: new Date().toISOString(),
                    } as any,
                },
            });

            logger.error('Resume parsing failed', {
                resumeId,
                error,
            });
        }
    } catch (error) {
        logger.error('Failed to process parse result', {
            resumeId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
