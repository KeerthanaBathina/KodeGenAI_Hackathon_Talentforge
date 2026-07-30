/**
 * Integration tests for approval policies API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/db/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import * as jwt from 'jsonwebtoken';
import { env } from '@/config/env';

describe('Approval Policies API', () => {
  let adminToken: string;
  let adminUser: any;
  let approverUsers: any[] = [];

  beforeEach(async () => {
    // Create admin user
    adminUser = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@test.example.com`,
        fullName: 'Test Admin',
        role: 'admin',
        active: true,
      },
    });

    // Create approver users
    for (let i = 0; i < 2; i++) {
      const approver = await prisma.user.create({
        data: {
          email: `approver${i}-${Date.now()}@test.example.com`,
          fullName: `Approver ${i}`,
          role: 'hr_manager',
          active: true,
        },
      });
      approverUsers.push(approver);
    }

    // Generate JWT token
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    // Clean up old test policies
    await prisma.approvalPolicy.deleteMany({
      where: {
        effectiveFrom: {
          gte: new Date('2026-07-25'),
        },
      },
    });
  });

  afterEach(async () => {
    // Cleanup
    await prisma.approvalPolicy.deleteMany({
      where: {
        effectiveFrom: {
          gte: new Date('2026-07-25'),
        },
      },
    });
    for (const approver of approverUsers) {
      await prisma.user.delete({ where: { id: approver.id } }).catch(() => {});
    }
    await prisma.user.delete({ where: { id: adminUser.id } });
  });

  describe('GET /api/admin/approval-policies', () => {
    beforeEach(async () => {
      await prisma.approvalPolicy.create({
        data: {
          compensationBandMin: new Decimal('50000'),
          compensationBandMax: new Decimal('100000'),
          requiredApprovers: [
            { tier: 1, approverId: approverUsers[0].id, role: 'hr_manager' },
          ],
          effectiveFrom: new Date('2026-07-01'),
          active: true,
        },
      });
    });

    it('should return 200 with list of policies', async () => {
      const res = await request(app)
        .get('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('policies');
      expect(Array.isArray(res.body.policies)).toBe(true);
    });

    it('should filter by compensation amount', async () => {
      const res = await request(app)
        .get('/api/admin/approval-policies?compensationAmount=75000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.policies.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 404 for amount with no policy', async () => {
      const res = await request(app)
        .get('/api/admin/approval-policies?compensationAmount=500000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/admin/approval-policies/history', () => {
    beforeEach(async () => {
      for (let i = 0; i < 2; i++) {
        await prisma.approvalPolicy.create({
          data: {
            compensationBandMin: new Decimal('50000'),
            compensationBandMax: new Decimal('100000'),
            requiredApprovers: [
              { tier: 1, approverId: approverUsers[i].id, role: 'hr_manager' },
            ],
            effectiveFrom: new Date(`2026-0${7 + i}-01`),
            active: true,
          },
        });
      }
    });

    it('should return 200 with policy history', async () => {
      const res = await request(app)
        .get('/api/admin/approval-policies/history')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('policies');
      expect(res.body.policies.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/admin/approval-policies/history?limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.policies.length).toBeLessThanOrEqual(1);
    });
  });

  describe('POST /api/admin/approval-policies', () => {
    it('should create policy with 201', async () => {
      const res = await request(app)
        .post('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          compensationBandMin: 50000,
          compensationBandMax: 100000,
          requiredApprovers: [
            { tier: 1, approverId: approverUsers[0].id, role: 'hr_manager' },
          ],
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.compensationBandMin).toBe('50000');
    });

    it('should reject invalid compensation band', async () => {
      const res = await request(app)
        .post('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          compensationBandMin: 100000,
          compensationBandMax: 50000, // min > max
          requiredApprovers: [
            { tier: 1, approverId: approverUsers[0].id, role: 'hr_manager' },
          ],
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject duplicate tiers', async () => {
      const res = await request(app)
        .post('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          compensationBandMin: 50000,
          compensationBandMax: 100000,
          requiredApprovers: [
            { tier: 1, approverId: approverUsers[0].id, role: 'hr_manager' },
            { tier: 1, approverId: approverUsers[1].id, role: 'hr_manager' },
          ],
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0]).toContain('Duplicate tier');
    });

    it('should reject non-sequential tiers', async () => {
      const res = await request(app)
        .post('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          compensationBandMin: 50000,
          compensationBandMax: 100000,
          requiredApprovers: [
            { tier: 1, approverId: approverUsers[0].id, role: 'hr_manager' },
            { tier: 3, approverId: approverUsers[1].id, role: 'hr_manager' }, // Should be 2
          ],
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0]).toContain('sequential');
    });

    it('should reject retroactive effective dates', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const res = await request(app)
        .post('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          compensationBandMin: 50000,
          compensationBandMax: 100000,
          requiredApprovers: [
            { tier: 1, approverId: approverUsers[0].id, role: 'hr_manager' },
          ],
          effectiveFrom: yesterday.toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0]).toContain('past');
    });

    it('should reject non-existent approver', async () => {
      const res = await request(app)
        .post('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          compensationBandMin: 50000,
          compensationBandMax: 100000,
          requiredApprovers: [
            { tier: 1, approverId: '00000000-0000-0000-0000-000000000000', role: 'hr_manager' },
          ],
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(404);
    });

    it('should require all fields', async () => {
      const res = await request(app)
        .post('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          compensationBandMin: 50000,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/admin/approval-policies/:id/deactivate', () => {
    let policyId: string;

    beforeEach(async () => {
      const policy = await prisma.approvalPolicy.create({
        data: {
          compensationBandMin: new Decimal('50000'),
          compensationBandMax: new Decimal('100000'),
          requiredApprovers: [
            { tier: 1, approverId: approverUsers[0].id, role: 'hr_manager' },
          ],
          effectiveFrom: new Date('2026-08-01'),
          active: true,
        },
      });
      policyId = policy.id;
    });

    it('should deactivate policy and return 200', async () => {
      const res = await request(app)
        .patch(`/api/admin/approval-policies/${policyId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);

      // Verify in DB
      const updated = await prisma.approvalPolicy.findUnique({ where: { id: policyId } });
      expect(updated?.active).toBe(false);
    });

    it('should return 404 for non-existent policy', async () => {
      const res = await request(app)
        .patch('/api/admin/approval-policies/00000000-0000-0000-0000-000000000000/deactivate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Authorization', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/admin/approval-policies');

      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const user = await prisma.user.create({
        data: {
          email: `recruiter-${Date.now()}@test.example.com`,
          fullName: 'Recruiter',
          role: 'recruiter',
          active: true,
        },
      });

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: '24h' },
      );

      const res = await request(app)
        .post('/api/admin/approval-policies')
        .set('Authorization', `Bearer ${token}`)
        .send({
          compensationBandMin: 50000,
          compensationBandMax: 100000,
          requiredApprovers: [
            { tier: 1, approverId: approverUsers[0].id, role: 'hr_manager' },
          ],
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
