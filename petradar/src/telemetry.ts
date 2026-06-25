import { useAzureMonitor } from 'applicationinsights';


export function setupApplicationInsights(): void {
  const connectionString =
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim();

  if (!connectionString) {
    console.log(
      '[AppInsights] APPLICATIONINSIGHTS_CONNECTION_STRING not set – telemetry disabled.',
    );
    return;
  }

  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString,
    },
  });

  console.log('[AppInsights] Azure Monitor telemetry initialized.');
}
