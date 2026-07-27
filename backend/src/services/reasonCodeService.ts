import prisma from '../db/prisma';
import logger from '../utils/logger';
import type { ReasonCodeCategory } from '@prisma/client';

export interface ReasonCode {
  id: string;
  category: ReasonCodeCategory;
  code: string;
  displayText: string;
  active: boolean;
}

/**
 * Get active reason codes by category
 * 
 * @param category - The reason code category to filter by
 * @returns Array of active reason codes for the specified category
 */
export async function getReasonCodesByCategory(
  category: ReasonCodeCategory
): Promise<ReasonCode[]> {
  try {
    logger.debug('Fetching reason codes', { category });

    const codes = await prisma.reasonCode.findMany({
      where: {
        category,
        active: true
      },
      orderBy: {
        code: 'asc'
      },
      select: {
        id: true,
        category: true,
        code: true,
        displayText: true,
        active: true
      }
    });

    logger.info('Retrieved reason codes', { 
      category, 
      count: codes.length 
    });

    return codes;
  } catch (error) {
    logger.error('Error fetching reason codes', { 
      category, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Validate that a reason code exists, is active, and matches the expected category
 * 
 * @param reasonCodeId - UUID of the reason code to validate
 * @param expectedCategory - The category the reason code should belong to
 * @returns True if valid, false otherwise
 */
export async function validateReasonCode(
  reasonCodeId: string,
  expectedCategory: ReasonCodeCategory
): Promise<boolean> {
  try {
    logger.debug('Validating reason code', { 
      reasonCodeId, 
      expectedCategory 
    });

    const reasonCode = await prisma.reasonCode.findFirst({
      where: {
        id: reasonCodeId,
        category: expectedCategory,
        active: true
      }
    });

    const isValid = reasonCode !== null;

    logger.debug('Reason code validation result', { 
      reasonCodeId, 
      expectedCategory, 
      isValid 
    });

    return isValid;
  } catch (error) {
    logger.error('Error validating reason code', { 
      reasonCodeId, 
      expectedCategory, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * Get a reason code by ID
 * 
 * @param reasonCodeId - UUID of the reason code
 * @returns The reason code or null if not found
 */
export async function getReasonCodeById(
  reasonCodeId: string
): Promise<ReasonCode | null> {
  try {
    logger.debug('Fetching reason code by ID', { reasonCodeId });

    const reasonCode = await prisma.reasonCode.findUnique({
      where: { id: reasonCodeId },
      select: {
        id: true,
        category: true,
        code: true,
        displayText: true,
        active: true
      }
    });

    return reasonCode;
  } catch (error) {
    logger.error('Error fetching reason code by ID', { 
      reasonCodeId, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
