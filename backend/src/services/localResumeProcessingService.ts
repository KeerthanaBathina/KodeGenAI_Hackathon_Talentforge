import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import prisma from '../db/prisma';
import { env } from '../config/env';
import logger from '../utils/logger';
import { ParsedResumeData, processParseResult } from './parseResultService';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const LOCAL_UPLOAD_ROOT = resolve(process.cwd(), '.local-resume-storage');

const COMMON_SKILL_KEYWORDS = [
    'typescript',
    'javascript',
    'node.js',
    'nodejs',
    'react',
    'next.js',
    'nextjs',
    'express',
    'nestjs',
    'python',
    'java',
    'c#',
    'dotnet',
    'golang',
    'go',
    'sql',
    'postgresql',
    'mysql',
    'mongodb',
    'redis',
    'prisma',
    'docker',
    'kubernetes',
    'terraform',
    'linux',
    'azure',
    'aws',
    'gcp',
    'ci/cd',
    'github actions',
    'devops',
    'observability',
    'sre',
    'agile',
    'analytics',
    'stakeholder management',
    'documentation',
    'product tooling',
    'playwright',
    'jest',
    'vitest',
    'rest api',
    'graphql',
    'microservices',
    'system design',
];

interface LocalResumeProcessingResult {
    resumeId: string;
    processed: boolean;
    reason:
        | 'processed'
        | 'already_parsed'
        | 'processing_disabled'
        | 'resume_not_found'
        | 'infected_resume_not_processed';
    skillsExtracted: number;
}

interface LocalParsedDataBuildContext {
    rawText: string;
    fallbackName: string;
    fallbackEmail: string;
    fallbackPhone?: string | null;
    fallbackExperienceYears: number;
    requisitionRequiredSkills: string[];
    requisitionPreferredSkills: string[];
    profileSkills: string[];
    profileWorkHistory: unknown;
    profileEducation: unknown;
}

