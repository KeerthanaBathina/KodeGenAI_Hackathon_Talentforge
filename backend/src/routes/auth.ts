import { Router } from 'express';
import { z } from 'zod';
import {
  AuthError,
  GENERIC_REGISTRATION_MESSAGE,
  registerCandidate,
  resendOtp,
  verifyOtp
} from '../services/authService';
import logger from '../utils/logger';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/)
});

const resendOtpSchema = z.object({
  email: z.string().email()
});

const router = Router();

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors
    });
    return;
  }

  try {
    await registerCandidate(parsed.data);
    res.status(202).json({
      message: GENERIC_REGISTRATION_MESSAGE,
      next: '/verify-otp'
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === 'INVALID_PASSWORD') {
      res.status(400).json({ message: error.message });
      return;
    }

    logger.error({ error }, 'auth: register endpoint failed');
    res.status(500).json({ message: 'Unable to process registration request' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors
    });
    return;
  }

  try {
    const result = await verifyOtp(parsed.data);
    res.status(200).json({
      message: 'Verification successful',
      redirectTo: result.redirectTo,
      candidateId: result.candidateId
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === 'OTP_EXPIRED') {
      res.status(400).json({
        message: 'Code expired - please request a new one',
        canResend: true
      });
      return;
    }

    if (error instanceof AuthError && error.code === 'INVALID_OTP') {
      res.status(400).json({
        message: 'Invalid verification code',
        canResend: false
      });
      return;
    }

    logger.error({ error }, 'auth: verify-otp endpoint failed');
    res.status(500).json({ message: 'Unable to verify OTP' });
  }
});

router.post('/resend-otp', async (req, res) => {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors
    });
    return;
  }

  try {
    await resendOtp(parsed.data);
    res.status(202).json({ message: GENERIC_REGISTRATION_MESSAGE });
  } catch (error) {
    logger.error({ error }, 'auth: resend-otp endpoint failed');
    res.status(500).json({ message: 'Unable to resend OTP' });
  }
});

export default router;
