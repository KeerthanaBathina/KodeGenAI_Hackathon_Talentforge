import { env } from '../config/env';
import logger from '../utils/logger';

export interface ResumeAiScoringInput {
    roleTitle: string;
    resumeSkills: string[];
    requiredSkills: string[];
    preferredSkills: string[];
}

export interface ResumeAiScoringResult {
    source: 'groq' | 'heuristic';
    overallScorePercent: number;
    requiredCoveragePercent: number;
    preferredCoveragePercent: number;
    matchedRequired: string[];
    matchedPreferred: string[];
    summary: string;
    fallbackReason?:
        | 'missing_groq_api_key'
        | 'empty_resume_skills'
        | 'groq_rate_limited'
        | 'groq_http_error'
        | 'groq_parse_error'
        | 'groq_request_failed';
}

function normalizeSkillToken(skill: string): string {
    return skill.trim().toLowerCase();
}

function clampPercent(value: number): number {
    if (Number.isNaN(value)) {
        return 0;
    }

    return Math.max(0, Math.min(100, Math.round(value)));
}

function dedupeSkills(skills: string[]): string[] {
    const normalizedSeen = new Set<string>();
    const deduped: string[] = [];

    for (const skill of skills) {
        if (typeof skill !== 'string') {
            continue;
        }

        const trimmed = skill.trim();
        if (!trimmed) {
            continue;
        }

        const token = normalizeSkillToken(trimmed);
        if (normalizedSeen.has(token)) {
            continue;
        }

        normalizedSeen.add(token);
        deduped.push(trimmed);
    }

    return deduped;
}

function calculateHeuristicScore(
    input: ResumeAiScoringInput,
    fallbackReason?: ResumeAiScoringResult['fallbackReason']
): ResumeAiScoringResult {
    const resumeSkillSet = new Set(input.resumeSkills.map((skill) => normalizeSkillToken(skill)));

    const normalizedRequired = dedupeSkills(input.requiredSkills);
    const normalizedPreferred = dedupeSkills(input.preferredSkills);

    const matchedRequired = normalizedRequired.filter((skill) =>
        resumeSkillSet.has(normalizeSkillToken(skill))
    );
    const matchedPreferred = normalizedPreferred.filter((skill) =>
        resumeSkillSet.has(normalizeSkillToken(skill))
    );

    const requiredCoverage = normalizedRequired.length
        ? (matchedRequired.length / normalizedRequired.length) * 100
        : 100;
    const preferredCoverage = normalizedPreferred.length
        ? (matchedPreferred.length / normalizedPreferred.length) * 100
        : 0;

    const overall = clampPercent(requiredCoverage * 0.8 + preferredCoverage * 0.2);

    return {
        source: 'heuristic',
        overallScorePercent: overall,
        requiredCoveragePercent: clampPercent(requiredCoverage),
        preferredCoveragePercent: clampPercent(preferredCoverage),
        matchedRequired,
        matchedPreferred,
        summary:
            'Computed using deterministic skill overlap because AI scoring is unavailable for this request.',
        fallbackReason,
    };
}

function tryParseGroqOutput(response: unknown): ResumeAiScoringResult | null {
    const content =
        typeof response === 'object' &&
        response !== null &&
        'choices' in response &&
        Array.isArray((response as { choices?: unknown[] }).choices)
            ? (
                  (response as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]
                      ?.message?.content ?? null
              )
            : null;

    if (!content) {
        return null;
    }

    const parsed =
        typeof content === 'string'
            ? JSON.parse(content)
            : typeof content === 'object'
              ? content
              : null;

    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    const matchedRequired = Array.isArray(parsed.matchedRequired)
        ? parsed.matchedRequired.filter((value: unknown): value is string => typeof value === 'string')
        : [];
    const matchedPreferred = Array.isArray(parsed.matchedPreferred)
        ? parsed.matchedPreferred.filter((value: unknown): value is string => typeof value === 'string')
        : [];

    return {
        source: 'groq',
        overallScorePercent: clampPercent(Number(parsed.overallScorePercent)),
        requiredCoveragePercent: clampPercent(Number(parsed.requiredCoveragePercent)),
        preferredCoveragePercent: clampPercent(Number(parsed.preferredCoveragePercent)),
        matchedRequired: dedupeSkills(matchedRequired),
        matchedPreferred: dedupeSkills(matchedPreferred),
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'Groq score generated successfully.',
    };
}