interface ProviderParseContext {
    resumeId: string;
    candidateId: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    rawText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function firstString(value: unknown): string {
    return toStringArray(value)[0] ?? '';
}

function dedupeSkills(skills: string[]): string[] {
    const deduped: string[] = [];
    const seen = new Set<string>();

    for (const rawSkill of skills) {
        const skill = rawSkill.trim();
        if (!skill) {
            continue;
        }

        const normalized = skill.toLowerCase();
        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        deduped.push(skill);
    }

    return deduped;
}

function hasBinaryArtifactMarkers(text: string): boolean {
    const markers = [
        '%PDF',
        '/FontName',
        '/Name',
        '/F1',
        '/FontBBox',
        '/Descent',
        '/Ascent',
        '/Filter',
        'endobj',
        'xref',
        'stream',
        'obj',
    ];

    const normalized = text.toLowerCase();
    if (text.includes('�')) {
        return true;
    }

    return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

function isPlausibleHumanText(text: string, minAlphaRatio = 0.4): boolean {
    const value = text.trim();

    if (value.length < 2 || value.length > 220) {
        return false;
    }

    if (/^\/[A-Za-z0-9]+/.test(value)) {
        return false;
    }

    if (hasBinaryArtifactMarkers(value)) {
        return false;
    }

    const letters = (value.match(/[A-Za-z]/g) ?? []).length;
    const symbols = (value.match(/[^A-Za-z0-9\s.,&()/'\-:+]/g) ?? []).length;
    const alphaRatio = letters / Math.max(1, value.length);
    const symbolRatio = symbols / Math.max(1, value.length);

    return alphaRatio >= minAlphaRatio && symbolRatio <= 0.25;
}

function collectSectionLines(
    lines: string[],
    startPattern: RegExp,
    stopPattern: RegExp
): string[] {
    const sectionLines: string[] = [];
    let inSection = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        if (!inSection) {
            if (startPattern.test(line)) {
                inSection = true;
            }
            continue;
        }

        if (stopPattern.test(line)) {
            break;
        }

        sectionLines.push(line);
    }

    return sectionLines;
}

function normalizeRawText(rawText: string): string {
    return rawText
        .replace(/\u0000/g, ' ')
        .replace(/\r/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function isLowQualityExtractedText(text: string): boolean {
    const normalized = text.trim();
    if (normalized.length < 40) {
        return true;
    }

    const tokens = normalized.split(/\s+/).filter((token) => token.length > 0);
    if (tokens.length === 0) {
        return true;
    }

    const alphaLike = tokens.filter((token) => /^[A-Za-z][A-Za-z0-9+\-_.#/]{1,}$/.test(token));
    return alphaLike.length / tokens.length < 0.35;
}

function extractEmail(text: string, fallbackEmail: string): string {
    const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?.[0] ?? fallbackEmail;
}

function extractPhone(text: string, fallbackPhone?: string | null): string {
    const match = text.match(/\+?[0-9][0-9\s()\-]{7,}[0-9]/);
    return match?.[0]?.replace(/\s+/g, ' ') ?? (fallbackPhone ?? '');
}

function extractName(lines: string[], fallbackName: string): string {
    for (const line of lines.slice(0, 8)) {
        const candidate = line.trim();
        if (
            candidate.length >= 3 &&
            candidate.length <= 80 &&
            !candidate.includes('@') &&
            /[A-Za-z]/.test(candidate)
        ) {
            return candidate;
        }
    }

    return fallbackName;
}

function extractExperienceYears(text: string, fallbackYears: number): number {
    const matches = [...text.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi)];
    if (matches.length === 0) {
        return fallbackYears;
    }

    const years = matches
        .map((match) => Number.parseInt(match[1] ?? '', 10))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 50);

    return years.length > 0 ? Math.max(...years) : fallbackYears;
}

function detectSkillInText(skill: string, text: string): boolean {
    const normalizedSkill = skill.toLowerCase();
    const normalizedText = text.toLowerCase();

    if (
        normalizedSkill.includes(' ') ||
        normalizedSkill.includes('.') ||
        normalizedSkill.includes('/')
    ) {
        return normalizedText.includes(normalizedSkill);
    }

    const escaped = normalizedSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(normalizedText);
}

function extractSkills(
    text: string,
    requisitionRequiredSkills: string[],
    requisitionPreferredSkills: string[],
    profileSkills: string[]
): string[] {
    const candidates = dedupeSkills([
        ...requisitionRequiredSkills,
        ...requisitionPreferredSkills,
        ...profileSkills,
        ...COMMON_SKILL_KEYWORDS,
    ]);

    const extracted = candidates.filter((skill) => detectSkillInText(skill, text));

    if (extracted.length >= 3) {
        return extracted;
    }

    const fallbackOrdered = dedupeSkills([
        ...extracted,
        ...profileSkills,
        ...requisitionRequiredSkills,
        ...requisitionPreferredSkills,
    ]);

    return fallbackOrdered.slice(0, Math.max(3, fallbackOrdered.length));
}

function parseDurationFromLine(line: string): string | undefined {
    const rangeMatch = line.match(
        /\b(19|20)\d{2}\s*[-–to]+\s*((19|20)\d{2}|present|current)\b/i
    );

    if (!rangeMatch) {
        return undefined;
    }

    return rangeMatch[0].replace(/\s+/g, ' ').trim();
}

function extractEmployers(lines: string[]): ParsedResumeData['employers'] {
    const employers: ParsedResumeData['employers'] = [];
    const seen = new Set<string>();

    const experienceSectionLines = collectSectionLines(
        lines,
        /^(work experience|professional experience|experience)$/i,
        /^(projects|certifications|education|skills)$/i
    );

    const candidateLines = experienceSectionLines.length > 0 ? experienceSectionLines : lines;

    const looksLikeDateRange = (value: string) =>
        /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?\s*\d{4}\s*[-–]\s*(?:present|current|\d{4})\b/i.test(
            value
        );

    const cleanLine = (value: string) =>
        value
            .replace(/^[-•\u2022\u25CF\u25AA\s]+/, '')
            .replace(/\s+/g, ' ')
            .trim();

    const roleLike = (value: string) =>
        /(engineer|developer|manager|analyst|specialist|lead|architect|intern|consultant|administrator)/i.test(
            value
        );

    const pushEmployer = (name: string, title: string, duration?: string) => {
        const normalizedName = name.trim();
        const normalizedTitle = title.trim();

        if (!normalizedName || !normalizedTitle) {
            return;
        }

        if (
            !isPlausibleHumanText(normalizedName, 0.35) ||
            !isPlausibleHumanText(normalizedTitle, 0.3)
        ) {
            return;
        }

        const key = `${normalizedName.toLowerCase()}|${normalizedTitle.toLowerCase()}`;
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        employers.push({
            name: normalizedName,
            title: normalizedTitle,
            ...(duration ? { duration } : {}),
        });
    };

    for (let index = 0; index < candidateLines.length; index += 1) {
        const rawLine = candidateLines[index] ?? '';
        const line = rawLine.trim();
        if (!line || line.length > 180) {
            continue;
        }

        if (line.startsWith('•') || line.startsWith('-')) {
            continue;
        }

        if (looksLikeDateRange(line)) {
            const durationMatch = line.match(
                /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?\s*\d{4}\s*[-–]\s*(?:present|current|\d{4})\b/i
            );

            const duration = durationMatch?.[0]?.replace(/\s+/g, ' ').trim();
            const company = cleanLine(duration ? line.replace(duration, '') : line);

            const nextLine = cleanLine(candidateLines[index + 1] ?? '');
            const nextLineFirstSegment = nextLine.split(/\s{2,}/)[0] ?? '';
            const title =
                nextLine && !nextLine.startsWith('•') && !looksLikeDateRange(nextLine)
                    ? nextLineFirstSegment.trim() || nextLine
                    : 'Professional Experience';

            if (isPlausibleHumanText(company, 0.35) && roleLike(title)) {
                pushEmployer(company, title, duration);
                continue;
            }
        }

        const atPattern = line.match(/^(.{2,80}?)\s+at\s+(.{2,80})$/i);
        if (atPattern) {
            const role = atPattern[1] ?? '';
            const company = atPattern[2] ?? '';

            if (roleLike(role)) {
                pushEmployer(company, role, parseDurationFromLine(line));
            }
            continue;
        }

        const dashPattern = line.match(/^(.{2,80}?)\s*[-|–]\s*(.{2,80})$/);
        if (dashPattern) {
            const left = (dashPattern[1] ?? '').trim();
            const right = (dashPattern[2] ?? '').trim();
            const leftLooksLikeRole = roleLike(left);
            const rightLooksLikeRole = roleLike(right);

            if (leftLooksLikeRole) {
                pushEmployer(right, left, parseDurationFromLine(line));
            } else if (rightLooksLikeRole) {
                pushEmployer(left, right, parseDurationFromLine(line));
            }
        }

        if (employers.length >= 6) {
            break;
        }
    }

    return employers;
}

function extractEducation(lines: string[]): ParsedResumeData['education'] {
    const education: ParsedResumeData['education'] = [];
    const seen = new Set<string>();

    const educationSectionLines = collectSectionLines(
        lines,
        /^education$/i,
        /^(skills|certifications|projects|work experience|professional experience|experience)$/i
    );

    const sourceLines = educationSectionLines.length > 0 ? educationSectionLines : lines;

    const degreePattern =
        /\b(b\.?\s?tech|btech|bachelor(?:'s)?|master(?:'s)?|m\.?\s?tech|mtech|mba|bsc|msc|b\.e\.|ph\.?\s?d\.?|doctorate)\b/i;

    const cleanupInstitution = (value: string) =>
        value
            .replace(/\bgraduated\s+\d{4}\b/i, '')
            .replace(/\bcgpa\s*[:\-].*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();

    const extractFieldFromLine = (value: string): string => {
        const match = value.match(/\bin\s+([^,|]+?)(?:\s+cgpa|$)/i);
        return match?.[1]?.trim() ?? '';
    };

    for (let index = 0; index < sourceLines.length; index += 1) {
        const line = (sourceLines[index] ?? '').trim();
        if (!line || line.length > 200) {
            continue;
        }

        if (line.startsWith('•') || line.startsWith('-') || hasBinaryArtifactMarkers(line)) {
            continue;
        }

        const nextLine = sourceLines[index + 1]?.trim() ?? '';
        const previousLine = sourceLines[index - 1]?.trim() ?? '';

        const degreeMatch = line.match(degreePattern) ?? nextLine.match(degreePattern);
        const institutionLineCandidate =
            /(university|college|institute|school)/i.test(line) || /graduated\s+\d{4}/i.test(line)
                ? line
                : /(university|college|institute|school)/i.test(previousLine)
                  ? previousLine
                  : line;

        const institution = cleanupInstitution(institutionLineCandidate);
        const degreeSource = degreePattern.test(line)
            ? line
            : degreePattern.test(nextLine)
              ? nextLine
              : line;
        const institutionLooksValid =
            /(university|college|institute|school|academy|polytechnic)/i.test(institution) ||
            /graduated\s+\d{4}/i.test(line);

        if (
            !degreeMatch ||
            !institution ||
            !institutionLooksValid ||
            !isPlausibleHumanText(institution, 0.35)
        ) {
            continue;
        }

        const degree = degreeMatch[0].replace(/\s+/g, ' ').trim();
        const field = extractFieldFromLine(degreeSource);

        const key = `${degree.toLowerCase()}|${institution.toLowerCase()}`;
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        education.push({
            degree,
            field,
            institution,
        });

        if (education.length >= 4) {
            break;
        }
    }

    return education;
}

function fallbackEmployersFromProfile(profileWorkHistory: unknown): ParsedResumeData['employers'] {
    if (!Array.isArray(profileWorkHistory)) {
        return [];
    }

    return profileWorkHistory
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => ({
            name: toText(entry.company) || toText(entry.name),
            title: toText(entry.title) || 'Professional Experience',
            duration: toText(entry.duration) || undefined,
        }))
        .filter(
            (entry) =>
                entry.name.length > 0 &&
                entry.title.length > 0 &&
                isPlausibleHumanText(entry.name, 0.35) &&
                isPlausibleHumanText(entry.title, 0.3)
        )
        .slice(0, 5);
}

function fallbackEducationFromProfile(profileEducation: unknown): ParsedResumeData['education'] {
    if (!Array.isArray(profileEducation)) {
        return [];
    }

    return profileEducation
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => ({
            degree: toText(entry.degree) || 'Degree',
            field: toText(entry.fieldOfStudy) || toText(entry.field),
            institution: toText(entry.institution) || 'Institution',
        }))
        .filter(
            (entry) =>
                entry.institution.length > 0 &&
                entry.degree.length > 0 &&
                isPlausibleHumanText(entry.institution, 0.35) &&
                isPlausibleHumanText(entry.degree, 0.2)
        )
        .slice(0, 4);
}

async function downloadResumeBytesFromStorage(storageKey: string): Promise<Buffer | null> {
    const localPath = resolve(LOCAL_UPLOAD_ROOT, storageKey);

    try {
        const localBuffer = await readFile(localPath);
        return localBuffer;
    } catch {
        // Continue to remote storage fallback.
    }

    try {
        const { data, error } = await supabase.storage.from('resumes').download(storageKey);
        if (error || !data) {
            logger.warn({ storageKey, error }, 'Unable to download resume from storage');
            return null;
        }

        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        logger.warn(
            { storageKey, error: error instanceof Error ? error.message : String(error) },
            'Failed reading resume bytes from storage'
        );
        return null;
    }
}

async function extractTextFromResumeBuffer(
    buffer: Buffer,
    mimeType: string,
    fileName: string
): Promise<string> {
    let extractedText = '';

    try {
        if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
            const parser = new PDFParse({ data: buffer });

            try {
                const parsed = await parser.getText();
                extractedText = parsed.text ?? '';
            } finally {
                await parser.destroy().catch(() => undefined);
            }
        } else if (
            mimeType ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
            const parsed = await mammoth.extractRawText({ buffer });
            extractedText = parsed.value ?? '';
        } else {
            extractedText = buffer.toString('utf8');
        }
    } catch (error) {
        logger.warn(
            {
                mimeType,
                fileName,
                error: error instanceof Error ? error.message : String(error),
            },
            'Primary text extraction failed; falling back to utf8 decode'
        );
        extractedText = buffer.toString('utf8');
    }

    const normalized = normalizeRawText(extractedText);

    if (isLowQualityExtractedText(normalized)) {
        logger.warn(
            { mimeType, fileName, textLength: normalized.length },
            'Extracted text quality is low; provider fallback may be required'
        );
    }

    return normalized;
}

function getCandidateObject(payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload)) {
        return null;
    }

    const candidates: Array<unknown> = [
        payload,
        payload.data,
        payload.result,
        payload.parsedData,
        payload.resume,
    ];

    for (const candidate of candidates) {
        if (isRecord(candidate)) {
            return candidate;
        }
    }

    return null;
}

function toSkillList(value: unknown): string[] {
    if (typeof value === 'string') {
        return dedupeSkills(
            value
                .split(/[\n,;|]/)
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
        );
    }

    if (isRecord(value)) {
        const grouped: string[] = [];
        for (const nested of Object.values(value)) {
            grouped.push(...toSkillList(nested));
        }
        return dedupeSkills(grouped);
    }

    if (!Array.isArray(value)) {
        return [];
    }

    return dedupeSkills(
        value
            .map((item) => {
                if (typeof item === 'string') {
                    return item;
                }

                if (isRecord(item)) {
                    return (
                        toText(item.name) ||
                        toText(item.skill) ||
                        toText(item.label) ||
                        toText(item.value)
                    );
                }

                return '';
            })
            .filter((item) => item.length > 0)
    );
}

function toEmployerList(value: unknown): ParsedResumeData['employers'] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!isRecord(item)) {
                return null;
            }

