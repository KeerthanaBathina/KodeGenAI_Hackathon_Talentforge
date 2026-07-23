import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import pino from 'pino';

const otelLogger = pino({
  level: 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'ai-interview-backend', component: 'otel' }
});

if (process.env['NODE_ENV'] !== 'production') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
}

const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

if (!endpoint) {
  otelLogger.info('[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set. Tracing disabled.');
} else {
  const headersRaw = process.env['OTEL_EXPORTER_OTLP_HEADERS'] ?? '';
  const headers: Record<string, string> = {};

  for (const pair of headersRaw.split(',')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const key = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      if (key && value) {
        headers[key] = value;
      }
    }
  }

  const exporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers,
    timeoutMillis: 10_000
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'ai-interview-backend',
      [ATTR_SERVICE_VERSION]: process.env['npm_package_version'] ?? '0.0.0',
      'deployment.environment': process.env['NODE_ENV'] ?? 'development'
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return url.startsWith('/health') || url.startsWith('/ready');
          }
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true
        }
      })
    ]
  });

  sdk.start();

  process.on('SIGTERM', async () => {
    try {
      await sdk.shutdown();
      otelLogger.info('[otel] SDK shut down successfully');
    } catch (error) {
      otelLogger.error({ error }, '[otel] Error shutting down SDK');
    }
  });

  otelLogger.info(`[otel] Tracing initialized -> ${endpoint}`);
}
