import { env } from '../config/env';
import logger from '../utils/logger';

export type SendOtpEmailInput = {
  email: string;
  otp: string;
  expiresAt: Date;
};

export async function sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
  if (env.EMAIL_PROVIDER === 'mock') {
    logger.info(
      {
        email: input.email,
        expiresAt: input.expiresAt.toISOString(),
        provider: env.EMAIL_PROVIDER
      },
      'auth: OTP dispatch simulated by mock email provider'
    );
    return;
  }

  logger.info(
    {
      email: input.email,
      expiresAt: input.expiresAt.toISOString(),
      provider: env.EMAIL_PROVIDER
    },
    'auth: OTP dispatch requested via external provider'
  );
}
