import { prisma } from '../db/prisma';
import { resolveOfferTemplateData, renderOfferLetterHtml } from './offerTemplateService';
import { generateAndStoreOfferPdf } from './offerPdfService';
import { auditEvent } from './auditService';
import { scheduleOfferExpiry } from '../queues/offerQueue';
import logger from '../utils/logger';

export interface GenerateOfferParams {
  decisionId: string;
  applicationId: string;
}

/**
 * Generate offer letter and create offer record
 * 
 * Called when approval chain completes successfully.
 * 
 * @param params - Decision and application IDs
 * @returns Offer record ID
 */
export async function generateOfferLetter(
  params: GenerateOfferParams
): Promise<string> {
  const { decisionId, applicationId } = params;

  logger.info({ decisionId, applicationId }, 'Starting offer generation');

  try {
    // Step 1: Resolve template data
    const templateData = await resolveOfferTemplateData(decisionId);

    // Step 2: Render HTML from template
    const html = await renderOfferLetterHtml(templateData);

    // Step 3: Create offer record (to get offer ID)
    const offer = await prisma.offer.create({
      data: {
        decisionId,
        applicationId,
        status: 'pending',
        expiresAt: new Date(templateData.expiryDate)
      }
    });

    // Step 4: Generate and upload PDF
    const { storagePath, signedUrl } = await generateAndStoreOfferPdf(html, offer.id);

    // Step 5: Update offer record with PDF info
    await prisma.offer.update({
      where: { id: offer.id },
      data: {
        pdfUrl: signedUrl,
        pdfStoragePath: storagePath
      }
    });

    // Step 6: Update application status
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'offered' }
    });

    // Step 7: Audit event
    await auditEvent({
      eventType: 'OFFER_GENERATED',
      entityType: 'offer',
      entityId: offer.id,
      actorId: 'system',
      payload: {
        decisionId,
        applicationId,
        pdfStoragePath: storagePath,
        expiresAt: offer.expiresAt
      }
    });

    logger.info({
      offerId: offer.id,
      decisionId,
      applicationId,
      expiresAt: offer.expiresAt
    }, 'Offer generated successfully');

    // Step 8: Schedule expiry job
    const delay = offer.expiresAt.getTime() - Date.now();
    await scheduleOfferExpiry(
      {
        offerId: offer.id,
        applicationId: offer.applicationId,
        candidateEmail: templateData.candidateEmail,
        expiresAt: offer.expiresAt
      },
      delay
    );

    logger.info({
      offerId: offer.id,
      expiresAt: offer.expiresAt,
      delayMs: delay
    }, 'Offer expiry job scheduled');

    // Step 9: Send email to candidate (TODO: implement)
    logger.info({ offerId: offer.id, candidateEmail: templateData.candidateEmail }, 
      'TODO: Send offer email to candidate');

    return offer.id;
  } catch (error: any) {
    logger.error({ error: error.message, decisionId }, 'Offer generation failed');
    throw error;
  }
}
