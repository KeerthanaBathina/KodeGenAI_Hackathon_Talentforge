---
id: task_001
us_id: us_004
epic: EP-008
title: "Database Schema for Notification Preferences"
status: completed
layer: backend
effort: 1.5h
priority: high
created: 2026-07-28
completed: 2026-07-28
dependencies: []
---

# TASK-001 — Database Schema for Notification Preferences

## Context

**User Story**: US-004 — Notification Preference Centre with Per-Channel Opt-In/Out  
**Epic**: EP-008 — Communication Service  
**Addresses**: Foundation for all scenarios

Create the database schema for storing user notification preferences across channels (email, in-app). Each user can opt in/out of specific notification types per channel, with system-critical notifications enforced as always-enabled.

---

## Objective

Implement notification preferences persistence layer with:
1. Prisma schema for notification_preferences table
2. Database migration
3. Notification type enum with system-critical flags
4. Channel enum (email, in-app)
5. Default preference seeding for existing users

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Table name | `notification_preferences` |
| Primary key | `id` (UUID) |
| User relation | `userId` (UUID, foreign key to users) |
| Notification type | `notificationType` (enum matching NotificationEventType) |
| Channel | `channel` (enum: EMAIL, IN_APP) |
| Enabled flag | `enabled` (boolean, default true) |
| Unique constraint | `(userId, notificationType, channel)` |
| Timestamps | `createdAt`, `updatedAt` |

**System-Critical Notification Types** (hardcoded, cannot be disabled):
- None currently (reserved for future security alerts)

---

## Implementation Steps

### Step 1 — Add Prisma enums

1. Edit `backend/prisma/schema.prisma`
2. Add channel enum:
   ```prisma
   enum NotificationChannel {
     EMAIL
     IN_APP
   }
   ```

3. Add notification type enum (matches backend enum):
   ```prisma
   enum NotificationTypeEnum {
     APPLICATION_SUBMITTED
     REVIEW_ASSIGNED
     DECISION_MADE
     INTERVIEW_SCHEDULED
     SCORECARD_SUBMITTED
     OFFER_APPROVED
     OFFER_EXTENDED
     SLA_WARNING
     PATH_OVERRIDE_REQUESTED
   }
   ```

### Step 2 — Add NotificationPreference model

1. Add model to schema.prisma:
   ```prisma
   model NotificationPreference {
     id               String                 @id @default(uuid()) @db.Uuid
     userId           String                 @db.Uuid
     user             User                   @relation("UserNotificationPreferences", fields: [userId], references: [id], onDelete: Cascade)
     notificationType NotificationTypeEnum
     channel          NotificationChannel
     enabled          Boolean                @default(true)
     createdAt        DateTime               @default(now())
     updatedAt        DateTime               @updatedAt

     @@unique([userId, notificationType, channel], name: "user_notification_channel_unique")
     @@index([userId], name: "notification_pref_user_idx")
     @@map("notification_preferences")
   }
   ```

2. Add relation to User model:
   ```prisma
   model User {
     // ... existing fields
     notificationPreferences NotificationPreference[] @relation("UserNotificationPreferences")
   }
   ```

### Step 3 — Generate migration

1. Run Prisma migration:
   ```bash
   cd backend
   npx prisma migrate dev --name add_notification_preferences
   ```

2. Verify migration file created in `prisma/migrations/`

3. Run `npx prisma generate` to update Prisma client types

### Step 4 — Create default preferences seed

1. Create `backend/prisma/seed-notification-preferences.ts`
2. Implement seeding logic to create default preferences for existing users:

   ```typescript
   import { PrismaClient, NotificationTypeEnum, NotificationChannel } from '@prisma/client';

   const prisma = new PrismaClient();

   const ALL_NOTIFICATION_TYPES = Object.values(NotificationTypeEnum);
   const ALL_CHANNELS = Object.values(NotificationChannel);

   async function seedNotificationPreferences() {
     console.log('[seed] Seeding notification preferences for existing users...');
     
     // Get all users
     const users = await prisma.user.findMany({ select: { id: true } });
     
     console.log(`[seed] Found ${users.length} users`);
     
     for (const user of users) {
       // Check if user already has preferences
       const existingCount = await prisma.notificationPreference.count({
         where: { userId: user.id }
       });
       
       if (existingCount > 0) {
         console.log(`[seed] User ${user.id} already has preferences, skipping`);
         continue;
       }
       
       // Create default preferences (all enabled)
       const preferences = ALL_NOTIFICATION_TYPES.flatMap(type =>
         ALL_CHANNELS.map(channel => ({
           userId: user.id,
           notificationType: type,
           channel,
           enabled: true
         }))
       );
       
       await prisma.notificationPreference.createMany({
         data: preferences,
         skipDuplicates: true
       });
       
       console.log(`[seed] Created ${preferences.length} default preferences for user ${user.id}`);
     }
     
     console.log('[seed] Notification preferences seeding complete');
   }

   seedNotificationPreferences()
     .catch(console.error)
     .finally(() => prisma.$disconnect());
   ```

