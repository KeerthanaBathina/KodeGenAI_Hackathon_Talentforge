import prisma from '../db/prisma';
import { Prisma, JobType } from '@prisma/client';
import logger from '../utils/logger';

export interface RequisitionFilters {
    department?: string;
    location?: string;
    jobType?: JobType;
    experienceLevel?: number;
    keyword?: string;
    status?: string;
}

export interface ListRequisitionsParams {
    page: number;
    pageSize: number;
    filters: RequisitionFilters;
}

export interface PaginatedRequisitions {
    data: any[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
    };
    filters: RequisitionFilters;
}

/**
 * Build Prisma where clause from filter parameters
 */
function buildWhereClause(filters: RequisitionFilters): Prisma.RequisitionWhereInput {
    const where: Prisma.RequisitionWhereInput = {};

    // Status filter (default: open)
    where.status = (filters.status as any) || 'open';

    // Exact match filters
    if (filters.department) {
        where.department = filters.department;
    }

    if (filters.location) {
        where.location = filters.location;
    }

    if (filters.jobType) {
        where.jobType = filters.jobType;
    }

    // Experience level filter (JSON field query)
    // Filter requisitions where minYearsExperience <= provided experienceLevel
    if (filters.experienceLevel !== undefined) {
        where.eligibilityCriteria = {
            path: ['minYearsExperience'],
            lte: filters.experienceLevel,
        } as any;
    }

    // Keyword search (title OR department, case-insensitive)
    if (filters.keyword) {
        where.OR = [
            {
                title: {
                    contains: filters.keyword,
                    mode: 'insensitive',
                },
            },
            {
                department: {
                    contains: filters.keyword,
                    mode: 'insensitive',
                },
            },
        ];
    }

    return where;
}

/**
 * List requisitions with filters and pagination
 */
export async function listRequisitions(
    params: ListRequisitionsParams
): Promise<PaginatedRequisitions> {
    const { page, pageSize, filters } = params;
    const skip = (page - 1) * pageSize;

    const where = buildWhereClause(filters);

    logger.debug({ where, page, pageSize }, 'Listing requisitions with filters');

    // Execute count and data queries in parallel
    const [totalItems, requisitions] = await Promise.all([
        prisma.requisition.count({ where }),
        prisma.requisition.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: [
                { openedAt: 'desc' },
                { createdAt: 'desc' },
            ],
            select: {
                id: true,
                title: true,
                department: true,
                location: true,
                jobType: true,
                slots: true,
                filledSlots: true,
                status: true,
                eligibilityCriteria: true,
                openedAt: true,
                createdAt: true,
            },
        }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
        data: requisitions,
        pagination: {
            page,
            pageSize,
            totalItems,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
        filters: {
            department: filters.department,
            location: filters.location,
            jobType: filters.jobType,
            experienceLevel: filters.experienceLevel,
            keyword: filters.keyword,
        },
    };
}

/**
 * Get single requisition by ID
 */
export async function getRequisitionById(id: string): Promise<any | null> {
    return prisma.requisition.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            department: true,
            location: true,
            jobType: true,
            slots: true,
            filledSlots: true,
            status: true,
            eligibilityCriteria: true,
            openedAt: true,
            closedAt: true,
            createdAt: true,
            updatedAt: true,
            jobFamily: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });
}

/**
 * Get unique filter values for UI dropdowns
 */
export async function getFilterOptions(): Promise<{
    departments: string[];
    locations: string[];
    jobTypes: JobType[];
}> {
    const [departments, locations] = await Promise.all([
        prisma.requisition.findMany({
            where: { status: 'open' },
            select: { department: true },
            distinct: ['department'],
            orderBy: { department: 'asc' },
        }),
        prisma.requisition.findMany({
            where: { status: 'open' },
            select: { location: true },
            distinct: ['location'],
            orderBy: { location: 'asc' },
        }),
    ]);

    return {
        departments: departments.map((d) => d.department),
        locations: locations.map((l) => l.location),
        jobTypes: ['full_time', 'part_time', 'contract', 'internship'],
    };
}
