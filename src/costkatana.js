/**
 * CostKatana Configuration and Initialization
 * Provides centralized cost tracking for AI/LLM operations
 */

const CostKatana = require('cost-katana');

// Configuration object with environment variables
const config = {
  apiKey: process.env.COSTKATANA_API_KEY,
  defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
  environment: process.env.NODE_ENV || 'development',
  enableLogging: process.env.COSTKATANA_ENABLE_LOGGING === 'true',
  maxRetries: parseInt(process.env.COSTKATANA_MAX_RETRIES || '3', 10),
  timeout: parseInt(process.env.COSTKATANA_TIMEOUT || '30000', 10)
};

// Validate required configuration
if (!config.apiKey) {
  console.warn('⚠️  CostKatana: API key not provided. Cost tracking will be disabled.');
}

/**
 * Initialize CostKatana instance with error handling
 */
let costKatanaInstance = null;

try {
  if (config.apiKey) {
    costKatanaInstance = new CostKatana({
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
      options: {
        enableLogging: config.enableLogging,
        maxRetries: config.maxRetries,
        timeout: config.timeout
      }
    });
    
    console.log('✅ CostKatana initialized successfully');
  }
} catch (error) {
  console.error('❌ Failed to initialize CostKatana:', error.message);
  // Continue without cost tracking if initialization fails
}

/**
 * Track AI/LLM operation costs
 * @param {Object} params - Tracking parameters
 * @param {string} params.operation - Operation name/identifier
 * @param {string} params.model - Model being used
 * @param {number} params.inputTokens - Number of input tokens
 * @param {number} params.outputTokens - Number of output tokens
 * @param {Object} params.metadata - Additional metadata
 * @returns {Promise<Object>} Cost tracking result
 */
const trackCost = async (params) => {
  if (!costKatanaInstance) {
    if (config.enableLogging) {
      console.log('CostKatana: Skipping cost tracking (not initialized)');
    }
    return { tracked: false, reason: 'CostKatana not initialized' };
  }

  try {
    const result = await costKatanaInstance.track({
      operation: params.operation,
      model: params.model || config.defaultModel,
      inputTokens: params.inputTokens || 0,
      outputTokens: params.outputTokens || 0,
      metadata: {
        ...params.metadata,
        environment: config.environment,
        timestamp: new Date().toISOString()
      }
    });

    if (config.enableLogging) {
      console.log(`💰 Cost tracked: ${result.cost} for operation: ${params.operation}`);
    }

    return result;
  } catch (error) {
    console.error('Error tracking cost:', error.message);
    return { tracked: false, error: error.message };
  }
};

/**
 * Get cost summary for a specific period
 * @param {Object} options - Query options
 * @param {Date} options.startDate - Start date for the period
 * @param {Date} options.endDate - End date for the period
 * @param {string} options.groupBy - Group results by (operation, model, day, etc.)
 * @returns {Promise<Object>} Cost summary
 */
const getCostSummary = async (options = {}) => {
  if (!costKatanaInstance) {
    return { error: 'CostKatana not initialized' };
  }

  try {
    const summary = await costKatanaInstance.getSummary({
      startDate: options.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Default: last 7 days
      endDate: options.endDate || new Date(),
      groupBy: options.groupBy || 'day'
    });

    return summary;
  } catch (error) {
    console.error('Error fetching cost summary:', error.message);
    return { error: error.message };
  }
};

/**
 * Express middleware for automatic cost tracking
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware function
 */
const costTrackingMiddleware = (options = {}) => {
  return async (req, res, next) => {
    // Skip if CostKatana is not initialized
    if (!costKatanaInstance) {
      return next();
    }

    // Store start time for duration calculation
    req.costKatanaStartTime = Date.now();

    // Intercept response to track costs
    const originalSend = res.send;
    res.send = function(data) {
      // Track cost if response contains AI/LLM usage data
      if (res.locals.aiUsage) {
        const duration = Date.now() - req.costKatanaStartTime;
        
        trackCost({
          operation: `${req.method} ${req.path}`,
          model: res.locals.aiUsage.model,
          inputTokens: res.locals.aiUsage.inputTokens,
          outputTokens: res.locals.aiUsage.outputTokens,
          metadata: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            ...options.metadata
          }
        }).catch(error => {
          console.error('Middleware cost tracking error:', error);
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Example usage function demonstrating cost tracking
 */
const exampleUsage = async () => {
  // Example 1: Track a simple AI operation
  await trackCost({
    operation: 'text-generation',
    model: 'gpt-3.5-turbo',
    inputTokens: 150,
    outputTokens: 200,
    metadata: {
      userId: 'user123',
      feature: 'chat'
    }
  });

  // Example 2: Get cost summary for the last week
  const summary = await getCostSummary({
    groupBy: 'model'
  });
  console.log('Cost Summary:', summary);
};

module.exports = {
  costKatana: costKatanaInstance,
  trackCost,
  getCostSummary,
  costTrackingMiddleware,
  config,
  exampleUsage
};