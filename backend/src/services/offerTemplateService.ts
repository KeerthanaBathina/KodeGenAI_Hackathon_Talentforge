import Handlebars from 'handlebars';
import { prisma } from '../db/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../utils/logger';

export interface OfferTemplateData {
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  department: string;
  salary: string;
  startDate: string;
  expiryDate: string;
  hiringManagerName: string;
  companyName: string;
  offerDate: string;
}

/**
 * Fetch and resolve template tokens from decision and application data
 * 
 * @param decisionId - Decision ID for approved offer
 * @returns Resolved template data
 */
export async function resolveOfferTemplateData(
  decisionId: string
): Promise<OfferTemplateData> {
  logger.debug({ decisionId }, 'Resolving offer template data');

  // Fetch decision with related data
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    include: {
      application: {
        include: {
          candidate: {
            select: {
              fullName: true,
              email: true
            }
          },
          requisition: {
            select: {
              title: true,
              department: true
            }
          }
        }
      },
      decidedBy: {
        select: {
          fullName: true
        }
      }
    }
  });

  if (!decision) {
    throw new Error(`Decision not found: ${decisionId}`);
  }

  if (decision.outcome !== 'offer') {
    throw new Error(`Decision outcome is not 'offer': ${decision.outcome}`);
  }

  // Extract offer details from decision
  const offerDetails = decision.offerDetails as any || {};
  const compensationBand = decision.compensationBand 
    ? new Decimal(decision.compensationBand) 
    : new Decimal(0);

  // Calculate start date (default 2 weeks from offer date)
  const startDate = offerDetails.startDate 
    ? new Date(offerDetails.startDate)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // Calculate expiry date (default 5 business days)
  const expiryDate = calculateBusinessDays(new Date(), 5);

  const templateData: OfferTemplateData = {
    candidateName: decision.application.candidate.fullName,
    candidateEmail: decision.application.candidate.email,
    roleTitle: decision.application.requisition.title,
    department: decision.application.requisition.department,
    salary: formatCurrency(compensationBand),
    startDate: formatDate(startDate),
    expiryDate: formatDate(expiryDate),
    hiringManagerName: decision.decidedBy.fullName,
    companyName: 'TalentForge',
    offerDate: formatDate(new Date())
  };

  logger.info({
    decisionId,
    candidateEmail: templateData.candidateEmail,
    roleTitle: templateData.roleTitle
  }, 'Template data resolved');

  return templateData;
}

/**
 * Render offer letter HTML from template
 * 
 * @param templateData - Resolved template data
 * @returns Rendered HTML
 */
export async function renderOfferLetterHtml(
  templateData: OfferTemplateData
): Promise<string> {
  // Fetch template from database
  const template = await prisma.template.findFirst({
    where: {
      type: 'offer',
      active: true
    },
    orderBy: { version: 'desc' }
  });

  if (!template) {
    throw new Error('Offer letter template not found');
  }

  // Compile and render template
  const compiledTemplate = Handlebars.compile(template.bodyHtml);
  const html = compiledTemplate(templateData);

  logger.debug({ templateId: template.id }, 'Template rendered');

  return html;
}

// Helper functions
function formatCurrency(amount: Decimal): string {
  return `$${amount.toNumber().toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function calculateBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let addedDays = 0;
  
  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      addedDays++;
    }
  }
  
  return result;
}
