import crypto from 'crypto';

/**
 * Generate a deterministic idempotency key for email delivery.
 * 
 * Uses SHA-256 hash of the pattern: `<event_type>:<entity_id>:<recipient_email>`
 * to ensure duplicate emails are prevented across retries and replays.
 * 
 * @param eventType - The type of event triggering the email (e.g., 'application_received', 'offer_extended')
 * @param entityId - The unique identifier of the entity (e.g., application ID, offer ID)
 * @param recipientEmail - The recipient's email address (normalized to lowercase)
 * @returns A 64-character hexadecimal hash string
 * 
 * @example
 * ```typescript
 * const key = generateEmailIdempotencyKey(
 *   'application_received',
 *   'app-123',
 *   'candidate@example.com'
 * );
 * // Returns: "a1b2c3d4..." (64-char hash)
 * ```
 * 
 * @security OWASP A02 - Uses SHA-256 for cryptographic hash generation
 */
export function generateEmailIdempotencyKey(
  eventType: string,
  entityId: string,
  recipientEmail: string
): string {
  // Normalize email to lowercase to ensure consistency
  const normalizedEmail = recipientEmail.toLowerCase().trim();
  
  // Create the input string with colon delimiters
  const input = `${eventType}:${entityId}:${normalizedEmail}`;
  
  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(input).digest('hex');
}