3. Add script to package.json:
   ```json
   {
     "scripts": {
       "seed:preferences": "ts-node prisma/seed-notification-preferences.ts"
     }
   }
   ```

4. Run seed script:
   ```bash
   npm run seed:preferences
   ```

### Step 5 — Add utility functions for system-critical types

1. Create `backend/src/utils/notificationPreferences.ts`
2. Define system-critical types:
   ```typescript
   import { NotificationTypeEnum } from '@prisma/client';

   /**
    * Notification types that cannot be disabled by users.
    * These are critical for security or system operation.
    */
   export const SYSTEM_CRITICAL_NOTIFICATION_TYPES: Set<NotificationTypeEnum> = new Set([
     // Reserved for future security alerts
     // Example: NotificationTypeEnum.SECURITY_ALERT
   ]);

   /**
    * Check if a notification type is system-critical (cannot be disabled)
    */
   export function isSystemCritical(notificationType: NotificationTypeEnum): boolean {
     return SYSTEM_CRITICAL_NOTIFICATION_TYPES.has(notificationType);
   }

   /**
    * Get all notification types that can be user-configured
    */
   export function getConfigurableNotificationTypes(): NotificationTypeEnum[] {
     return Object.values(NotificationTypeEnum).filter(
       type => !isSystemCritical(type)
     );
   }
   ```

### Step 6 — Add TypeScript types

1. Create `backend/src/types/notificationPreference.ts`:
   ```typescript
   import { NotificationChannel, NotificationTypeEnum } from '@prisma/client';

   export interface NotificationPreferenceDTO {
     id: string;
     userId: string;
     notificationType: NotificationTypeEnum;
     channel: NotificationChannel;
     enabled: boolean;
     isSystemCritical: boolean;
     createdAt: Date;
     updatedAt: Date;
   }

   export interface UpdatePreferenceRequest {
     notificationType: NotificationTypeEnum;
     channel: NotificationChannel;
     enabled: boolean;
   }

   export interface BulkUpdatePreferencesRequest {
     preferences: UpdatePreferenceRequest[];
   }
   ```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Schema valid | `npx prisma validate` | No errors |
| Migration applied | Database query | `notification_preferences` table exists |
| Enums created | Database query | 2 new enums in schema |
| Unique constraint | Attempt duplicate insert | Error on duplicate (userId, type, channel) |
| Cascade delete | Delete user | All user preferences deleted |
| Index exists | Database query | Index on userId created |
| Default seed | Run seed script | All users have 18 default preferences (9 types × 2 channels) |
| System-critical util | Unit test | `isSystemCritical()` returns false for all current types |

---

## Definition of Done

- [x] Prisma enums added (`NotificationChannel`, `NotificationTypeEnum`)
- [x] `NotificationPreference` model added to schema
- [x] User relation added
- [x] Database migration generated and applied successfully
- [x] Unique constraint on (userId, notificationType, channel)
- [x] Index on userId created
- [x] Seed script created for default preferences
- [x] Default preferences seeded for existing users (if any)
- [x] System-critical utility functions created
- [x] TypeScript types defined for preference DTOs
- [x] `npx prisma generate` executed successfully
- [x] Schema validation passes (`npx prisma validate`)

---

## Dependencies

None — this is the foundation task for US-004.

---

## Notes

- All notification types are user-configurable by default
- System-critical types set is empty but reserved for future security alerts
- Default preference is `enabled: true` for all types and channels
- Seed script is idempotent (checks existing preferences before creating)
- Migration includes proper cascading delete when user is deleted
