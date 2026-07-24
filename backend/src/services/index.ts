export { auditEvent, auditEventOrThrow } from './auditService';
export type { AuditEventInput } from './auditService';
export {
	GENERIC_REGISTRATION_MESSAGE,
	registerCandidate,
	resendOtp,
	verifyOtp,
	AuthError,
	isPasswordStrong
} from './authService';
export type { RegistrationInput, ResendOtpInput, VerifyOtpInput, VerifyOtpResult } from './authService';
