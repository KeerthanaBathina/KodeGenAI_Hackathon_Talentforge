import crypto from 'crypto';
import logger from './logger';

/**
 * Encryption utility for sensitive data (HMAC secrets, API keys)
 * 
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment variable
 * Key should be a 32-byte (64 hex characters) string
 */
function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    
    if (!key) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    
    if (key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    
    return Buffer.from(key, 'hex');
}

/**
 * Encrypt sensitive text using AES-256-GCM
 * 
 * @param plaintext - Text to encrypt
 * @returns Base64-encoded encrypted data with IV and auth tag
 */
export function encrypt(plaintext: string): string {
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        // Format: iv:authTag:encryptedData (all hex-encoded)
        const combined = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
        
        // Return as base64 for cleaner storage
        return Buffer.from(combined).toString('base64');
    } catch (error) {
        logger.error('Encryption failed', { error });
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt sensitive text encrypted with AES-256-GCM
 * 
 * @param encryptedData - Base64-encoded encrypted data
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedData: string): string {
    try {
        const key = getEncryptionKey();
        
        // Decode from base64
        const combined = Buffer.from(encryptedData, 'base64').toString('utf8');
        
        // Split into components
        const parts = combined.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }
        
        const [ivHex, authTagHex, encryptedHex] = parts;
        
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        logger.error('Decryption failed', { error });
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Generate a random encryption key for ENCRYPTION_KEY environment variable
 * This is a utility function for initial setup
 * 
 * @returns 64-character hex string (32 bytes)
 */
export function generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if a string appears to be encrypted (base64-encoded with our format)
 * 
 * @param data - String to check
 * @returns True if data appears to be encrypted
 */
export function isEncrypted(data: string): boolean {
    try {
        // Check if it's valid base64
        const decoded = Buffer.from(data, 'base64').toString('utf8');
        // Check if it has our format (3 colon-separated hex strings)
        const parts = decoded.split(':');
        return parts.length === 3 && parts.every(part => /^[0-9a-fA-F]+$/.test(part));
    } catch {
        return false;
    }
}
