/**
 * Health Check Ping Service
 * 
 * This service pings the health endpoint periodically to keep the Render.com
 * service active and prevent it from becoming stale.
 * - Runs every hour by default
 * - Pings localhost to keep the server process active
 * - Logs ping results for monitoring
 */

import * as cron from 'node-cron';
import axios, { AxiosError } from 'axios';

interface PingResult {
  success: boolean;
  timestamp: Date;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}

let pingCronJob: cron.ScheduledTask | null = null;
let lastPingResult: PingResult | null = null;

/**
 * Ping the health endpoint
 */
const pingHealthEndpoint = async (): Promise<PingResult> => {
  const startTime = Date.now();
  const port = process.env.PORT || 5001;
  const healthEndpoint = `http://localhost:${port}/api/health`;

  try {
    const response = await axios.get(healthEndpoint, {
      timeout: 10000, // 10 second timeout
      validateStatus: (status) => status < 500, // Accept any status < 500
    });

    const responseTime = Date.now() - startTime;
    const result: PingResult = {
      success: response.status === 200,
      timestamp: new Date(),
      statusCode: response.status,
      responseTime,
    };

    if (result.success) {
      console.log(`✅ Health check ping successful: ${response.status} (${responseTime}ms)`);
    } else {
      console.warn(`⚠️ Health check ping returned non-200 status: ${response.status} (${responseTime}ms)`);
    }

    lastPingResult = result;
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const axiosError = error as AxiosError;
    
    const result: PingResult = {
      success: false,
      timestamp: new Date(),
      responseTime,
      error: axiosError.message || 'Unknown error',
      statusCode: axiosError.response?.status,
    };

    console.error(`❌ Health check ping failed: ${result.error} (${responseTime}ms)`);
    if (axiosError.response) {
      console.error(`   Status: ${axiosError.response.status}`);
      console.error(`   Data:`, axiosError.response.data);
    }

    lastPingResult = result;
    return result;
  }
};

/**
 * Initialize the health check ping cron job
 * Default: Runs every hour (0 * * * *)
 */
export const initializeHealthCheckPing = (): void => {
  // Cron schedule: every hour at minute 0
  const cronSchedule = '0 * * * *';
  const port = process.env.PORT || 5001;

  console.log(`🔄 Initializing health check ping service...`);
  console.log(`   Schedule: ${cronSchedule} (every hour)`);
  console.log(`   URL: http://localhost:${port}/api/health`);

  // Stop existing cron job if any
  if (pingCronJob) {
    pingCronJob.stop();
  }

  // Create and start cron job
  pingCronJob = cron.schedule(cronSchedule, async () => {
    console.log(`🏓 Pinging health endpoint at ${new Date().toISOString()}...`);
    await pingHealthEndpoint();
  });

  // Ping immediately on startup (after a short delay to ensure server is ready)
  setTimeout(async () => {
    console.log('🏓 Performing initial health check ping...');
    await pingHealthEndpoint();
  }, 10000); // Wait 10 seconds after server starts

  console.log('✅ Health check ping service initialized');
};

/**
 * Stop the health check ping service
 */
export const stopHealthCheckPing = (): void => {
  if (pingCronJob) {
    pingCronJob.stop();
    pingCronJob = null;
    console.log('🛑 Health check ping service stopped');
  }
};

/**
 * Get the last ping result
 */
export const getLastPingResult = (): PingResult | null => {
  return lastPingResult;
};

/**
 * Manually trigger a health check ping
 */
export const triggerHealthCheckPing = async (): Promise<PingResult> => {
  console.log('🏓 Manually triggering health check ping...');
  return await pingHealthEndpoint();
};

