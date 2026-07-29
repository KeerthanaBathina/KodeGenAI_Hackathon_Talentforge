import type { Prisma } from '@prisma/client';
import Papa from 'papaparse';
import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface RequisitionCSVRow {
  role_title: string;
  department: string;
  location: string;
  job_type: 'full_time' | 'part_time' | 'contract' | 'internship';
  slots: number | string;
  job_family: string;
  required_skills?: string;
  preferred_skills?: string;
  min_experience_years?: number | string;
  education_level?: string;
  eligibility_criteria?: string;
}

export const REQUIRED_COLUMNS = [
  'role_title',
  'department',
  'location',
  'job_type',
  'slots',
  'job_family'
] as const;

export const OPTIONAL_COLUMNS = [
  'required_skills',
  'preferred_skills',
  'min_experience_years',
  'education_level',
  'eligibility_criteria'
] as const;

const VALID_JOB_TYPES = ['full_time', 'part_time', 'contract', 'internship'] as const;

export interface ParsedCSVResult {
  data: Record<string, unknown>[];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    type: 'column_missing' | 'column_extra';
    column: string;
    message: string;
  }>;
}

export interface RowValidationError {
  rowNumber: number;
  field: string;
  value: unknown;
  message: string;
}

export interface ValidatedRow {
  valid: boolean;
  rowNumber: number;
  data: RequisitionCSVRow;
  errors: RowValidationError[];
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingRequisitionId?: string;
}

export interface ImportResult {
  success: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRequisitions: string[];
  errors: RowValidationError[];
  duplicates: Array<{
    rowNumber: number;
    title: string;
    department: string;
    location: string;
    existingRequisitionId: string;
  }>;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function splitSkills(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function normalizeDuplicateKey(title: string, department: string, location: string): string {
  return `${title.trim().toLowerCase()}::${department.trim().toLowerCase()}::${location.trim().toLowerCase()}`;
}

export async function parseCSVFile(fileBuffer: Buffer): Promise<ParsedCSVResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(fileBuffer.toString('utf-8'), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
      transform: (value: string) => value.trim(),
      complete: (results) => {
        resolve({
          data: results.data,
          errors: results.errors,
          meta: results.meta
        });
      },
      error: (error: Error) => reject(error)
    });
  });
}

