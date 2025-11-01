/**
 * CostKatana Configuration and Initialization
 * Handles cost tracking for AI/LLM operations
 */

const CostKatana = require('cost-katana');

// Configuration object with environment variables
const config = {
  apiKey: process.env.COSTKATANA_API_KEY,
  defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
  environment: process.env.NODE_ENV || 'development',
  enableLogging: process.env.COSTKATANA_ENABLE_LOGGING === 'true',
  maxRetries: parseInt(process.env.COSTKATANA_MAX_RETRIES || '3'),
  timeout: parseInt(process.env.COSTKATANA_TIMEOUT || '30000'),
  webhookUrl: process.env.COSTKATANA_WEBHOOK_URL,
  costAlertThreshold: parseFloat(process.env.COSTKATANA_ALERT_THRESHOLD || '100')
};

// Validate required configuration
const validateConfig = () => {
  if (!config.apiKey) {
    throw new Error('COSTKATANA_API_KEY is required but not provided');
  }
  
  if (config.enableLogging) {
    console.log('[CostKatana] Configuration validated successfully');
  }
};

// Initialize CostKatana instance
let costKatanaInstance = null;

const initializeCostKatana = () => {
  try {
    validateConfig();
    
    costKatanaInstance = new CostKatana({
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
      options: {
        maxRetries: config.maxRetries,
        timeout: config.timeout,
        webhookUrl: config.webhookUrl,
        environment: config.environment
      }
    });
    
    // Set up event listeners for cost tracking
    if (config.enableLogging) {
      costKatanaInstance.on('cost-tracked', (data) => {
        console.log('[CostKatana] Cost tracked:', {
          model: data.model,
          cost: data.cost,
          tokens: data.tokens,
          timestamp: data.timestamp
        });
      });
      
      costKatanaInstance.on('threshold-exceeded', (data) => {
        console.warn('[CostKatana] Cost threshold exceeded:', data);
      });
    }
    
    // Set cost alert threshold
    if (config.costAlertThreshold > 0) {
      costKatanaInstance.setCostThreshold(config.costAlertThreshold);
    }
    
    console.log('[CostKatana] Initialized successfully');
    return costKatanaInstance;
  } catch (error) {
    console.error('[CostKatana] Initialization failed:', error.message);
    throw error;
  }
};

// Get or create CostKatana instance (singleton pattern)
const getCostKatana = () => {
  if (!costKatanaInstance) {
    costKatanaInstance = initializeCostKatana();
  }
  return costKatanaInstance;
};

// Middleware for Express to track API costs
const costTrackingMiddleware = (req, res, next) => {
  if (!costKatanaInstance) {
    return next();
  }
  
  const startTime = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    // Track cost if this is an AI-related endpoint
    if (req.path.includes('/ai') || req.path.includes('/llm')) {
      const metadata = {
        endpoint: req.path,
        method: req.method,
        duration,
        userId: req.user?.id || 'anonymous',
        timestamp: new Date().toISOString()
      };
      
      // Track the cost asynchronously
      costKatanaInstance.track(metadata).catch(error => {
        console.error('[CostKatana] Failed to track cost:', error);
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Helper function to track custom operations
const trackOperation = async (operation, metadata = {}) => {
  try {
    const ck = getCostKatana();
    const result = await ck.track({
      operation,
      ...metadata,
      timestamp: new Date().toISOString()
    });
    return result;
  } catch (error) {
    console.error('[CostKatana] Failed to track operation:', error);
    throw error;
  }
};

// Get cost summary for reporting
const getCostSummary = async (options = {}) => {
  try {
    const ck = getCostKatana();
    const summary = await ck.getSummary({
      startDate: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: options.endDate || new Date(),
      groupBy: options.groupBy || 'day'
    });
    return summary;
  } catch (error) {
    console.error('[CostKatana] Failed to get cost summary:', error);
    throw error;
  }
};

// Reset cost tracking (useful for testing)
const resetTracking = async () => {
  try {
    const ck = getCostKatana();
    await ck.reset();
    console.log('[CostKatana] Tracking reset successfully');
  } catch (error) {
    console.error('[CostKatana] Failed to reset tracking:', error);
    throw error;
  }
};

// Graceful shutdown
const shutdown = async () => {
  if (costKatanaInstance) {
    try {
      await costKatanaInstance.flush();
      await costKatanaInstance.close();
      console.log('[CostKatana] Shutdown completed');
    } catch (error) {
      console.error('[CostKatana] Shutdown error:', error);
    }
  }
};

module.exports = {
  getCostKatana,
  initializeCostKatana,
  costTrackingMiddleware,
  trackOperation,
  getCostSummary,
  resetTracking,
  shutdown,
  config
};