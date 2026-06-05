/* eslint-disable no-console */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { resourceFromAttributes } from '@opentelemetry/resources';

let sdk: NodeSDK | null = null;

export async function startTracing() {
  const enabled =
    String(process.env.OTEL_ENABLED ?? 'false').toLowerCase() === 'true';
  if (!enabled) return;

  const serviceName =
    process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? 'api';
  const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT; // ej: http://localhost:4318/v1/traces

  const traceExporter = exporterUrl
    ? new OTLPTraceExporter({ url: exporterUrl })
    : undefined;

  sdk = new NodeSDK({
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        process.env.NODE_ENV ?? 'development',
    }),
  });

  await sdk.start();

  process.on('SIGTERM', async () => {
    try {
      await sdk?.shutdown();
    } catch (e) {
      console.error('otel shutdown error', e);
    }
  });
}
