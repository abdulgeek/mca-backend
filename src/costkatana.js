/**
 * CostKatana Configuration and Initialization
 * Handles cost tracking and telemetry for AI model usage
 */

import CostKatana from 'cost-katana';

// Configuration object for CostKatana
const config = {
  apiKey: process.env.COSTKATANA_API_KEY,
  defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
  environment: process.env.NODE_ENV || 'development',
  telemetry: {
    enabled: process.env.COSTKATANA_TELEMETRY_ENABLED === 'true',
    endpoint: process.env.COSTKATANA_TELEMETRY_ENDPOINT,
    batchSize: parseInt(process.env.COSTKATANA_TELEMETRY_BATCH_SIZE || '100'),
    flushInterval: parseInt(process.env.COSTKATANA_TELEMETRY_FLUSH_INTERVAL || '30000')
  },
  costTracking: {
    enabled: process.env.COSTKATANA_COST_TRACKING_ENABLED !== 'false',
    currency: process.env.COSTKATANA_CURRENCY || 'USD',
    alertThreshold: parseFloat(process.env.COSTKATANA_ALERT_THRESHOLD || '100'),
    webhookUrl: process.env.COSTKATANA_WEBHOOK_URL
  },
  logging: {
    level: process.env.COSTKATANA_LOG_LEVEL || 'info',
    enabled: process.env.COSTKATANA_LOGGING_ENABLED !== 'false'
  }
};

// Initialize CostKatana instance
let costKatanaInstance = null;

/**
 * Initialize CostKatana with configuration
 * @returns {Promise<CostKatana>} Configured CostKatana instance
 */
export const initializeCostKatana = async () => {
  try {
    if (!config.apiKey) {
      console.warn('⚠️  CostKatana API key not provided. Running in limited mode.');
    }

    costKatanaInstance = new CostKatana(config);
    
    // Initialize telemetry if enabled
    if (config.telemetry.enabled) {
      await costKatanaInstance.telemetry.initialize();
      console.log('✅ CostKatana telemetry initialized');
    }

    // Initialize cost tracking if enabled
    if (config.costTracking.enabled) {
      await costKatanaInstance.costTracking.initialize();
      console.log('✅ CostKatana cost tracking initialized');
    }

    // Set up alert handler for cost threshold
    if (config.costTracking.alertThreshold) {
      costKatanaInstance.costTracking.onThresholdExceeded((alert) => {
        console.error(`⚠️  Cost threshold exceeded: ${alert.currentCost} ${alert.currency}`);
        // Add custom alert handling here (e.g., send email, Slack notification)
      });
    }

    console.log('✅ CostKatana initialized successfully');
    return costKatanaInstance;
  } catch (error) {
    console.error('❌ Failed to initialize CostKatana:', error);
    throw error;
  }
};

/**
 * Get the CostKatana instance
 * @returns {CostKatana} CostKatana instance
 */
export const getCostKatana = () => {
  if (!costKatanaInstance) {
    throw new Error('CostKatana not initialized. Call initializeCostKatana() first.');
  }
  return costKatanaInstance;
};

/**
 * Track AI model usage and costs
 * @param {Object} params - Tracking parameters
 * @param {string} params.model - Model identifier
 * @param {number} params.inputTokens - Number of input tokens
 * @param {number} params.outputTokens - Number of output tokens
 * @param {Object} params.metadata - Additional metadata
 * @returns {Promise<Object>} Cost calculation result
 */
export const trackUsage = async ({ model, inputTokens, outputTokens, metadata = {} }) => {
  try {
    const katana = getCostKatana();
    
    const result = await katana.track({
      model: model || config.defaultModel,
      inputTokens,
      outputTokens,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        environment: config.environment
      }
    });

    // Log cost information if logging is enabled
    if (config.logging.enabled) {
      console.log(`💰 Cost tracked: ${result.cost} ${result.currency} for ${model}`);
    }

    return result;
  } catch (error) {
    console.error('Failed to track usage:', error);
    throw error;
  }
};

/**
 * Get cost report for a specific time period
 * @param {Object} options - Report options
 * @param {Date} options.startDate - Start date for the report
 * @param {Date} options.endDate - End date for the report
 * @param {string} options.groupBy - Group results by (model, day, hour)
 * @returns {Promise<Object>} Cost report
 */
export const getCostReport = async ({ startDate, endDate, groupBy = 'model' }) => {
  try {
    const katana = getCostKatana();
    
    const report = await katana.costTracking.getReport({
      startDate,
      endDate,
      groupBy
    });

    return report;
  } catch (error) {
    console.error('Failed to get cost report:', error);
    throw error;
  }
};

/**
 * Send telemetry data
 * @param {Object} data - Telemetry data to send
 * @returns {Promise<void>}
 */
export const sendTelemetry = async (data) => {
  try {
    const katana = getCostKatana();
    
    if (!config.telemetry.enabled) {
      console.debug('Telemetry is disabled');
      return;
    }

    await katana.telemetry.send({
      ...data,
      timestamp: new Date().toISOString(),
      environment: config.environment
    });
  } catch (error) {
    console.error('Failed to send telemetry:', error);
    // Don't throw - telemetry failures shouldn't break the application
  }
};

/**
 * Flush pending telemetry data
 * @returns {Promise<void>}
 */
export const flushTelemetry = async () => {
  try {
    const katana = getCostKatana();
    
    if (config.telemetry.enabled) {
      await katana.telemetry.flush();
      console.log('✅ Telemetry data flushed');
    }
  } catch (error) {
    console.error('Failed to flush telemetry:', error);
  }
};

/**
 * Gracefully shutdown CostKatana
 * @returns {Promise<void>}
 */
export const shutdownCostKatana = async () => {
  try {
    if (costKatanaInstance) {
      // Flush any pending telemetry data
      await flushTelemetry();
      
      // Close connections
      await costKatanaInstance.close();
      
      console.log('✅ CostKatana shutdown complete');
      costKatanaInstance = null;
    }
  } catch (error) {
    console.error('Error during CostKatana shutdown:', error);
  }
};

// Export default instance getter for convenience
export default getCostKatana;