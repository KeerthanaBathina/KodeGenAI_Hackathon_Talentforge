/**
 * Integration tests for scoring thresholds API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/db/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import * as jwt from 'jsonwebtoken';
import { env } from '@/config/env';

describe('Scoring Thresholds API', () => {
  let adminToken: string;
  let adminUser: any;
  let jobFamily: any;

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

    // Create job family
    jobFamily = await prisma.jobFamily.create({
      data: {
        name: `TestFamily-${Date.now()}`,
      },
    });

    // Generate JWT token
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    // Clean up old test thresholds
    await prisma.scoringThreshold.deleteMany({
      where: {
        effectiveFrom: {
          gte: new Date('2026-07-25'),
        },
      },
    });
  });

  afterEach(async () => {
    // Cleanup
    await prisma.scoringThreshold.deleteMany({
      where: {
        effectiveFrom: {
          gte: new Date('2026-07-25'),
        },
      },
    });
    await prisma.jobFamily.delete({ where: { id: jobFamily.id } });
    await prisma.user.delete({ where: { id: adminUser.id } });
  });

  describe('GET /api/admin/scoring-thresholds', () => {
    beforeEach(async () => {
      await prisma.scoringThreshold.create({
        data: {
          jobFamilyId: jobFamily.id,
          aiShortlistThreshold: new Decimal('0.85'),
          confidenceThreshold: new Decimal('0.75'),
          experienceThresholdYears: 5,
          effectiveFrom: new Date('2026-07-01'),
          createdBy: adminUser.id,
        },
      });
    });

    it('should return 200 with all thresholds', async () => {
      const res = await request(app)
        .get('/api/admin/scoring-thresholds')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('thresholds');
      expect(Array.isArray(res.body.thresholds)).toBe(true);
    });

    it('should filter by jobFamilyId', async () => {
      const res = await request(app)
        .get(`/api/admin/scoring-thresholds?jobFamilyId=${jobFamily.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.thresholds.length).toBeGreaterThanOrEqual(1);
      expect(res.body.thresholds[0].jobFamilyId).toBe(jobFamily.id);
    });

    it('should return only active when flag is true', async () => {
      const res = await request(app)
        .get('/api/admin/scoring-thresholds?activeOnly=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.thresholds)).toBe(true);
    });
  });

  describe('GET /api/admin/scoring-thresholds/:jobFamilyId/history', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await prisma.scoringThreshold.create({
          data: {
            jobFamilyId: jobFamily.id,
            aiShortlistThreshold: new Decimal('0.85'),
            confidenceThreshold: new Decimal((0.75 - i * 0.1).toFixed(2)),
            experienceThresholdYears: 5 + i,
            effectiveFrom: new Date(`2026-0${7 + i}-01`),
            createdBy: adminUser.id,
          },
        });
      }
    });

    it('should return 200 with history for job family', async () => {
      const res = await request(app)
        .get(`/api/admin/scoring-thresholds/${jobFamily.id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('versions');
      expect(res.body.versions.length).toBeGreaterThanOrEqual(3);
    });

    it('should return 404 for non-existent job family', async () => {
      const res = await request(app)
        .get('/api/admin/scoring-thresholds/00000000-0000-0000-0000-000000000000/history')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get(`/api/admin/scoring-thresholds/${jobFamily.id}/history?limit=2`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.versions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /api/admin/scoring-thresholds/:jobFamilyId/effective', () => {
    beforeEach(async () => {
      await prisma.scoringThreshold.create({
        data: {
          jobFamilyId: jobFamily.id,
          aiShortlistThreshold: new Decimal('0.85'),
          confidenceThreshold: new Decimal('0.75'),
          experienceThresholdYears: 5,
          effectiveFrom: new Date('2026-07-01'),
          createdBy: adminUser.id,
        },
      });
    });

    it('should return 200 with effective threshold', async () => {
      const res = await request(app)
        .get(`/api/admin/scoring-thresholds/${jobFamily.id}/effective`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('aiShortlistThreshold');
      expect(typeof res.body.aiShortlistThreshold).toBe('number');
    });

    it('should return 404 if no threshold found', async () => {
      const newJobFamily = await prisma.jobFamily.create({
        data: { name: `NoThreshold-${Date.now()}` },
      });

      const res = await request(app)
        .get(`/api/admin/scoring-thresholds/${newJobFamily.id}/effective`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);

      await prisma.jobFamily.delete({ where: { id: newJobFamily.id } });
    });

    it('should support asOfDate parameter', async () => {
      const res = await request(app)
        .get(`/api/admin/scoring-thresholds/${jobFamily.id}/effective?asOfDate=2026-07-15T00:00:00Z`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('effectiveFrom');
    });
  });

  describe('POST /api/admin/scoring-thresholds', () => {
    it('should create new threshold with 201', async () => {
      const res = await request(app)
        .post('/api/admin/scoring-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          jobFamilyId: jobFamily.id,
          aiShortlistThreshold: 0.85,
          confidenceThreshold: 0.75,
          experienceThresholdYears: 5,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.jobFamilyId).toBe(jobFamily.id);
    });

    it('should reject invalid aiShortlistThreshold', async () => {
      const res = await request(app)
        .post('/api/admin/scoring-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          jobFamilyId: jobFamily.id,
          aiShortlistThreshold: 1.5, // > 1.0
          confidenceThreshold: 0.75,
          experienceThresholdYears: 5,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid experience years', async () => {
      const res = await request(app)
        .post('/api/admin/scoring-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          jobFamilyId: jobFamily.id,
          aiShortlistThreshold: 0.85,
          confidenceThreshold: 0.75,
          experienceThresholdYears: 51, // > 50
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details).toBeDefined();
    });

    it('should reject retroactive dates', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const res = await request(app)
        .post('/api/admin/scoring-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          jobFamilyId: jobFamily.id,
          aiShortlistThreshold: 0.85,
          confidenceThreshold: 0.75,
          experienceThresholdYears: 5,
          effectiveFrom: yesterday.toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0]).toContain('past');
    });

    it('should return 404 for non-existent job family', async () => {
      const res = await request(app)
        .post('/api/admin/scoring-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          jobFamilyId: '00000000-0000-0000-0000-000000000000',
          aiShortlistThreshold: 0.85,
          confidenceThreshold: 0.75,
          experienceThresholdYears: 5,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(404);
    });
  });

  describe('Authorization', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/admin/scoring-thresholds');

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
        .post('/api/admin/scoring-thresholds')
        .set('Authorization', `Bearer ${token}`)
        .send({
          jobFamilyId: jobFamily.id,
          aiShortlistThreshold: 0.85,
          confidenceThreshold: 0.75,
          experienceThresholdYears: 5,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