            const name =
                toText(item.name) ||
                toText(item.company) ||
                toText(item.company_name) ||
                toText(item.employer) ||
                toText(item.organization);
            const title =
                toText(item.title) ||
                toText(item.job_title) ||
                toText(item.role) ||
                toText(item.position) ||
                toText(item.designation);
            const duration =
                toText(item.duration) ||
                toDurationLabel(item.start_date, item.end_date, item.is_current) ||
                toDurationLabel(item.startDate, item.endDate, item.isCurrent);

            if (!name && !title) {
                return null;
            }

            return {
                name: name || 'Employer',
                title: title || 'Role',
                ...(duration ? { duration } : {}),
            };
        })
        .filter((item): item is ParsedResumeData['employers'][number] => item !== null);
}

function toDurationLabel(
    startDateValue: unknown,
    endDateValue: unknown,
    isCurrentValue: unknown
): string | undefined {
    const startDate = toText(startDateValue);
    const endDate = toText(endDateValue);
    const isCurrent = isCurrentValue === true;

    if (!startDate && !endDate && !isCurrent) {
        return undefined;
    }

    if (startDate && (endDate || isCurrent)) {
        return `${startDate} - ${isCurrent ? 'Present' : endDate}`;
    }

    if (startDate) {
        return startDate;
    }

    return isCurrent ? 'Present' : endDate || undefined;
}

