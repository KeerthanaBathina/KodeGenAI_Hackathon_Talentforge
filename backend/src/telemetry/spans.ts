import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('ai-interview-backend');

export async function withEnqueueSpan<T>(
  queueName: string,
  jobName: string,
  operation: () => Promise<T>
): Promise<T> {
  const span = tracer.startSpan(`${queueName} enqueue`, {
    kind: SpanKind.PRODUCER,
    attributes: {
      'messaging.system': 'bullmq',
      'messaging.destination': queueName,
      'messaging.operation': 'send',
      'messaging.bullmq.job_name': jobName
    }
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  operation: () => Promise<T>
): Promise<T> {
  const span = tracer.startSpan(name, {
    attributes,
    kind: SpanKind.INTERNAL
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}