export async function scoreResumeWithAi(input: ResumeAiScoringInput): Promise<ResumeAiScoringResult> {
    const cleanedInput: ResumeAiScoringInput = {
        roleTitle: input.roleTitle?.trim() || 'Unknown Role',
        resumeSkills: dedupeSkills(input.resumeSkills),
        requiredSkills: dedupeSkills(input.requiredSkills),
        preferredSkills: dedupeSkills(input.preferredSkills),
    };

    if (!env.GROQ_API_KEY || cleanedInput.resumeSkills.length === 0) {
        const fallbackReason = !env.GROQ_API_KEY ? 'missing_groq_api_key' : 'empty_resume_skills';

        logger.warn(
            {
                roleTitle: cleanedInput.roleTitle,
                resumeSkillCount: cleanedInput.resumeSkills.length,
                fallbackReason,
            },
            'resume-ai-score: falling back before Groq request'
        );

        return calculateHeuristicScore(cleanedInput, fallbackReason);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: env.GROQ_MODEL,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a hiring-assistant scoring model. Score resume-job skill fit. Return ONLY valid JSON with this exact object shape: {"overallScorePercent": number 0-100, "requiredCoveragePercent": number 0-100, "preferredCoveragePercent": number 0-100, "matchedRequired": string[], "matchedPreferred": string[], "summary": string}. Do not include markdown, prose, or extra keys.',
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({
                            roleTitle: cleanedInput.roleTitle,
                            resumeSkills: cleanedInput.resumeSkills,
                            requiredSkills: cleanedInput.requiredSkills,
                            preferredSkills: cleanedInput.preferredSkills,
                            scoringPolicy: {
                                requiredWeight: 0.8,
                                preferredWeight: 0.2,
                                guidance:
                                    'Strongly penalize missing required skills. Preferred skills boost score but cannot fully offset missing required skills.',
                            },
                        }),
                    },
                ],
                response_format: {
                    type: 'json_object',
                },
                max_completion_tokens: 400,
                temperature: 0.1,
            }),
        });

        if (!response.ok) {
            const fallbackReason = response.status === 429 ? 'groq_rate_limited' : 'groq_http_error';

            logger.warn(
                {
                    roleTitle: cleanedInput.roleTitle,
                    resumeSkillCount: cleanedInput.resumeSkills.length,
                    status: response.status,
                    statusText: response.statusText,
                    fallbackReason,
                },
                'resume-ai-score: Groq request returned non-success status'
            );

            return calculateHeuristicScore(cleanedInput, fallbackReason);
        }

        const payload = await response.json();
        const aiResult = tryParseGroqOutput(payload);

        if (!aiResult) {
            logger.warn(
                {
                    roleTitle: cleanedInput.roleTitle,
                    resumeSkillCount: cleanedInput.resumeSkills.length,
                },
                'resume-ai-score: Groq response could not be parsed, using fallback'
            );

            return calculateHeuristicScore(cleanedInput, 'groq_parse_error');
        }

        return aiResult;
    } catch (error) {
        logger.error(
            {
                err: error,
                roleTitle: cleanedInput.roleTitle,
                resumeSkillCount: cleanedInput.resumeSkills.length,
            },
            'resume-ai-score: Groq request failed, using fallback'
        );

        return calculateHeuristicScore(cleanedInput, 'groq_request_failed');
    }
}