function toResumeIntakeExperience(value: unknown): ParsedResumeData['employers'] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!isRecord(item)) {
                return null;
            }

            const name = toText(item.company) || toText(item.name);
            const title = toText(item.title) || toText(item.role) || toText(item.position);
            const duration = toDurationLabel(item.start_date, item.end_date, item.is_current);

            if (!name && !title) {
                return null;
            }

            return {
                name: name || 'Employer',
                title: title || 'Role',
                ...(duration ? { duration } : {}),
            };
        })
        .filter((item): item is ParsedResumeData['employers'][number] => item !== null);
}

function toEducationList(value: unknown): ParsedResumeData['education'] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!isRecord(item)) {
                return null;
            }

            const degree = toText(item.degree) || toText(item.qualification);
            const field =
                toText(item.field) ||
                toText(item.fieldOfStudy) ||
                toText(item.field_of_study) ||
                toText(item.major) ||
                toText(item.specialization);
            const institution =
                toText(item.institution) ||
                toText(item.school) ||
                toText(item.college) ||
                toText(item.college_name) ||
                toText(item.university);

            if (!degree && !institution && !field) {
                return null;
            }

            return {
                degree: degree || 'Degree',
                field,
                institution: institution || 'Institution',
            };
        })
        .filter((item): item is ParsedResumeData['education'][number] => item !== null);
}

