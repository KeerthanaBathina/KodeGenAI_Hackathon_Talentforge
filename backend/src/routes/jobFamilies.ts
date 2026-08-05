import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { prisma } from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

router.get('/', authenticate, authorize(['admin']), async (_req: Request, res: Response) => {
  try {
    const jobFamilies = await prisma.jobFamily.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.status(200).json({
      jobFamilies,
      count: jobFamilies.length,
    });
  } catch (error) {
    logger.error({ error }, 'Unable to retrieve job families');

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to retrieve job families',
      },
    });
  }
});

export default router;