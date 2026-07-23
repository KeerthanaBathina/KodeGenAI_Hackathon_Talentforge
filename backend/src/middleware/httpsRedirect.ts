import { NextFunction, Request, Response } from 'express';

const EXEMPT_PATHS = ['/health', '/ready'];

export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  const env = process.env['NODE_ENV'];
  const shouldEnforce = env === 'production' || env === 'staging';

  if (!shouldEnforce) {
    next();
    return;
  }

  if (EXEMPT_PATHS.some((path) => req.path.startsWith(path))) {
    next();
    return;
  }

  const proto = req.headers['x-forwarded-proto'];
  const incomingProto = typeof proto === 'string' ? proto.split(',')[0]?.trim() : undefined;

  if (incomingProto === 'http') {
    const host = req.headers['host'] ?? req.hostname;
    res.redirect(301, `https://${host}${req.originalUrl}`);
    return;
  }

  next();
}