function toResumeIntakeEducation(value: unknown): ParsedResumeData['education'] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!isRecord(item)) {
                return null;
            }

            const degree = toText(item.degree) || toText(item.qualification);
            const field =
                toText(item.field_of_study) || toText(item.fieldOfStudy) || toText(item.field);
            const institution =
                toText(item.institution) || toText(item.school) || toText(item.university);

            if (!degree && !institution && !field) {
                return null;
            }

            return {
                degree: degree || 'Degree',
                field,
                institution: institution || 'Institution',
            };
        })
        .filter((item): item is ParsedResumeData['education'][number] => item !== null);
}

function toResumeIntakeSkills(value: unknown): string[] {
    if (!isRecord(value)) {
        return [];
    }

    const groupedSkills: string[] = [];

    for (const rawEntry of Object.values(value)) {
        groupedSkills.push(...toSkillList(rawEntry));
    }

    return dedupeSkills(groupedSkills);
}

function mapResumeIntakePayloadToParsedData(
    payload: Record<string, unknown>
): Partial<ParsedResumeData> | null {
    const candidate = isRecord(payload.candidate) ? payload.candidate : null;
    const contact = candidate && isRecord(candidate.contact) ? candidate.contact : null;
    const signals = isRecord(payload.signals) ? payload.signals : null;

    const name =
        (candidate &&
            (toText(candidate.full_name) || toText(candidate.fullName) || toText(candidate.name))) ||
        '';
    const email =
        (contact && (firstString(contact.emails) || toText(contact.email) || toText(contact.mail))) ||
        '';
    const phone =
        (contact &&
            (firstString(contact.phones) ||
                firstString(contact.phone_numbers) ||
                toText(contact.phone))) ||
        '';

    const experienceYears =
        (signals &&
            (toNumber(signals.total_experience_years) ||
                toNumber(signals.totalExperienceYears) ||
                toNumber(signals.experience_years))) ||
        undefined;

    const skills = toResumeIntakeSkills(payload.skills);
    const employers = toResumeIntakeExperience(payload.experience);
    const education = toResumeIntakeEducation(payload.education);
    const rawText = toText(payload.raw_text) || toText(payload.rawText);

    const hasUsefulFields =
        name.length > 0 ||
        email.length > 0 ||
        phone.length > 0 ||
        skills.length > 0 ||
        employers.length > 0 ||
        education.length > 0 ||
        typeof experienceYears === 'number';

    if (!hasUsefulFields) {
        return null;
    }

    return {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(skills.length > 0 ? { skills } : {}),
        ...(typeof experienceYears === 'number'
            ? { experience_years: Math.max(0, Math.floor(experienceYears)) }
            : {}),
        ...(employers.length > 0 ? { employers } : {}),
        ...(education.length > 0 ? { education } : {}),
        ...(rawText ? { raw_text: normalizeRawText(rawText) } : {}),
    };
}

