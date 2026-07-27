import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import logger from '../utils/logger';

const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

export interface DecisionPdfData {
  decisionId: string;
  candidateName: string;
  requisitionTitle: string;
  outcome: string;
  reasonCode: string;
  reasonLabel: string;
  justification: string;
  decidedBy: string;
  decidedByName: string;
  decidedAt: Date;
}

/**
 * Generate a PDF decision summary document
 * 
 * Creates a formatted PDF containing decision details and uploads it to Supabase Storage.
 * Returns a signed URL that expires in 7 days.
 * 
 * @param data - Decision data to include in the PDF
 * @returns Signed URL for accessing the PDF (7-day expiration)
 * @throws Error if PDF generation or upload fails
 */
export async function generateDecisionPdf(
  data: DecisionPdfData
): Promise<string> {
  try {
    logger.info('Generating decision PDF', { 
      decisionId: data.decisionId,
      outcome: data.outcome 
    });

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    // Build PDF content
    doc.fontSize(20).text('Hiring Decision Summary', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Decision ID: ${data.decisionId}`);
    doc.text(`Date: ${data.decidedAt.toLocaleDateString()}`);
    doc.moveDown();

    doc.fontSize(14).text('Candidate Information', { underline: true });
    doc.fontSize(12);
    doc.text(`Name: ${data.candidateName}`);
    doc.text(`Position: ${data.requisitionTitle}`);
    doc.moveDown();

    doc.fontSize(14).text('Decision Details', { underline: true });
    doc.fontSize(12);
    doc.text(`Outcome: ${data.outcome.toUpperCase()}`);
    doc.text(`Reason: ${data.reasonLabel} (${data.reasonCode})`);
    doc.moveDown();

    if (data.justification) {
      doc.fontSize(14).text('Justification', { underline: true });
      doc.fontSize(11).text(data.justification, { align: 'justify' });
      doc.moveDown();
    }

    doc.fontSize(14).text('Decision Maker', { underline: true });
    doc.fontSize(12);
    doc.text(`Name: ${data.decidedByName}`);
    doc.text(`User ID: ${data.decidedBy}`);
    doc.moveDown();

    doc.fontSize(8).text(
      `Generated on ${new Date().toISOString()}`,
      { align: 'center' }
    );

    // Convert PDF to buffer
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });

    logger.debug('PDF document generated', { 
      decisionId: data.decisionId,
      sizeBytes: pdfBuffer.length 
    });

    // Upload to Supabase Storage
    const filename = `decision-${data.decisionId}-${Date.now()}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('decision-pdfs')
      .upload(filename, pdfBuffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      logger.error('Failed to upload PDF to storage', { 
        decisionId: data.decisionId,
        error: uploadError.message 
      });
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    logger.debug('PDF uploaded to storage', { 
      decisionId: data.decisionId,
      filename 
    });

    // Get signed URL (7-day expiration)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('decision-pdfs')
      .createSignedUrl(filename, 7 * 24 * 60 * 60);

    if (urlError || !urlData) {
      logger.error('Failed to generate signed URL', { 
        decisionId: data.decisionId,
        error: urlError?.message 
      });
      throw new Error('Failed to generate signed URL');
    }

    logger.info('Decision PDF generated successfully', { 
      decisionId: data.decisionId,
      filename,
      urlExpiresIn: '7 days'
    });

    return urlData.signedUrl;
  } catch (error) {
    logger.error('Error generating decision PDF', { 
      decisionId: data.decisionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Check if the decision-pdfs storage bucket exists
 * 
 * @returns True if bucket exists, false otherwise
 */
export async function checkStorageBucket(): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage.getBucket('decision-pdfs');
    
    if (error) {
      logger.warn('Storage bucket check failed', { error: error.message });
      return false;
    }

    return data !== null;
  } catch (error) {
    logger.error('Error checking storage bucket', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}
