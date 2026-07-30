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
