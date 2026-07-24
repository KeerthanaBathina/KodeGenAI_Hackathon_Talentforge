import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import logger from '../utils/logger';

export interface ApplicationReceivedData {
    candidateName: string;
    requisitionTitle: string;
    companyName: string;
    applicationId: string;
    department: string;
    submittedAt: string;
    reviewTimelineDays: number;
    trackApplicationUrl: string;
}

export interface ApplicationWithdrawnData {
    candidateName: string;
    requisitionTitle: string;
    companyName: string;
    applicationId: string;
    withdrawnAt: string;
    browseJobsUrl: string;
}

/**
 * Render application received email template
 */
export async function renderApplicationReceivedEmail(
    data: ApplicationReceivedData
): Promise<string> {
    try {
        const templatePath = path.join(__dirname, 'templates', 'application-received.html');
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        const template = Handlebars.compile(templateContent);
        return template(data);
    } catch (error) {
        logger.error('Failed to render application received email template', {
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Render application withdrawn email template
 */
export async function renderApplicationWithdrawnEmail(
    data: ApplicationWithdrawnData
): Promise<string> {
    try {
        const templatePath = path.join(__dirname, 'templates', 'application-withdrawn.html');
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        const template = Handlebars.compile(templateContent);
        return template(data);
    } catch (error) {
        logger.error('Failed to render application withdrawn email template', {
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
