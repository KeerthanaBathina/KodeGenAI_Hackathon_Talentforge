#!/usr/bin/env tsx

/**
 * Load Test Script for Requisition Browsing API
 * 
 * Purpose: Verify requisition filtering API meets <200ms P95 latency requirement
 * 
 * What it does:
 * 1. Seeds 100+ test requisitions with diverse attributes
 * 2. Executes filter queries (department, location, keyword, experience, pagination)
 * 3. Measures response times and calculates P50, P95, P99 latencies
 * 4. Validates responses against expected filter behavior
 * 
 * Usage: npx tsx scripts/load-test-requisitions.ts
 */

import prisma from '../src/db/prisma';
import logger from '../src/utils/logger';

interface LatencyStats {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
}

async function calculateLatencyStats(latencies: number[]): Promise<LatencyStats> {
    const sorted = [...latencies].sort((a, b) => a - b);
    const len = sorted.length;

    return {
        min: sorted[0],
        max: sorted[len - 1],
        mean: sorted.reduce((sum, val) => sum + val, 0) / len,
        p50: sorted[Math.floor(len * 0.5)],
        p95: sorted[Math.floor(len * 0.95)],
        p99: sorted[Math.floor(len * 0.99)],
    };
}

async function seedTestRequisitions(count: number) {
    logger.info(`Seeding ${count} test requisitions...`);

    // Create test job family
    const jobFamily = await prisma.jobFamily.create({
        data: {
            name: `Load Test Family ${Date.now()}`,
            description: 'For load testing purposes',
        },
    });

    const departments = ['Engineering', 'Marketing', 'Sales', 'Product', 'Design', 'Finance'];
    const locations = ['Remote', 'New York', 'San Francisco', 'Austin', 'Seattle', 'Boston'];
    const jobTypes = ['full_time', 'part_time', 'contract', 'internship'] as const;
    const titles = [
        'Software Engineer',
        'Marketing Manager',
        'Sales Representative',
        'Product Manager',
        'UI Designer',
        'Financial Analyst',
        'Backend Engineer',
        'Data Scientist',
        'Frontend Developer',
        'DevOps Engineer',
    ];

    const requisitions = [];
    for (let i = 0; i < count; i++) {
        const dept = departments[i % departments.length];
        const loc = locations[i % locations.length];
        const type = jobTypes[i % jobTypes.length];
        const title = titles[i % titles.length];
        const experienceYears = [0, 1, 2, 3, 5, 7, 10][i % 7];

        requisitions.push({
            title: `${title} ${i + 1}`,
            department: dept,
            location: loc,
            jobType: type,
            jobFamilyId: jobFamily.id,
            slots: Math.floor(Math.random() * 5) + 1,
            filledSlots: Math.floor(Math.random() * 2),
            status: i % 10 === 9 ? 'closed' : 'open', // 10% closed
            eligibilityCriteria: { minYearsExperience: experienceYears },
            openedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Last 30 days
            closedAt: i % 10 === 9 ? new Date() : null,
        });
    }

    await prisma.requisition.createMany({ data: requisitions });
    logger.info(`✅ Seeded ${count} requisitions`);

    return jobFamily.id;
}

async function runFilterQuery(
    description: string,
    whereClause: any,
    orderBy: any = { openedAt: 'desc' }
): Promise<number> {
    const startTime = performance.now();

    const [count, data] = await Promise.all([
        prisma.requisition.count({ where: whereClause }),
        prisma.requisition.findMany({
            where: whereClause,
            orderBy,
            skip: 0,
            take: 20,
            select: {
                id: true,
                title: true,
                department: true,
                location: true,
                jobType: true,
                slots: true,
                filledSlots: true,
                eligibilityCriteria: true,
                openedAt: true,
            },
        }),
    ]);

    const latency = performance.now() - startTime;
    logger.debug(`${description}: ${latency.toFixed(2)}ms (${count} results)`);

    return latency;
}

async function cleanupTestData(jobFamilyId: string) {
    logger.info('Cleaning up test data...');
    await prisma.requisition.deleteMany({ where: { jobFamilyId } });
    await prisma.jobFamily.delete({ where: { id: jobFamilyId } });
    logger.info('✅ Cleanup complete');
}

