import { prisma } from '../src/db/prisma';
import { createNotification } from '../src/services/notificationService';
import { NotificationEventType } from '../src/types/notification';
import { NotificationTypeEnum, NotificationChannel } from '@prisma/client';

async function testPreferenceDelivery() {
  const testUserId = process.argv[2];
  
  if (!testUserId) {
    console.error('Usage: ts-node test-preference-delivery.ts <userId>');
    console.error('Example: ts-node test-preference-delivery.ts user-123');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Notification Preference Delivery Integration Test');
  console.log(`${'='.repeat(60)}\n`);
  console.log(`Testing preference delivery for user: ${testUserId}\n`);

  try {
    // Test 1: Verify user exists
    console.log('Step 1: Verifying user exists...');
    const user = await prisma.user.findUnique({
      where: { id: testUserId }
    });

    if (!user) {
      console.error(`❌ User ${testUserId} not found`);
      process.exit(1);
    }
    console.log(`✅ User found: ${user.email}\n`);

    // Test 2: Check current preferences
    console.log('Step 2: Checking current preferences...');
    const currentPreferences = await prisma.notificationPreference.findMany({
      where: {
        userId: testUserId,
        notificationType: NotificationTypeEnum.REVIEW_ASSIGNED
      }
    });
    console.log(`Found ${currentPreferences.length} preferences for REVIEW_ASSIGNED`);
    currentPreferences.forEach(pref => {
      console.log(`  - ${pref.channel}: ${pref.enabled ? 'ENABLED' : 'DISABLED'}`);
    });
    console.log('');

    // Test 3: Create notification with IN_APP enabled
    console.log('Step 3: Testing notification creation with IN_APP enabled...');
    const notif1 = await createNotification(testUserId, NotificationEventType.REVIEW_ASSIGNED, {
      title: 'Test Notification (Should Be Created)',
      message: 'This notification should be created if IN_APP preference is enabled',
      entityType: 'application',
      entityId: 'test-app-1'
    });
    
    if (notif1) {
      console.log(`✅ Notification created: ${notif1.id}`);
    } else {
      console.log(`ℹ️  Notification skipped (IN_APP preference disabled)`);
    }
    console.log('');

    // Test 4: Disable IN_APP preference
    console.log('Step 4: Disabling IN_APP preference...');
    const inAppPref = currentPreferences.find(p => p.channel === NotificationChannel.IN_APP);
    
    if (inAppPref) {
      await prisma.notificationPreference.update({
        where: { id: inAppPref.id },
        data: { enabled: false }
      });
      console.log('✅ IN_APP preference disabled');
    } else {
      console.log('⚠️  IN_APP preference not found, creating disabled preference');
      await prisma.notificationPreference.create({
        data: {
          userId: testUserId,
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.IN_APP,
          enabled: false
        }
      });
      console.log('✅ Created disabled IN_APP preference');
    }
    console.log('');

    // Test 5: Create notification with IN_APP disabled
    console.log('Step 5: Testing notification creation with IN_APP disabled...');
    const notif2 = await createNotification(testUserId, NotificationEventType.REVIEW_ASSIGNED, {
      title: 'Test Notification 2 (Should Be Skipped)',
      message: 'This notification should be skipped because IN_APP preference is disabled',
      entityType: 'application',
      entityId: 'test-app-2'
    });
    
    if (notif2) {
      console.log(`❌ Notification created: ${notif2.id} (UNEXPECTED - should have been skipped)`);
    } else {
      console.log(`✅ Notification correctly skipped (IN_APP preference disabled)`);
    }
    console.log('');

    // Test 6: Re-enable preference
    console.log('Step 6: Re-enabling IN_APP preference...');
    if (inAppPref) {
      await prisma.notificationPreference.update({
        where: { id: inAppPref.id },
        data: { enabled: true }
      });
    } else {
      await prisma.notificationPreference.updateMany({
        where: {
          userId: testUserId,
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.IN_APP
        },
        data: { enabled: true }
      });
    }
    console.log('✅ IN_APP preference re-enabled');
    console.log('');

    // Test 7: Verify re-enabled preference works
    console.log('Step 7: Testing notification creation after re-enabling...');
    const notif3 = await createNotification(testUserId, NotificationEventType.REVIEW_ASSIGNED, {
      title: 'Test Notification 3 (Should Be Created)',
      message: 'This notification should be created now that preference is re-enabled',
      entityType: 'application',
      entityId: 'test-app-3'
    });
    
    if (notif3) {
      console.log(`✅ Notification created: ${notif3.id}`);
    } else {
      console.log(`❌ Notification skipped (UNEXPECTED - preference should be enabled)`);
    }
    console.log('');

    // Test Summary
    console.log(`${'='.repeat(60)}`);
    console.log('Test Summary');
    console.log(`${'='.repeat(60)}\n`);
    
    const results = [
      { test: 'User verification', passed: !!user },
      { test: 'Notification with enabled preference', passed: !!notif1 },
      { test: 'Notification with disabled preference', passed: !notif2 },
      { test: 'Notification after re-enabling', passed: !!notif3 }
    ];

    results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status}: ${result.test}`);
    });

    const allPassed = results.every(r => r.passed);
    console.log('');
    if (allPassed) {
      console.log('✅ All tests passed!');
    } else {
      console.log('❌ Some tests failed');
    }
    console.log('');

  } catch (error) {
    console.error('\n❌ Error during test execution:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPreferenceDelivery();
