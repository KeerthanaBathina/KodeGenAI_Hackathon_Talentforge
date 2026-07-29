/**
 * Integration tests for screening thresholds API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/db/prisma';
import * as jwt from 'jsonwebtoken';
import { env } from '@/config/env';

describe('Screening Thresholds API', () => {
  let adminToken: string;
  let adminUser: any;

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

    // Generate JWT token
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    // Clean up old test thresholds
    await prisma.screeningThreshold.deleteMany({
      where: {
        effectiveFrom: {
          gte: new Date('2026-07-25'),
        },
      },
    });
  });

  afterEach(async () => {
    // Cleanup
    await prisma.screeningThreshold.deleteMany({
      where: {
        effectiveFrom: {
          gte: new Date('2026-07-25'),
        },
      },
    });
    await prisma.user.delete({ where: { id: adminUser.id } });
  });

  describe('GET /api/admin/screening-thresholds/active', () => {
    beforeEach(async () => {
      await prisma.screeningThreshold.create({
        data: {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          version: 1,
          effectiveFrom: new Date('2026-07-01'),
        },
      });
    });

    it('should return 200 with active threshold', async () => {
      const res = await request(app)
        .get('/api/admin/screening-thresholds/active')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body.shortlistThreshold).toBe(80);
      expect(res.body.version).toBe(1);
    });

    it('should return 403 without admin role', async () => {
      // Create non-admin user
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
        .get('/api/admin/screening-thresholds/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should set Cache-Control header', async () => {
      const res = await request(app)
        .get('/api/admin/screening-thresholds/active')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.get('Cache-Control')).toContain('no-cache');
    });
  });

  describe('GET /api/admin/screening-thresholds/history', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await prisma.screeningThreshold.create({
          data: {
            shortlistThreshold: 80 - i,
            borderlineMin: 40 - i,
            borderlineMax: 60 - i,
            rejectThreshold: 20 - i,
            version: i + 1,
            effectiveFrom: new Date(`2026-0${7 + i}-01`),
          },
        });
      }
    });

    it('should return 200 with history', async () => {
      const res = await request(app)
        .get('/api/admin/screening-thresholds/history')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('thresholds');
      expect(res.body.thresholds.length).toBeGreaterThanOrEqual(3);
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/admin/screening-thresholds/history?limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.thresholds.length).toBeLessThanOrEqual(2);
    });

    it('should return thresholds in reverse chronological order', async () => {
      const res = await request(app)
        .get('/api/admin/screening-thresholds/history')
        .set('Authorization', `Bearer ${adminToken}`);

      const { thresholds } = res.body;
      for (let i = 0; i < thresholds.length - 1; i++) {
        const curr = new Date(thresholds[i].effectiveFrom);
        const next = new Date(thresholds[i + 1].effectiveFrom);
        expect(curr.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });
  });

  describe('POST /api/admin/screening-thresholds', () => {
    it('should create new threshold with 201', async () => {
      const res = await request(app)
        .post('/api/admin/screening-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.shortlistThreshold).toBe(80);
    });

    it('should reject invalid shortlist threshold', async () => {
      const res = await request(app)
        .post('/api/admin/screening-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shortlistThreshold: 101,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });

    it('should reject retroactive effective dates', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const res = await request(app)
        .post('/api/admin/screening-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: yesterday.toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0]).toContain('past');
    });

    it('should require all fields', async () => {
      const res = await request(app)
        .post('/api/admin/screening-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shortlistThreshold: 80,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject non-logical ordering', async () => {
      const res = await request(app)
        .post('/api/admin/screening-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shortlistThreshold: 80,
          borderlineMin: 60,
          borderlineMax: 60, // Should be < 80
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/admin/screening-thresholds/:id', () => {
    let thresholdId: string;

    beforeEach(async () => {
      const threshold = await prisma.screeningThreshold.create({
        data: {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          version: 1,
          effectiveFrom: new Date('2026-08-01'),
        },
      });
      thresholdId = threshold.id;
    });

    it('should return 200 with specific threshold', async () => {
      const res = await request(app)
        .get(`/api/admin/screening-thresholds/${thresholdId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(thresholdId);
    });

    it('should return 404 for non-existent ID', async () => {
      const res = await request(app)
        .get('/api/admin/screening-thresholds/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Authorization', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/admin/screening-thresholds/active');

      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const user = await prisma.user.create({
        data: {
          email: `candidate-${Date.now()}@test.example.com`,
          fullName: 'Candidate',
          role: 'candidate',
          active: true,
        },
      });

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: '24h' },
      );

      const res = await request(app)
        .post('/api/admin/screening-thresholds')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01').toISOString(),
        });

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
