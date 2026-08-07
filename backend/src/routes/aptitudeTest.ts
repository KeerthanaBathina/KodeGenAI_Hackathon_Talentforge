import express from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';

const router = express.Router();

const TEST_DURATION_MINUTES = 45;
const TOTAL_QUESTIONS = 30;
const INTERNAL_PROVIDER_NAME = 'Internal Aptitude Portal';

interface AptitudeQuestion {
  id: string;
  category: string;
  topic: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
}

const QUESTION_SET: AptitudeQuestion[] = [
  {
    id: 'Q1',
    category: 'Quantitative Aptitude',
    topic: 'Percentage',
    question: 'A salary is increased by 20% and then reduced by 10%. What is the net percentage change?',
    options: ['8% increase', '10% increase', '12% increase', '2% increase'],
    correctOptionIndex: 0,
  },
  {
    id: 'Q2',
    category: 'Quantitative Aptitude',
    topic: 'Profit and Loss',
    question: 'An item bought for 500 is sold at 575. What is the profit percentage?',
    options: ['12%', '15%', '10%', '18%'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q3',
    category: 'Quantitative Aptitude',
    topic: 'Time and Work',
    question: 'A can finish a task in 12 days and B in 18 days. In how many days can they finish together?',
    options: ['7.2 days', '8 days', '6.5 days', '9 days'],
    correctOptionIndex: 0,
  },
  {
    id: 'Q4',
    category: 'Quantitative Aptitude',
    topic: 'Time Speed Distance',
    question: 'A car travels 180 km in 3 hours. What is its average speed?',
    options: ['50 km/h', '55 km/h', '60 km/h', '65 km/h'],
    correctOptionIndex: 2,
  },
  {
    id: 'Q5',
    category: 'Quantitative Aptitude',
    topic: 'Number System',
    question: 'What is the HCF of 36 and 54?',
    options: ['6', '9', '12', '18'],
    correctOptionIndex: 3,
  },
  {
    id: 'Q6',
    category: 'Quantitative Aptitude',
    topic: 'Algebra',
    question: 'Solve for x: 2x + 5 = 17.',
    options: ['5', '6', '7', '8'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q7',
    category: 'Quantitative Aptitude',
    topic: 'Geometry',
    question: 'The sum of interior angles of a triangle is:',
    options: ['90 degrees', '180 degrees', '270 degrees', '360 degrees'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q8',
    category: 'Quantitative Aptitude',
    topic: 'Mensuration',
    question: 'Area of a circle with radius 7 is:',
    options: ['44', '154', '49', '98'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q9',
    category: 'Quantitative Aptitude',
    topic: 'Data Interpretation',
    question: 'In a pie chart, a sector of 90 degrees represents what fraction of total?',
    options: ['1/2', '1/3', '1/4', '1/5'],
    correctOptionIndex: 2,
  },
  {
    id: 'Q10',
    category: 'Quantitative Aptitude',
    topic: 'Probability',
    question: 'Probability of getting a head in a fair coin toss is:',
    options: ['1/3', '1/4', '1/2', '2/3'],
    correctOptionIndex: 2,
  },
  {
    id: 'Q11',
    category: 'Logical Reasoning',
    topic: 'Blood Relations',
    question: 'If A is B\'s brother and B is C\'s mother, what is A to C?',
    options: ['Father', 'Uncle', 'Brother', 'Grandfather'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q12',
    category: 'Logical Reasoning',
    topic: 'Coding Decoding',
    question: 'If CAT is coded as DBU, DOG is coded as:',
    options: ['EPI', 'EPH', 'EOG', 'DPI'],
    correctOptionIndex: 0,
  },
  {
    id: 'Q13',
    category: 'Logical Reasoning',
    topic: 'Direction Sense',
    question: 'A person walks north 5 km, then east 3 km. How far is the person from start?',
    options: ['8 km', '5.8 km', '4 km', '6 km'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q14',
    category: 'Logical Reasoning',
    topic: 'Syllogisms',
    question: 'All roses are flowers. Some flowers fade quickly. Conclusion: Some roses fade quickly.',
    options: ['Definitely true', 'Definitely false', 'Cannot be determined', 'None'],
    correctOptionIndex: 2,
  },
  {
    id: 'Q15',
    category: 'Logical Reasoning',
    topic: 'Seating Arrangement',
    question: 'If P sits left of Q and right of R, who is in the middle?',
    options: ['P', 'Q', 'R', 'Cannot determine'],
    correctOptionIndex: 0,
  },
  {
    id: 'Q16',
    category: 'Logical Reasoning',
    topic: 'Critical Reasoning',
    question: 'Statement: Sales dropped after price increase. Most likely cause?',
    options: ['Higher demand', 'Price sensitivity', 'Production increase', 'Marketing success'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q17',
    category: 'Verbal Ability',
    topic: 'Grammar',
    question: 'Choose the correct sentence.',
    options: ['He go to office daily.', 'He goes to office daily.', 'He going to office daily.', 'He gone to office daily.'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q18',
    category: 'Verbal Ability',
    topic: 'Vocabulary',
    question: 'Synonym of "Rapid" is:',
    options: ['Slow', 'Quick', 'Weak', 'Dull'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q19',
    category: 'Verbal Ability',
    topic: 'Reading Comprehension',
    question: 'Best approach for comprehension questions is to:',
    options: ['Guess all answers', 'Read passage carefully', 'Skip passage', 'Only read first line'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q20',
    category: 'Verbal Ability',
    topic: 'Sentence Correction',
    question: 'Identify error: "She do not like coffee."',
    options: ['She', 'do', 'not', 'coffee'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q21',
    category: 'Data Sufficiency',
    topic: 'Data Sufficiency',
    question: 'If x+y=10, can x be found uniquely?',
    options: ['Yes, always', 'No, insufficient data', 'Yes, x=5', 'Only if y=0'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q22',
    category: 'Computer Aptitude',
    topic: 'Operating Systems',
    question: 'Which is an operating system?',
    options: ['MS Word', 'Linux', 'Google Chrome', 'MySQL'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q23',
    category: 'Computer Aptitude',
    topic: 'Networking Basics',
    question: 'What does LAN stand for?',
    options: ['Large Area Network', 'Local Area Network', 'Long Access Node', 'Linked Access Network'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q24',
    category: 'Programming Aptitude',
    topic: 'Programming Fundamentals',
    question: 'Which loop is guaranteed to execute at least once?',
    options: ['for', 'while', 'do-while', 'foreach'],
    correctOptionIndex: 2,
  },
  {
    id: 'Q25',
    category: 'Programming Aptitude',
    topic: 'Data Structures',
    question: 'Which data structure follows FIFO?',
    options: ['Stack', 'Queue', 'Tree', 'Heap'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q26',
    category: 'Programming Aptitude',
    topic: 'Algorithms',
    question: 'Binary search requires the array to be:',
    options: ['Random', 'Sorted', 'Reversed', 'Unique only'],
    correctOptionIndex: 1,
  },
  {
    id: 'Q27',
    category: 'Programming Aptitude',
    topic: 'SQL',
    question: 'Which clause is used to filter grouped records?',
    options: ['WHERE', 'ORDER BY', 'HAVING', 'SELECT'],
    correctOptionIndex: 2,
  },
  {
    id: 'Q28',
    category: 'Personality Assessment',
    topic: 'Teamwork',
    question: 'In a team conflict, the best first step is to:',
    options: ['Ignore it', 'Escalate immediately', 'Listen to both sides', 'Blame one person'],
    correctOptionIndex: 2,
  },
  {
    id: 'Q29',
    category: 'Situational Judgment',
    topic: 'Time Management',
    question: 'If two critical tasks clash, best action is to:',
    options: ['Do easier one first', 'Delay both', 'Prioritize by impact and deadline', 'Ask teammate to decide'],
    correctOptionIndex: 2,
  },
  {
    id: 'Q30',
    category: 'Domain Specific Aptitude',
    topic: 'Software Engineering',
    question: 'In Angular, the primary unit of UI composition is:',
    options: ['Service', 'Directive', 'Component', 'Module only'],
    correctOptionIndex: 2,
  },
];

const SubmitSchema = z.object({
  answers: z.record(z.string(), z.number().int().min(0).max(3)),
});

function stripAnswer(question: AptitudeQuestion) {
  return {
    id: question.id,
    category: question.category,
    topic: question.topic,
    question: question.question,
    options: question.options,
  };
}

router.get('/:token', async (req, res) => {
  const { token } = req.params;

  const session = await prisma.assessmentSession.findFirst({
    where: {
      sessionToken: token,
      status: {
        in: ['in_progress', 'completed'],
      },
      provider: {
        name: INTERNAL_PROVIDER_NAME,
      },
    },
    select: {
      id: true,
      launchedAt: true,
      completedAt: true,
      status: true,
      score: true,
      applicationId: true,
      application: {
        select: {
          candidate: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          requisition: {
            select: {
              title: true,
            },
          },
        },
      },
      metadata: true,
    },
  });

  if (!session) {
    res.status(404).json({ error: 'Test session not found' });
    return;
  }

  const expiresAt = new Date(session.launchedAt.getTime() + TEST_DURATION_MINUTES * 60 * 1000);
  const remainingSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

  if (session.status === 'in_progress' && remainingSeconds <= 0) {
    await prisma.assessmentSession.update({
      where: { id: session.id },
      data: {
        status: 'expired',
        completedAt: new Date(),
      },
    });

    res.status(410).json({ error: 'Test session expired' });
    return;
  }

  const metadata = (session.metadata ?? {}) as Record<string, unknown>;

  res.status(200).json({
    sessionId: session.id,
    applicationId: session.applicationId,
    status: session.status,
    score: session.score,
    durationMinutes: TEST_DURATION_MINUTES,
    totalQuestions: TOTAL_QUESTIONS,
    launchedAt: session.launchedAt,
    expiresAt,
    remainingSeconds: Math.max(0, remainingSeconds),
    candidateName: `${session.application.candidate.firstName} ${session.application.candidate.lastName}`.trim(),
    requisitionTitle: session.application.requisition.title,
    submittedAt: session.completedAt,
    questions:
      session.status === 'completed'
        ? []
        : QUESTION_SET.map((question) => stripAnswer(question)),
    attemptedCount:
      typeof metadata.attemptedCount === 'number' ? metadata.attemptedCount : 0,
  });
});

router.post('/:token/submit', async (req, res) => {
  const { token } = req.params;
  const parsed = SubmitSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    return;
  }

  const session = await prisma.assessmentSession.findFirst({
    where: {
      sessionToken: token,
      status: 'in_progress',
      provider: {
        name: INTERNAL_PROVIDER_NAME,
      },
    },
    select: {
      id: true,
      launchedAt: true,
      metadata: true,
    },
  });

  if (!session) {
    res.status(404).json({ error: 'Active test session not found' });
    return;
  }

  const expiresAt = new Date(session.launchedAt.getTime() + TEST_DURATION_MINUTES * 60 * 1000);
  if (Date.now() > expiresAt.getTime()) {
    await prisma.assessmentSession.update({
      where: { id: session.id },
      data: {
        status: 'expired',
        completedAt: new Date(),
      },
    });

    res.status(410).json({ error: 'Test session expired' });
    return;
  }

  const answers = parsed.data.answers;
  let correctAnswers = 0;
  let attemptedCount = 0;

  for (const question of QUESTION_SET) {
    if (answers[question.id] === undefined) {
      continue;
    }

    attemptedCount += 1;
    if (answers[question.id] === question.correctOptionIndex) {
      correctAnswers += 1;
    }
  }

  const scorePercent = Number(((correctAnswers / TOTAL_QUESTIONS) * 100).toFixed(2));

  await prisma.assessmentSession.update({
    where: { id: session.id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      score: scorePercent,
      metadata: {
        ...(session.metadata as Record<string, unknown> | null),
        testType: 'aptitude_internal',
        totalQuestions: TOTAL_QUESTIONS,
        attemptedCount,
        correctAnswers,
        incorrectAnswers: attemptedCount - correctAnswers,
      },
    },
  });

  res.status(200).json({
    success: true,
    score: scorePercent,
    totalQuestions: TOTAL_QUESTIONS,
    attemptedCount,
    correctAnswers,
    durationMinutes: TEST_DURATION_MINUTES,
  });
});

export default router;