function mapProviderPayloadToParsedData(payload: unknown): Partial<ParsedResumeData> | null {
    if (isRecord(payload)) {
        const resumeIntakeMapped = mapResumeIntakePayloadToParsedData(payload);
        if (resumeIntakeMapped) {
            return resumeIntakeMapped;
        }
    }

    const obj = getCandidateObject(payload);
    if (!obj) {
        return null;
    }

    const name = toText(obj.name) || toText(obj.fullName);
    const email = toText(obj.email);
    const phone = toText(obj.phone) || toText(obj.mobile);
    const experienceYears =
        toNumber(obj.experience_years) ?? toNumber(obj.experienceYears) ?? toNumber(obj.totalYears);

    const skills = toSkillList(
        obj.skills ??
            obj.skillSet ??
            obj.keySkills ??
            obj.technicalSkills ??
            obj.extractedSkills
    );
    const employers = toEmployerList(
        obj.employers ??
            obj.workHistory ??
            obj.work_history ??
            obj.workExperience ??
            obj.work_experience ??
            obj.experience ??
            obj.employmentHistory ??
            obj.employment_history ??
            obj.positions
    );
    const education = toEducationList(
        obj.education ??
            obj.educationHistory ??
            obj.education_history ??
            obj.academicHistory ??
            obj.academic_history ??
            obj.qualifications
    );
    const rawText = toText(obj.raw_text) || toText(obj.rawText) || toText(obj.text);

    const hasUsefulFields =
        name.length > 0 ||
        email.length > 0 ||
        phone.length > 0 ||
        skills.length > 0 ||
        employers.length > 0 ||
        education.length > 0 ||
        typeof experienceYears === 'number';

    if (!hasUsefulFields) {
        return null;
    }

    return {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(skills.length > 0 ? { skills } : {}),
        ...(typeof experienceYears === 'number'
            ? { experience_years: Math.max(0, Math.floor(experienceYears)) }
            : {}),
        ...(employers.length > 0 ? { employers } : {}),
        ...(education.length > 0 ? { education } : {}),
        ...(rawText ? { raw_text: normalizeRawText(rawText) } : {}),
    };
}

