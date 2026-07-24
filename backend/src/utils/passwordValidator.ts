/**
 * Password Validation Utility
 * 
 * Validates password strength requirements for registration and password resets.
 * 
 * @module utils/passwordValidator
 */

export interface PasswordValidation {
    valid: boolean;
    error?: string;
}

/**
 * Validate password strength requirements.
 * 
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one digit (0-9)
 * 
 * @param password - Password to validate
 * @returns Validation result with error message if invalid
 */
export function validatePasswordStrength(password: string): PasswordValidation {
    if (!password || password.length < 8) {
        return {
            valid: false,
            error: 'Password must be at least 8 characters long',
        };
    }

    if (!/[A-Z]/.test(password)) {
        return {
            valid: false,
            error: 'Password must contain at least one uppercase letter',
        };
    }

    if (!/[a-z]/.test(password)) {
        return {
            valid: false,
            error: 'Password must contain at least one lowercase letter',
        };
    }

    if (!/\d/.test(password)) {
        return {
            valid: false,
            error: 'Password must contain at least one number',
        };
    }

    return { valid: true };
}
