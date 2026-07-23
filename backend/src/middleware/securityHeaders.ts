import helmet from 'helmet';
import { NextFunction, Request, Response } from 'express';

export function buildSecurityHeaders() {
  const securityHeaders = helmet({
    strictTransportSecurity: {
      maxAge: 63_072_000,
      includeSubDomains: true,
      preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        imgSrc: ["'none'"],
        connectSrc: ["'self'"],
        fontSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hidePoweredBy: true,
    dnsPrefetchControl: { allow: false },
    ieNoOpen: true,
    xssFilter: true
  });

  return (req: Request, res: Response, next: NextFunction) => {
    securityHeaders(req, res, () => {
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      next();
    });
  };
}