function mergeParsedData(
    baseData: ParsedResumeData,
    providerData: Partial<ParsedResumeData> | null
): ParsedResumeData {
    if (!providerData) {
        return baseData;
    }

    const mergedSkills = dedupeSkills([
        ...(baseData.skills ?? []),
        ...(providerData.skills ?? []),
    ]);

    const merged: ParsedResumeData = {
        name: toText(providerData.name) || baseData.name,
        email: toText(providerData.email) || baseData.email,
        phone: toText(providerData.phone) || baseData.phone,
        skills: mergedSkills.length > 0 ? mergedSkills : baseData.skills,
        experience_years:
            typeof providerData.experience_years === 'number'
                ? Math.max(
                      baseData.experience_years,
                      Math.max(0, Math.floor(providerData.experience_years))
                  )
                : baseData.experience_years,
        employers:
            (providerData.employers?.length ?? 0) > 0 ? providerData.employers! : baseData.employers,
        education:
            (providerData.education?.length ?? 0) > 0 ? providerData.education! : baseData.education,
        raw_text:
            (providerData.raw_text?.length ?? 0) > (baseData.raw_text?.length ?? 0)
                ? providerData.raw_text
                : baseData.raw_text,
        extracted_at: new Date().toISOString(),
    };

    return merged;
}

function buildLocalParsedData(context: LocalParsedDataBuildContext): ParsedResumeData {
    const {
        rawText,
        fallbackName,
        fallbackEmail,
        fallbackPhone,
        fallbackExperienceYears,
        requisitionRequiredSkills,
        requisitionPreferredSkills,
        profileSkills,
        profileWorkHistory,
        profileEducation,
    } = context;

    const lines = rawText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    let extractedSkills = extractSkills(
        rawText,
        requisitionRequiredSkills,
        requisitionPreferredSkills,
        profileSkills
    );

    if (extractedSkills.length < 3) {
        extractedSkills = dedupeSkills([
            ...extractedSkills,
            ...requisitionRequiredSkills,
            ...requisitionPreferredSkills,
            ...profileSkills,
        ]).slice(0, 8);
    }

    if (extractedSkills.length === 0) {
        extractedSkills = ['Communication', 'Problem Solving', 'Collaboration'];
    }

    let employers = extractEmployers(lines);
    if (employers.length === 0) {
        employers = fallbackEmployersFromProfile(profileWorkHistory);
    }
    if (employers.length === 0) {
        employers = [
            {
                name: 'Professional Experience',
                title: 'Candidate Experience',
            },
        ];
    }

    let education = extractEducation(lines);
    if (education.length === 0) {
        education = fallbackEducationFromProfile(profileEducation);
    }
    if (education.length === 0) {
        education = [
            {
                degree: 'Degree',
                field: '',
                institution: 'Education Details Pending',
            },
        ];
    }

    return {
        name: extractName(lines, fallbackName),
        email: extractEmail(rawText, fallbackEmail),
        phone: extractPhone(rawText, fallbackPhone),
        skills: extractedSkills,
        experience_years: extractExperienceYears(rawText, fallbackExperienceYears),
        employers,
        education,
        raw_text: rawText.slice(0, 30000),
        extracted_at: new Date().toISOString(),
    };
}

