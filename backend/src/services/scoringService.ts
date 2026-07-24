import logger from '../utils/logger';

export interface ScoringFactors {
    positiveFactors: string[];
    skillGaps: string[];
    scoreBreakdown: {
        skillMatch: number; // 0-50 points
        experienceMatch: number; // 0-30 points
        educationMatch: number; // 0-20 points
    };
}

export interface ScoringInput {
    // From parsed resume
    parsedData: {
        skills: string[];
        experience_years: number;
        education: Array<{
            degree: string;
            field: string;
            institution: string;
        }>;
        employers: Array<{
            name: string;
            title: string;
        }>;
    };
    // From requisition
    requisition: {
        requiredSkills: string[];
        preferredSkills: string[];
        minExperienceYears: number;
        educationLevel: string | null; // "high_school" | "bachelors" | "masters" | "phd"
    };
}

const EDUCATION_HIERARCHY: Record<string, number> = {
    high_school: 0,
    associate: 1,
    bachelors: 2,
    bachelor: 2, // Alias
    masters: 3,
    master: 3, // Alias
    phd: 4,
    doctorate: 4, // Alias
};

export function computeScreeningScore(input: ScoringInput): {
    score: number;
    factors: ScoringFactors;
} {
    const { parsedData, requisition } = input;

    // 1. Skill Match (0-50 points)
    const skillScore = computeSkillScore(
        parsedData.skills,
        requisition.requiredSkills,
        requisition.preferredSkills
    );

    // 2. Experience Match (0-30 points)
    const experienceScore = computeExperienceScore(
        parsedData.experience_years,
        requisition.minExperienceYears
    );

    // 3. Education Match (0-20 points)
    const educationScore = computeEducationScore(
        parsedData.education,
        requisition.educationLevel
    );

    const totalScore = Math.round(
        skillScore.score + experienceScore.score + educationScore.score
    );

    // Compile factors
    const positiveFactors: string[] = [
        ...skillScore.matchedSkills.map((s) => `Skill: ${s}`),
        ...experienceScore.factors,
        ...educationScore.factors,
    ];

    const skillGaps: string[] = [
        ...skillScore.missingRequired.map((s) => `Missing required skill: ${s}`),
        ...skillScore.missingPreferred.map((s) => `Missing preferred skill: ${s}`),
    ];

    const factors: ScoringFactors = {
        positiveFactors,
        skillGaps,
        scoreBreakdown: {
            skillMatch: Math.round(skillScore.score),
            experienceMatch: Math.round(experienceScore.score),
            educationMatch: Math.round(educationScore.score),
        },
    };

    logger.info('Screening score computed', {
        totalScore,
        breakdown: factors.scoreBreakdown,
        positiveCount: positiveFactors.length,
        gapCount: skillGaps.length,
    });

    return {
        score: Math.min(100, Math.max(0, totalScore)), // Clamp to 0-100
        factors,
    };
}

function computeSkillScore(
    candidateSkills: string[],
    requiredSkills: string[],
    preferredSkills: string[]
): {
    score: number;
    matchedSkills: string[];
    missingRequired: string[];
    missingPreferred: string[];
} {
    const normalizedCandidate = candidateSkills.map((s) => s.toLowerCase().trim());

    // Required skills: 30 points max (essential)
    const normalizedRequired = requiredSkills.map((s) => s.toLowerCase().trim());
    const matchedRequired = normalizedRequired.filter((req) =>
        normalizedCandidate.some((cand) => cand.includes(req) || req.includes(cand))
    );
    const missingRequired = normalizedRequired.filter((req) => !matchedRequired.includes(req));

    const requiredScore =
        requiredSkills.length > 0 ? (matchedRequired.length / requiredSkills.length) * 30 : 0;

    // Preferred skills: 20 points max (nice-to-have)
    const normalizedPreferred = preferredSkills.map((s) => s.toLowerCase().trim());
    const matchedPreferred = normalizedPreferred.filter((pref) =>
        normalizedCandidate.some((cand) => cand.includes(pref) || pref.includes(cand))
    );
    const missingPreferred = normalizedPreferred.filter((pref) => !matchedPreferred.includes(pref));

    const preferredScore =
        preferredSkills.length > 0 ? (matchedPreferred.length / preferredSkills.length) * 20 : 0;

    return {
        score: requiredScore + preferredScore,
        matchedSkills: [
            ...requiredSkills.filter((s) => matchedRequired.includes(s.toLowerCase())),
            ...preferredSkills.filter((s) => matchedPreferred.includes(s.toLowerCase())),
        ],
        missingRequired: requiredSkills.filter((s) => missingRequired.includes(s.toLowerCase())),
        missingPreferred: preferredSkills.filter((s) => missingPreferred.includes(s.toLowerCase())),
    };
}

function computeExperienceScore(
    candidateYears: number,
    requiredYears: number
): {
    score: number;
    factors: string[];
} {
    if (requiredYears === 0) {
        return { score: 30, factors: ['No experience requirement'] };
    }

    const ratio = candidateYears / requiredYears;

    let score = 0;
    const factors: string[] = [];

    if (ratio >= 1.5) {
        score = 30;
        factors.push(
            `${candidateYears} years experience (significantly exceeds ${requiredYears} required)`
        );
    } else if (ratio >= 1.0) {
        score = 25;
        factors.push(`${candidateYears} years experience (meets ${requiredYears} required)`);
    } else if (ratio >= 0.75) {
        score = 20;
        factors.push(`${candidateYears} years experience (close to ${requiredYears} required)`);
    } else if (ratio >= 0.5) {
        score = 10;
        factors.push(`${candidateYears} years experience (below ${requiredYears} required)`);
    } else {
        score = 0;
        factors.push(
            `${candidateYears} years experience (significantly below ${requiredYears} required)`
        );
    }

    return { score, factors };
}

function computeEducationScore(
    candidateEducation: Array<{ degree: string; field: string }>,
    requiredLevel: string | null
): {
    score: number;
    factors: string[];
} {
    if (!requiredLevel || requiredLevel === 'none') {
        return { score: 20, factors: ['No education requirement'] };
    }

    const requiredRank = EDUCATION_HIERARCHY[requiredLevel.toLowerCase()] ?? 0;

    // Find highest education level
    let highestRank = -1;
    let highestDegree = '';

    for (const edu of candidateEducation) {
        const degreeNormalized = edu.degree.toLowerCase();
        for (const [level, rank] of Object.entries(EDUCATION_HIERARCHY)) {
            if (degreeNormalized.includes(level)) {
                if (rank > highestRank) {
                    highestRank = rank;
                    highestDegree = edu.degree;
                }
            }
        }
    }

    if (highestRank === -1) {
        return { score: 0, factors: ['No recognized degree found'] };
    }

    let score = 0;
    const factors: string[] = [];

    if (highestRank > requiredRank) {
        score = 20;
        factors.push(`${highestDegree} (exceeds requirement)`);
    } else if (highestRank === requiredRank) {
        score = 18;
        factors.push(`${highestDegree} (meets requirement)`);
    } else if (highestRank === requiredRank - 1) {
        score = 10;
        factors.push(`${highestDegree} (one level below requirement)`);
    } else {
        score = 0;
        factors.push(`${highestDegree} (below requirement)`);
    }

    return { score, factors };
}
