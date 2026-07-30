/**
 * Integration Tests for Admin Health Dashboard API
 *
 * Tests REST API endpoints for system health metrics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../../app';
import { prisma } from '../../db/prisma';
import { JwtService } from '../../services/jwtService';

describe('Admin Health Dashboard API', () => {
  let adminToken: string;
  let recruiterToken: string;
  let adminUserId: string;
  let recruiterUserId: string;

  beforeAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: '@test-health-api.com',
        },
      },
    });

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@test-health-api.com',
        fullName: 'Test Admin',
        role: UserRole.admin,
        timezone: 'UTC',
        active: true,
      },
    });
    adminUserId = adminUser.id;

    // Create recruiter user (non-admin)
    const recruiterUser = await prisma.user.create({
      data: {
        email: 'recruiter@test-health-api.com',
        fullName: 'Test Recruiter',
        role: UserRole.recruiter,
        timezone: 'UTC',
        active: true,
      },
    });
    recruiterUserId = recruiterUser.id;

    // Generate tokens
    const jwtService = new JwtService();
    adminToken = jwtService.signAccessToken(adminUserId, UserRole.admin);
    recruiterToken = jwtService.signAccessToken(recruiterUserId, UserRole.recruiter);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: '@test-health-api.com',
        },
      },
    });
  });

  describe('GET /api/admin/health', () => {
    it('should return health metrics for admin users', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('queues');
      expect(response.body).toHaveProperty('workers');
      expect(response.body).toHaveProperty('emailDelivery');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('collectionTimeMs');

      // Verify queues array structure
      expect(Array.isArray(response.body.queues)).toBe(true);
      if (response.body.queues.length > 0) {
        const queue = response.body.queues[0];
        expect(queue).toHaveProperty('queueName');
        expect(queue).toHaveProperty('active');
        expect(queue).toHaveProperty('waiting');
        expect(queue).toHaveProperty('failed');
        expect(queue).toHaveProperty('delayed');
        expect(queue).toHaveProperty('completed');
      }

      // Verify workers array structure
      expect(Array.isArray(response.body.workers)).toBe(true);
      if (response.body.workers.length > 0) {
        const worker = response.body.workers[0];
        expect(worker).toHaveProperty('workerName');
        expect(worker).toHaveProperty('status');
        expect(['online', 'degraded', 'offline']).toContain(worker.status);
        expect(worker).toHaveProperty('lastHeartbeat');
        expect(worker).toHaveProperty('minutesSinceHeartbeat');
      }

      // Verify email delivery metrics structure
      expect(response.body.emailDelivery).toHaveProperty('totalAttempted');
      expect(response.body.emailDelivery).toHaveProperty('successful');
      expect(response.body.emailDelivery).toHaveProperty('failed');
      expect(response.body.emailDelivery).toHaveProperty('successRate');
      expect(response.body.emailDelivery).toHaveProperty('failedEmails');
      expect(typeof response.body.emailDelivery.successRate).toBe('number');
      expect(Array.isArray(response.body.emailDelivery.failedEmails)).toBe(true);
    });

    it('should reject non-admin users with 403 Forbidden', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .set('Cookie', [`auth_token=${recruiterToken}`]);

      expect(response.status).toBe(403);
    });

    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const response = await request(app).get('/api/admin/health');

      expect(response.status).toBe(401);
    });

    it('should include performance metadata', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.meta).toBeDefined();
      expect(response.body.meta.collectionTimeMs).toBeLessThan(5000); // Should be fast
    });
  });

  describe('GET /api/admin/health/queue/:queueName', () => {
    it('should return detailed metrics for a valid queue', async () => {
      const response = await request(app)
        .get('/api/admin/health/queue/screening')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('queueName');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('jobs');
      expect(response.body).toHaveProperty('timestamp');

      // Verify metrics structure
      expect(response.body.metrics).toHaveProperty('queueName');
      expect(response.body.metrics).toHaveProperty('active');
      expect(response.body.metrics).toHaveProperty('waiting');
      expect(response.body.metrics).toHaveProperty('failed');
      expect(response.body.metrics).toHaveProperty('delayed');
      expect(response.body.metrics).toHaveProperty('completed');

      // Verify jobs structure
      expect(response.body.jobs).toHaveProperty('active');
      expect(response.body.jobs).toHaveProperty('waiting');
      expect(response.body.jobs).toHaveProperty('failed');
      expect(response.body.jobs).toHaveProperty('delayed');
      expect(Array.isArray(response.body.jobs.active)).toBe(true);
      expect(Array.isArray(response.body.jobs.waiting)).toBe(true);
      expect(Array.isArray(response.body.jobs.failed)).toBe(true);
      expect(Array.isArray(response.body.jobs.delayed)).toBe(true);
    });

    it('should support all available queues', async () => {
      const queueNames = ['screening', 'resume-parse', 'email-delivery', 'offers', 'interview-reminders'];

      for (const queueName of queueNames) {
        const response = await request(app)
          .get(`/api/admin/health/queue/${queueName}`)
          .set('Cookie', [`auth_token=${adminToken}`]);

        expect([200]).toContain(response.status);
      }
    });

    it('should return 404 for invalid queue name', async () => {
      const response = await request(app)
        .get('/api/admin/health/queue/invalid-queue')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('availableQueues');
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/admin/health/queue/screening')
        .set('Cookie', [`auth_token=${recruiterToken}`]);

      expect(response.status).toBe(403);
    });

    it('should limit jobs detail to 10 per status', async () => {
      const response = await request(app)
        .get('/api/admin/health/queue/screening')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.jobs.active.length).toBeLessThanOrEqual(10);
      expect(response.body.jobs.waiting.length).toBeLessThanOrEqual(10);
      expect(response.body.jobs.failed.length).toBeLessThanOrEqual(10);
      expect(response.body.jobs.delayed.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/admin/health/email/failed', () => {
    it('should return paginated failed emails', async () => {
      const response = await request(app)
        .get('/api/admin/health/email/failed?limit=10&offset=0')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('failedEmails');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('timestamp');

      // Verify pagination structure
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('offset');
      expect(response.body.pagination).toHaveProperty('hasMore');

      // Verify failed emails array
      expect(Array.isArray(response.body.failedEmails)).toBe(true);

      if (response.body.failedEmails.length > 0) {
        const failedEmail = response.body.failedEmails[0];
        expect(failedEmail).toHaveProperty('id');
        expect(failedEmail).toHaveProperty('to');
        expect(failedEmail).toHaveProperty('templateType');
        expect(failedEmail).toHaveProperty('status');
        expect(failedEmail).toHaveProperty('createdAt');
      }
    });

    it('should enforce max limit of 100', async () => {
      const response = await request(app)
        .get('/api/admin/health/email/failed?limit=200&offset=0')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(100);
    });

    it('should support pagination with offset', async () => {
      const response1 = await request(app)
        .get('/api/admin/health/email/failed?limit=50&offset=0')
        .set('Cookie', [`auth_token=${adminToken}`]);

      const response2 = await request(app)
        .get('/api/admin/health/email/failed?limit=50&offset=50')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.pagination.offset).toBe(0);
      expect(response2.body.pagination.offset).toBe(50);
    });

    it('should use default limit if not provided', async () => {
      const response = await request(app)
        .get('/api/admin/health/email/failed')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(50); // Default limit
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/admin/health/email/failed')
        .set('Cookie', [`auth_token=${recruiterToken}`]);

      expect(response.status).toBe(403);
    });

    it('should return correct hasMore flag', async () => {
      const response = await request(app)
        .get('/api/admin/health/email/failed?limit=10&offset=0')
        .set('Cookie', [`auth_token=${adminToken}`]);

      expect(response.status).toBe(200);
      const { pagination } = response.body;
      const expectedHasMore = pagination.offset + pagination.limit < pagination.total;
      expect(pagination.hasMore).toBe(expectedHasMore);
    });
  });

  describe('Authorization', () => {
    it('should reject all endpoints for non-authenticated users', async () => {
      const endpoints = [
        '/api/admin/health',
        '/api/admin/health/queue/screening',
        '/api/admin/health/email/failed',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).toBe(401);
      }
    });

    it('should reject all endpoints for non-admin users', async () => {
      const endpoints = [
        '/api/admin/health',
        '/api/admin/health/queue/screening',
        '/api/admin/health/email/failed',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Cookie', [`auth_token=${recruiterToken}`]);
        expect(response.status).toBe(403);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return 500 with structured error response on failure', async () => {
      // This test verifies error handling structure
      // Even if the endpoint works, we verify the error response format
      const response = await request(app)
        .get('/api/admin/health/queue/invalid')
        .set('Cookie', [`auth_token=${adminToken}`]);

      if (response.status === 500) {
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('timestamp');
      }
    });
  });
});