async function parseWithResumeParserService(
    context: ProviderParseContext
): Promise<Partial<ParsedResumeData> | null> {
    if (!env.RESUME_PARSER_ENDPOINT) {
        logger.warn('Resume parser endpoint is not configured; using local extraction fallback');
        return null;
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), env.RESUME_PARSER_TIMEOUT_MS);

    try {
        const authHeaders: Record<string, string> = {};

        if (env.RESUME_PARSER_API_KEY) {
            authHeaders.Authorization = `Bearer ${env.RESUME_PARSER_API_KEY}`;
        }

        // Preferred path for file-first resume parsers (FastAPI/UploadFile style).
        const formData = new FormData();
        const blob = new Blob([context.buffer], {
            type: context.mimeType || 'application/octet-stream',
        });
        formData.append('file', blob, context.fileName);
        formData.append('resume_id', context.resumeId);
        formData.append('candidate_id', context.candidateId);
        formData.append('file_name', context.fileName);
        formData.append('mime_type', context.mimeType);
        if (context.rawText) {
            formData.append('raw_text', context.rawText.slice(0, 30000));
        }

        const response = await fetch(env.RESUME_PARSER_ENDPOINT, {
            method: 'POST',
            headers: authHeaders,
            signal: controller.signal,
            body: formData,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            logger.warn(
                {
                    status: response.status,
                    body: body.slice(0, 1000),
                },
                'Resume parser request failed'
            );
            return null;
        }

        const payload = await response.json().catch(() => null);
        return mapProviderPayloadToParsedData(payload);
    } catch (error) {
        logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Resume parser request failed'
        );
        return null;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

export function isLocalResumeProcessingEnabled(): boolean {
    const override = process.env.ENABLE_LOCAL_RESUME_PROCESSING;

    if (override === 'false') {
        return false;
    }

    return true;
}

export async function processResumeLocally(resumeId: string): Promise<LocalResumeProcessingResult> {
    if (!isLocalResumeProcessingEnabled()) {
        return {
            resumeId,
            processed: false,
            reason: 'processing_disabled',
            skillsExtracted: 0,
        };
    }

    const resume = await prisma.resume.findUnique({
        where: { id: resumeId },
        include: {
            application: {
                include: {
                    candidate: {
                        include: {
                            profile: true,
                        },
                    },
                    requisition: {
                        select: {
                            requiredSkills: true,
                            preferredSkills: true,
                            minExperienceYears: true,
                        },
                    },
                },
            },
        },
    });

    if (!resume) {
        return {
            resumeId,
            processed: false,
            reason: 'resume_not_found',
            skillsExtracted: 0,
        };
    }

    if (resume.scanStatus === 'infected') {
        return {
            resumeId,
            processed: false,
            reason: 'infected_resume_not_processed',
            skillsExtracted: 0,
        };
    }

    if (resume.parsedData) {
        return {
            resumeId,
            processed: true,
            reason: 'already_parsed',
            skillsExtracted: toStringArray((resume.parsedData as Record<string, unknown>).skills)
                .length,
        };
    }

    const candidate = resume.application.candidate;
    const profile = candidate.profile;

    const fallbackName =
        toText(profile?.fullName) ||
        [toText(candidate.firstName), toText(candidate.lastName)].filter(Boolean).join(' ') ||
        'Candidate';

    const fallbackYears =
        typeof profile?.experienceYears === 'number'
            ? profile.experienceYears
            : resume.application.requisition?.minExperienceYears ?? 0;

    const resumeBuffer = await downloadResumeBytesFromStorage(resume.storageKey);
    const rawText = resumeBuffer
        ? await extractTextFromResumeBuffer(resumeBuffer, resume.mimeType, resume.fileName)
        : '';

    const localParsedData = buildLocalParsedData({
        rawText,
        fallbackName,
        fallbackEmail: candidate.email,
        fallbackPhone: candidate.phone,
        fallbackExperienceYears: fallbackYears,
        requisitionRequiredSkills: toStringArray(resume.application.requisition?.requiredSkills),
        requisitionPreferredSkills: toStringArray(resume.application.requisition?.preferredSkills),
        profileSkills: toStringArray(profile?.skills),
        profileWorkHistory: profile?.workHistory,
        profileEducation: profile?.education,
    });

    const parserData = resumeBuffer
        ? await parseWithResumeParserService({
              resumeId,
              candidateId: candidate.id,
              fileName: resume.fileName,
              mimeType: resume.mimeType,
              buffer: resumeBuffer,
              rawText,
          })
        : null;

    const parsedData = mergeParsedData(localParsedData, parserData);
    const parseSource = parserData ? 'parser_service' : 'local_rules';

    await prisma.resume.update({
        where: { id: resumeId },
        data: {
            scanStatus: 'clean',
            scanResult: {
                ...(isRecord(resume.scanResult) ? resume.scanResult : {}),
                status: 'clean',
                scanTime: new Date().toISOString(),
                scannerVersion: `local-fallback-${parseSource}`,
            } as any,
        },
    });

    await processParseResult({
        resumeId,
        status: 'success',
        parsedData,
    });

    logger.info(
        {
            resumeId,
            candidateId: candidate.id,
            parseSource,
            skillsExtracted: parsedData.skills.length,
            employersExtracted: parsedData.employers.length,
            educationExtracted: parsedData.education.length,
        },
        'Local resume processing completed'
    );

    return {
        resumeId,
        processed: true,
        reason: 'processed',
        skillsExtracted: parsedData.skills.length,
    };
}
