import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import logger from '../utils/logger';

const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

export interface GeneratePdfResult {
  pdfBuffer: Buffer;
  storagePath: string;
  signedUrl: string;
}

/**
 * Generate PDF from HTML content using Puppeteer
 * 
 * @param html - Rendered HTML content
 * @param offerId - Offer ID for file naming
 * @returns PDF buffer
 */
export async function generateOfferPdf(
  html: string,
  offerId: string
): Promise<Buffer> {
  logger.debug({ offerId }, 'Generating PDF from HTML');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Set content and wait for fonts/images to load
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      }
    });

    logger.info({ offerId, sizeKB: Math.round(pdfBuffer.length / 1024) }, 'PDF generated');

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Upload PDF to Supabase Storage and generate signed URL
 * 
 * @param pdfBuffer - PDF file buffer
 * @param offerId - Offer ID
 * @returns Storage path and signed URL
 */
export async function uploadOfferPdf(
  pdfBuffer: Buffer,
  offerId: string
): Promise<{ storagePath: string; signedUrl: string }> {
  const storagePath = `offers/${offerId}/offer-letter.pdf`;

  logger.debug({ offerId, storagePath }, 'Uploading PDF to Supabase Storage');

  // Upload to storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('offer-letters')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (uploadError) {
    logger.error({ error: uploadError, offerId }, 'Failed to upload PDF');
    throw new Error(`PDF upload failed: ${uploadError.message}`);
  }

  // Generate signed URL (30 days expiry)
  const { data: urlData, error: urlError } = await supabase.storage
    .from('offer-letters')
    .createSignedUrl(storagePath, 30 * 24 * 60 * 60); // 30 days in seconds

  if (urlError) {
    logger.error({ error: urlError, offerId }, 'Failed to generate signed URL');
    throw new Error(`Signed URL generation failed: ${urlError.message}`);
  }

  logger.info({
    offerId,
    storagePath,
    urlExpiryDays: 30
  }, 'PDF uploaded successfully');

  return {
    storagePath,
    signedUrl: urlData.signedUrl
  };
}

/**
 * Generate and store offer letter PDF
 * 
 * @param html - Rendered HTML
 * @param offerId - Offer ID
 * @returns PDF storage information
 */
export async function generateAndStoreOfferPdf(
  html: string,
  offerId: string
): Promise<GeneratePdfResult> {
  // Generate PDF
  const pdfBuffer = await generateOfferPdf(html, offerId);

  // Upload to storage
  const { storagePath, signedUrl } = await uploadOfferPdf(pdfBuffer, offerId);

  return {
    pdfBuffer,
    storagePath,
    signedUrl
  };
}
