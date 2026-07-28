import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import * as preferenceService from '../services/notificationPreferenceService';
import { NotificationChannel, NotificationTypeEnum } from '@prisma/client';
import { isSystemCritical } from '../utils/notificationPreferences';
import { prisma } from '../db/prisma';

const router = Router();

/**
 * GET /api/notification-preferences
 * Get all preferences for authenticated user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const preferences = await preferenceService.getUserPreferences(userId);

    // Enhance with system-critical flag
    const enhanced = preferences.map(pref => ({
      ...pref,
      isSystemCritical: isSystemCritical(pref.notificationType)
    }));

    res.json({ preferences: enhanced });
  } catch (error) {
    console.error('[notificationPreferences] Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

/**
 * PATCH /api/notification-preferences/:type/:channel
 * Update a single preference
 */
router.patch('/:type/:channel', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const notificationType = req.params.type as NotificationTypeEnum;
    const channel = req.params.channel as NotificationChannel;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    // Validate enum values
    if (!Object.values(NotificationTypeEnum).includes(notificationType)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }
    if (!Object.values(NotificationChannel).includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    const preference = await preferenceService.updatePreference(
      userId,
      notificationType,
      channel,
      enabled
    );

    res.json({
      preference: {
        ...preference,
        isSystemCritical: isSystemCritical(notificationType)
      }
    });
  } catch (error: any) {
    console.error('[notificationPreferences] Error updating preference:', error);
    if (error.message?.includes('system-critical')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update preference' });
  }
});

/**
 * POST /api/notification-preferences/bulk
 * Bulk update preferences
 */
router.post('/bulk', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { preferences } = req.body;

    if (!Array.isArray(preferences)) {
      return res.status(400).json({ error: 'preferences must be an array' });
    }

    const count = await preferenceService.bulkUpdatePreferences(userId, preferences);

    res.json({ updatedCount: count });
  } catch (error) {
    console.error('[notificationPreferences] Error bulk updating:', error);
    res.status(500).json({ error: 'Failed to bulk update preferences' });
  }
});

/**
 * POST /api/notification-preferences/reset
 * Reset all preferences to defaults (all enabled)
 */
router.post('/reset', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Delete existing preferences
    await prisma.notificationPreference.deleteMany({ where: { userId } });

    // Reinitialize defaults
    const count = await preferenceService.initializeDefaultPreferences(userId);

    res.json({ message: 'Preferences reset to defaults', createdCount: count });
  } catch (error) {
    console.error('[notificationPreferences] Error resetting preferences:', error);
    res.status(500).json({ error: 'Failed to reset preferences' });
  }
});

export default router;