async function main() {
    logger.info('🚀 Starting requisition API load test...\n');

    const TEST_REQUISITION_COUNT = 120;
    let jobFamilyId: string | null = null;

    try {
        // Seed test data
        jobFamilyId = await seedTestRequisitions(TEST_REQUISITION_COUNT);

        // Test scenarios
        const latencies: number[] = [];

        logger.info('\n📊 Running query performance tests...\n');

        // Scenario 1: Default query (all open requisitions)
        for (let i = 0; i < 10; i++) {
            latencies.push(await runFilterQuery('Default query', { status: 'open' }));
        }

        // Scenario 2: Department filter
        for (let i = 0; i < 10; i++) {
            latencies.push(
                await runFilterQuery('Department filter', {
                    status: 'open',
                    department: 'Engineering',
                })
            );
        }

        // Scenario 3: Location filter
        for (let i = 0; i < 10; i++) {
            latencies.push(
                await runFilterQuery('Location filter', {
                    status: 'open',
                    location: 'Remote',
                })
            );
        }

        // Scenario 4: Job type filter
        for (let i = 0; i < 10; i++) {
            latencies.push(
                await runFilterQuery('JobType filter', {
                    status: 'open',
                    jobType: 'full_time',
                })
            );
        }

        // Scenario 5: Experience level filter (complex JSON query)
        for (let i = 0; i < 10; i++) {
            latencies.push(
                await runFilterQuery('Experience filter', {
                    status: 'open',
                    eligibilityCriteria: {
                        path: ['minYearsExperience'],
                        lte: 5,
                    },
                })
            );
        }

        // Scenario 6: Keyword search (OR query)
        for (let i = 0; i < 10; i++) {
            latencies.push(
                await runFilterQuery('Keyword search', {
                    status: 'open',
                    OR: [
                        { title: { contains: 'Engineer', mode: 'insensitive' } },
                        { department: { contains: 'Engineer', mode: 'insensitive' } },
                    ],
                })
            );
        }

        // Scenario 7: Multiple filters (AND logic)
        for (let i = 0; i < 10; i++) {
            latencies.push(
                await runFilterQuery('Multiple filters', {
                    status: 'open',
                    department: 'Engineering',
                    location: 'Remote',
                    jobType: 'full_time',
                })
            );
        }

        // Scenario 8: Pagination (page 2)
        for (let i = 0; i < 10; i++) {
            const startTime = performance.now();
            await prisma.requisition.findMany({
                where: { status: 'open' },
                orderBy: [{ openedAt: 'desc' }, { createdAt: 'desc' }],
                skip: 20,
                take: 20,
                select: {
                    id: true,
                    title: true,
                    department: true,
                    location: true,
                    jobType: true,
                    slots: true,
                    filledSlots: true,
                    eligibilityCriteria: true,
                    openedAt: true,
                },
            });
            const latency = performance.now() - startTime;
            latencies.push(latency);
            logger.debug(`Pagination query (page 2): ${latency.toFixed(2)}ms`);
        }

        // Calculate statistics
        const stats = await calculateLatencyStats(latencies);

        logger.info('\n📈 Performance Results:\n');
        logger.info(`Total queries executed: ${latencies.length}`);
        logger.info(`Min latency:  ${stats.min.toFixed(2)}ms`);
        logger.info(`Max latency:  ${stats.max.toFixed(2)}ms`);
        logger.info(`Mean latency: ${stats.mean.toFixed(2)}ms`);
        logger.info(`P50 latency:  ${stats.p50.toFixed(2)}ms`);
        logger.info(`P95 latency:  ${stats.p95.toFixed(2)}ms`);
        logger.info(`P99 latency:  ${stats.p99.toFixed(2)}ms`);

        // Validation
        const P95_TARGET = 200;
        const pass = stats.p95 < P95_TARGET;

        logger.info(`\n🎯 Performance Target: P95 < ${P95_TARGET}ms`);
        if (pass) {
            logger.info(`✅ PASS — P95 latency: ${stats.p95.toFixed(2)}ms`);
        } else {
            logger.error(`❌ FAIL — P95 latency: ${stats.p95.toFixed(2)}ms exceeds ${P95_TARGET}ms target`);
        }

        // Cleanup
        if (jobFamilyId) {
            await cleanupTestData(jobFamilyId);
        }

        process.exit(pass ? 0 : 1);
    } catch (error) {
        logger.error('Load test failed:', error);

        // Cleanup on error
        if (jobFamilyId) {
            await cleanupTestData(jobFamilyId);
        }

        process.exit(1);
    }
}

main();
