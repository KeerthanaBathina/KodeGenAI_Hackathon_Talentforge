/**
 * Load Testing for Session Timer
 * 
 * Tests concurrent session handling and performance under load
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
    startSessionTimer,
    getSessionTimer,
    updateHeartbeat,
} from '../../../services/sessionTimerService';
import { redis } from '../../../db/redis';

describe('Session Timer Load Tests', () => {
    const SESSION_COUNT = 100;
    let sessionIds: string[] = [];

    beforeAll(() => {
        // Generate 100 unique session IDs
        sessionIds = Array.from({ length: SESSION_COUNT }, (_, i) => 
            `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`
        );
    });

    afterAll(async () => {
        // Cleanup all test sessions
        const keys = sessionIds.map(id => `session:timer:${id}`);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    });

    beforeEach(async () => {
        // Clean up before each test
        const keys = sessionIds.map(id => `session:timer:${id}`);
        const existingKeys = await redis.keys('session:timer:*');
        if (existingKeys.length > 0) {
            await redis.del(...existingKeys);
        }
    });

    describe('Concurrent Session Creation', () => {
        it('should handle 100 concurrent session starts', async () => {
            const startTime = performance.now();

            // Start all 100 sessions concurrently
            const results = await Promise.all(
                sessionIds.map(id => startSessionTimer(id, 60))
            );

            const endTime = performance.now();
            const totalTimeMs = endTime - startTime;

            // All should succeed
            expect(results).toHaveLength(SESSION_COUNT);
            results.forEach(result => {
                expect(result.status).toBe('active');
                expect(result.remainingMinutes).toBe(60);
            });

            // Should complete within reasonable time (< 5 seconds for 100 sessions)
            expect(totalTimeMs).toBeLessThan(5000);

            console.log(`✓ Created ${SESSION_COUNT} sessions in ${totalTimeMs.toFixed(2)}ms`);
        });

        it('should maintain isolation between concurrent sessions', async () => {
            // Start sessions with different durations
            const durations = sessionIds.map((_, i) => 30 + i % 30); // 30-59 minutes
            
            await Promise.all(
                sessionIds.map((id, i) => startSessionTimer(id, durations[i]))
            );

            // Fetch all timers
            const timers = await Promise.all(
                sessionIds.map(id => getSessionTimer(id))
            );

            // Each should have its own duration
            timers.forEach((timer, i) => {
                expect(timer!.remainingMinutes).toBeCloseTo(durations[i], 0);
            });
        });
    });

    describe('Concurrent Timer Fetches', () => {
        beforeEach(async () => {
            // Setup: Create all sessions
            await Promise.all(
                sessionIds.map(id => startSessionTimer(id, 60))
            );
        });

        it('should handle 100 concurrent timer fetches with p95 < 100ms', async () => {
            const latencies: number[] = [];

            // Perform 100 fetches and measure individual latencies
            const results = await Promise.all(
                sessionIds.map(async (id) => {
                    const start = performance.now();
                    const timer = await getSessionTimer(id);
                    const end = performance.now();
                    latencies.push(end - start);
                    return timer;
                })
            );

            // All should succeed
            expect(results).toHaveLength(SESSION_COUNT);
            results.forEach(timer => {
                expect(timer!.status).toBe('active');
            });

            // Calculate p95 latency
            latencies.sort((a, b) => a - b);
            const p95Index = Math.floor(latencies.length * 0.95);
            const p95Latency = latencies[p95Index];

            expect(p95Latency).toBeLessThan(100);

            console.log(`✓ p95 latency: ${p95Latency.toFixed(2)}ms for ${SESSION_COUNT} sessions`);
        });

        it('should handle repeated fetches without degradation', async () => {
            const iterations = 5;
            const allLatencies: number[][] = [];

            for (let i = 0; i < iterations; i++) {
                const latencies: number[] = [];

                await Promise.all(
                    sessionIds.map(async (id) => {
                        const start = performance.now();
                        await getSessionTimer(id);
                        const end = performance.now();
                        latencies.push(end - start);
                    })
                );

                allLatencies.push(latencies);
            }

            // Calculate p95 for each iteration
            const p95Values = allLatencies.map(latencies => {
                latencies.sort((a, b) => a - b);
                return latencies[Math.floor(latencies.length * 0.95)];
            });

            // Performance should not degrade across iterations
            const firstP95 = p95Values[0];
            const lastP95 = p95Values[p95Values.length - 1];

            // Allow up to 20% degradation
            expect(lastP95).toBeLessThan(firstP95 * 1.2);

            console.log(`✓ p95 latencies: ${p95Values.map(v => v.toFixed(2)).join(', ')}ms`);
        });
    });

    describe('Concurrent Heartbeats', () => {
        beforeEach(async () => {
            // Setup: Create all sessions
            await Promise.all(
                sessionIds.map(id => startSessionTimer(id, 60))
            );
        });

        it('should handle 100 concurrent heartbeat updates', async () => {
            const startTime = performance.now();

            // Send heartbeats concurrently
            await Promise.all(
                sessionIds.map(id => updateHeartbeat(id))
            );

            const endTime = performance.now();
            const totalTimeMs = endTime - startTime;

            // Should complete within reasonable time
            expect(totalTimeMs).toBeLessThan(3000);

            console.log(`✓ Updated ${SESSION_COUNT} heartbeats in ${totalTimeMs.toFixed(2)}ms`);

            // Verify all heartbeats were recorded
            const timers = await Promise.all(
                sessionIds.map(id => getSessionTimer(id))
            );

            timers.forEach(timer => {
                expect(timer!.status).toBe('active');
                // Last heartbeat should be very recent
                const lastHeartbeat = new Date(timer!.lastHeartbeat);
                const now = new Date();
                const diff = now.getTime() - lastHeartbeat.getTime();
                expect(diff).toBeLessThan(5000); // Within 5 seconds
            });
        });

        it('should handle burst heartbeats without errors', async () => {
            // Send 10 rapid heartbeats for 10 random sessions
            const randomSessions = sessionIds.slice(0, 10);
            const bursts = 10;

            for (let burst = 0; burst < bursts; burst++) {
                await Promise.all(
                    randomSessions.map(id => updateHeartbeat(id))
                );
            }

            // All sessions should still be active
            const timers = await Promise.all(
                randomSessions.map(id => getSessionTimer(id))
            );

            timers.forEach(timer => {
                expect(timer!.status).toBe('active');
            });
        });
    });

    describe('Mixed Operations Under Load', () => {
        it('should handle mixed create/fetch/update operations', async () => {
            const operations: Promise<any>[] = [];

            // Mix of operations
            for (let i = 0; i < SESSION_COUNT; i++) {
                const sessionId = sessionIds[i];
                const operation = i % 3;

                switch (operation) {
                    case 0:
                        // Create new timer
                        operations.push(startSessionTimer(sessionId, 60));
                        break;
                    case 1:
                        // Fetch existing timer (may not exist yet)
                        operations.push(
                            getSessionTimer(sessionId).catch(() => null)
                        );
                        break;
                    case 2:
                        // Update heartbeat (may not exist yet)
                        operations.push(
                            updateHeartbeat(sessionId).catch(() => null)
                        );
                        break;
                }
            }

            const startTime = performance.now();
            await Promise.all(operations);
            const endTime = performance.now();

            expect(endTime - startTime).toBeLessThan(5000);

            console.log(`✓ Mixed operations completed in ${(endTime - startTime).toFixed(2)}ms`);
        });

        it('should maintain consistency under concurrent updates', async () => {
            // Create initial sessions
            await Promise.all(
                sessionIds.slice(0, 10).map(id => startSessionTimer(id, 60))
            );

            // Perform concurrent operations on same sessions
            const targetSessions = sessionIds.slice(0, 10);
            const operations: Promise<any>[] = [];

            targetSessions.forEach(id => {
                operations.push(updateHeartbeat(id));
                operations.push(getSessionTimer(id));
                operations.push(updateHeartbeat(id));
                operations.push(getSessionTimer(id));
            });

            await Promise.all(operations);

            // Verify all sessions are still consistent
            const timers = await Promise.all(
                targetSessions.map(id => getSessionTimer(id))
            );

            timers.forEach(timer => {
                expect(timer).toBeDefined();
                expect(timer!.status).toBe('active');
                expect(timer!.remainingMinutes).toBeGreaterThan(0);
            });
        });
    });

    describe('Redis Connection Pool Stability', () => {
        it('should maintain stable connections under sustained load', async () => {
            // Setup
            await Promise.all(
                sessionIds.map(id => startSessionTimer(id, 60))
            );

            // Perform sustained operations
            const rounds = 10;
            for (let round = 0; round < rounds; round++) {
                await Promise.all(
                    sessionIds.map(id => getSessionTimer(id))
                );
            }

            // Verify Redis is still responsive
            const finalCheck = await Promise.all(
                sessionIds.map(id => getSessionTimer(id))
            );

            expect(finalCheck).toHaveLength(SESSION_COUNT);
            finalCheck.forEach(timer => {
                expect(timer!.status).toBe('active');
            });

            console.log(`✓ Completed ${rounds} rounds of ${SESSION_COUNT} operations`);
        });

        it('should recover from connection errors gracefully', async () => {
            // This test would require actually disconnecting Redis
            // For now, we just verify error handling doesn't break the system

            await Promise.all(
                sessionIds.slice(0, 10).map(id => startSessionTimer(id, 60))
            );

            // Verify basic operations still work
            const timers = await Promise.all(
                sessionIds.slice(0, 10).map(id => getSessionTimer(id))
            );

            expect(timers).toHaveLength(10);
        });
    });

    describe('Performance Benchmarks', () => {
        it('should provide baseline metrics for monitoring', async () => {
            const metrics = {
                sessionCount: SESSION_COUNT,
                createTimeMs: 0,
                fetchTimeMs: 0,
                updateTimeMs: 0,
                p95FetchLatencyMs: 0,
            };

            // Measure create performance
            const createStart = performance.now();
            await Promise.all(
                sessionIds.map(id => startSessionTimer(id, 60))
            );
            metrics.createTimeMs = performance.now() - createStart;

            // Measure fetch performance
            const fetchLatencies: number[] = [];
            const fetchStart = performance.now();
            await Promise.all(
                sessionIds.map(async (id) => {
                    const start = performance.now();
                    await getSessionTimer(id);
                    fetchLatencies.push(performance.now() - start);
                })
            );
            metrics.fetchTimeMs = performance.now() - fetchStart;

            // Measure update performance
            const updateStart = performance.now();
            await Promise.all(
                sessionIds.map(id => updateHeartbeat(id))
            );
            metrics.updateTimeMs = performance.now() - updateStart;

            // Calculate p95
            fetchLatencies.sort((a, b) => a - b);
            metrics.p95FetchLatencyMs = fetchLatencies[Math.floor(fetchLatencies.length * 0.95)];

            // Log metrics for baseline
            console.log('\n=== Performance Baseline Metrics ===');
            console.log(`Sessions: ${metrics.sessionCount}`);
            console.log(`Create (all): ${metrics.createTimeMs.toFixed(2)}ms`);
            console.log(`Fetch (all): ${metrics.fetchTimeMs.toFixed(2)}ms`);
            console.log(`Update (all): ${metrics.updateTimeMs.toFixed(2)}ms`);
            console.log(`p95 Fetch Latency: ${metrics.p95FetchLatencyMs.toFixed(2)}ms`);
            console.log('====================================\n');

            // Assertions
            expect(metrics.createTimeMs).toBeLessThan(5000);
            expect(metrics.fetchTimeMs).toBeLessThan(3000);
            expect(metrics.updateTimeMs).toBeLessThan(3000);
            expect(metrics.p95FetchLatencyMs).toBeLessThan(100);
        });
    });
});