export function validateCSVColumns(headers: string[]): ValidationResult {
  const errors: ValidationResult['errors'] = [];

  for (const requiredCol of REQUIRED_COLUMNS) {
    if (!headers.includes(requiredCol)) {
      errors.push({
        type: 'column_missing',
        column: requiredCol,
        message: `Missing required column: ${requiredCol}`
      });
    }
  }

  const validColumns = new Set([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  for (const header of headers) {
    if (!validColumns.has(header as (typeof REQUIRED_COLUMNS)[number])) {
      errors.push({
        type: 'column_extra',
        column: header,
        message: `Unknown column: ${header} (will be ignored)`
      });
    }
  }

  return {
    valid: errors.every((error) => error.type !== 'column_missing'),
    errors
  };
}

export async function validateRow(
  row: Record<string, unknown>,
  rowNumber: number,
  jobFamilyCache: Map<string, string>
): Promise<ValidatedRow> {
  const errors: RowValidationError[] = [];

  const roleTitle = toTrimmedString(row.role_title);
  const department = toTrimmedString(row.department);
  const location = toTrimmedString(row.location);
  const rawJobType = toTrimmedString(row.job_type).toLowerCase();
  const slotsRaw = row.slots;
  const jobFamily = toTrimmedString(row.job_family);
  const requiredSkills = toTrimmedString(row.required_skills);
  const preferredSkills = toTrimmedString(row.preferred_skills);
  const minExperienceYearsRaw = row.min_experience_years;
  const educationLevel = toTrimmedString(row.education_level);
  const eligibilityCriteria = toTrimmedString(row.eligibility_criteria);

  if (roleTitle.length === 0) {
    errors.push({
      rowNumber,
      field: 'role_title',
      value: row.role_title,
      message: 'Role title is required'
    });
  } else if (roleTitle.length > 255) {
    errors.push({
      rowNumber,
      field: 'role_title',
      value: row.role_title,
      message: 'Role title exceeds 255 characters'
    });
  }

  if (department.length === 0) {
    errors.push({
      rowNumber,
      field: 'department',
      value: row.department,
      message: 'Department is required'
    });
  }

  if (location.length === 0) {
    errors.push({
      rowNumber,
      field: 'location',
      value: row.location,
      message: 'Location is required'
    });
  }

  if (!VALID_JOB_TYPES.includes(rawJobType as (typeof VALID_JOB_TYPES)[number])) {
    errors.push({
      rowNumber,
      field: 'job_type',
      value: row.job_type,
      message: `Invalid job type. Must be one of: ${VALID_JOB_TYPES.join(', ')}`
    });
  }

  const slots = Number.parseInt(String(slotsRaw ?? ''), 10);
  if (Number.isNaN(slots) || slots < 1) {
    errors.push({
      rowNumber,
      field: 'slots',
      value: row.slots,
      message: 'Slots must be a positive integer'
    });
  }

  if (jobFamily.length === 0) {
    errors.push({
      rowNumber,
      field: 'job_family',
      value: row.job_family,
      message: 'Job family is required'
    });
  } else if (!jobFamilyCache.has(jobFamily.toLowerCase())) {
    errors.push({
      rowNumber,
      field: 'job_family',
      value: row.job_family,
      message: `Job family "${jobFamily}" not found in system`
    });
  }

  if (minExperienceYearsRaw !== undefined && String(minExperienceYearsRaw).trim() !== '') {
    const experience = Number.parseInt(String(minExperienceYearsRaw), 10);
    if (Number.isNaN(experience) || experience < 0) {
      errors.push({
        rowNumber,
        field: 'min_experience_years',
        value: row.min_experience_years,
        message: 'Minimum experience years must be a non-negative integer'
      });
    }
  }

  if (eligibilityCriteria.length > 0) {
    try {
      JSON.parse(eligibilityCriteria);
    } catch {
      errors.push({
        rowNumber,
        field: 'eligibility_criteria',
        value: row.eligibility_criteria,
        message: 'Eligibility criteria must be valid JSON'
      });
    }
  }

  return {
    valid: errors.length === 0,
    rowNumber,
    data: {
      role_title: roleTitle,
      department,
      location,
      job_type: rawJobType as RequisitionCSVRow['job_type'],
      slots,
      job_family: jobFamily,
      required_skills: requiredSkills || undefined,
      preferred_skills: preferredSkills || undefined,
      min_experience_years:
        minExperienceYearsRaw !== undefined && String(minExperienceYearsRaw).trim() !== ''
          ? Number.parseInt(String(minExperienceYearsRaw), 10)
          : undefined,
      education_level: educationLevel || undefined,
      eligibility_criteria: eligibilityCriteria || undefined
    },
    errors
  };
}

export async function checkDuplicate(
  title: string,
  department: string,
  location: string
): Promise<DuplicateCheckResult> {
  const existing = await prisma.requisition.findFirst({
    where: {
      title: { equals: title, mode: 'insensitive' },
      department: { equals: department, mode: 'insensitive' },
      location: { equals: location, mode: 'insensitive' },
      status: { notIn: ['cancelled'] }
    },
    select: { id: true }
  });

  return {
    isDuplicate: existing !== null,
    existingRequisitionId: existing?.id
  };
}

function toRequisitionCreateData(row: ValidatedRow, jobFamilyId: string): Prisma.RequisitionCreateInput {
  const eligibilityCriteria = row.data.eligibility_criteria
    ? (JSON.parse(row.data.eligibility_criteria) as Prisma.InputJsonValue)
    : ({} as Prisma.InputJsonValue);

  return {
    title: row.data.role_title,
    department: row.data.department,
    location: row.data.location,
    jobType: row.data.job_type,
    slots: Number.parseInt(String(row.data.slots), 10),
    status: 'open',
    openedAt: new Date(),
    requiredSkills: splitSkills(row.data.required_skills),
    preferredSkills: splitSkills(row.data.preferred_skills),
    minExperienceYears:
      row.data.min_experience_years !== undefined
        ? Number.parseInt(String(row.data.min_experience_years), 10)
        : 0,
    educationLevel: row.data.education_level ?? null,
    eligibilityCriteria,
    jobFamily: {
      connect: {
        id: jobFamilyId
      }
    }
  };
}

export async function importRequisitionsFromCSV(
  fileBuffer: Buffer,
  uploadedBy: string
): Promise<ImportResult> {
  const parseResult = await parseCSVFile(fileBuffer);

  if (parseResult.errors.length > 0) {
    throw new Error(`CSV parsing failed: ${parseResult.errors[0]?.message ?? 'Unknown parse error'}`);
  }

  const headers = parseResult.meta.fields ?? [];
  const columnValidation = validateCSVColumns(headers);

  if (!columnValidation.valid) {
    throw new Error(columnValidation.errors[0]?.message ?? 'CSV missing required columns');
  }

  const jobFamilies = await prisma.jobFamily.findMany({
    select: {
      id: true,
      name: true
    }
  });

  const jobFamilyCache = new Map(jobFamilies.map((jobFamily) => [jobFamily.name.toLowerCase(), jobFamily.id]));

  const validatedRows = await Promise.all(
    parseResult.data.map((row, index) => validateRow(row, index + 2, jobFamilyCache))
  );

  const validRows = validatedRows.filter((row) => row.valid);
  const invalidRows = validatedRows.filter((row) => !row.valid);

  const duplicates: ImportResult['duplicates'] = [];
  const rowsToImport: ValidatedRow[] = [];
  const seenInFile = new Set<string>();

  for (const validRow of validRows) {
    const duplicateKey = normalizeDuplicateKey(
      validRow.data.role_title,
      validRow.data.department,
      validRow.data.location
    );

    if (seenInFile.has(duplicateKey)) {
      duplicates.push({
        rowNumber: validRow.rowNumber,
        title: validRow.data.role_title,
        department: validRow.data.department,
        location: validRow.data.location,
        existingRequisitionId: 'duplicate_in_file'
      });
      continue;
    }

    seenInFile.add(duplicateKey);

    const duplicateCheck = await checkDuplicate(
      validRow.data.role_title,
      validRow.data.department,
      validRow.data.location
    );

    if (duplicateCheck.isDuplicate) {
      duplicates.push({
        rowNumber: validRow.rowNumber,
        title: validRow.data.role_title,
        department: validRow.data.department,
        location: validRow.data.location,
        existingRequisitionId: duplicateCheck.existingRequisitionId ?? 'unknown'
      });
      continue;
    }

    rowsToImport.push(validRow);
  }

  const importedRequisitions: string[] = [];

  for (const row of rowsToImport) {
    try {
      const jobFamilyId = jobFamilyCache.get(row.data.job_family.toLowerCase());
      if (!jobFamilyId) {
        invalidRows.push({
          valid: false,
          rowNumber: row.rowNumber,
          data: row.data,
          errors: [
            {
              rowNumber: row.rowNumber,
              field: 'job_family',
              value: row.data.job_family,
              message: `Job family "${row.data.job_family}" not found in system`
            }
          ]
        });
        continue;
      }

      const requisition = await prisma.requisition.create({
        data: toRequisitionCreateData(row, jobFamilyId),
        select: {
          id: true
        }
      });

      importedRequisitions.push(requisition.id);
    } catch (error) {
      logger.error(
        {
          rowNumber: row.rowNumber,
          error
        },
        '[CSVImport] Failed to insert requisition row'
      );

      invalidRows.push({
        valid: false,
        rowNumber: row.rowNumber,
        data: row.data,
        errors: [
          {
            rowNumber: row.rowNumber,
            field: 'general',
            value: null,
            message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      });
    }
  }

  await auditEvent({
    actorId: uploadedBy,
    eventType: 'requisition.bulk_import',
    entityType: 'user',
    entityId: uploadedBy,
    payload: {
      totalRows: parseResult.data.length,
      validRows: validRows.length,
      invalidRows: invalidRows.length,
      duplicateRows: duplicates.length,
      importedCount: importedRequisitions.length
    }
  });

  return {
    success: importedRequisitions.length > 0,
    totalRows: parseResult.data.length,
    validRows: validRows.length,
    invalidRows: invalidRows.length,
    duplicateRows: duplicates.length,
    importedRequisitions,
    errors: invalidRows.flatMap((row) => row.errors),
    duplicates
  };
}

export function generateErrorReportCSV(result: ImportResult): string {
  const errorRows: Array<{
    row_number: number;
    error_type: string;
    field: string;
    value: string;
    message: string;
  }> = [];

  for (const error of result.errors) {
    errorRows.push({
      row_number: error.rowNumber,
      error_type: 'validation',
      field: error.field,
      value: String(error.value ?? ''),
      message: error.message
    });
  }

  for (const duplicate of result.duplicates) {
    errorRows.push({
      row_number: duplicate.rowNumber,
      error_type: 'duplicate',
      field: 'role_title, department, location',
      value: `${duplicate.title}, ${duplicate.department}, ${duplicate.location}`,
      message: `Duplicate requisition (existing ID: ${duplicate.existingRequisitionId})`
    });
  }

  return Papa.unparse(errorRows, {
    header: true,
    columns: ['row_number', 'error_type', 'field', 'value', 'message']
  });
}