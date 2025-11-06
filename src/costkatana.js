/**
 * CostKatana Configuration and Initialization
 * Provides cost tracking and optimization for AI operations
 */

const CostKatana = require('cost-katana');

// Configuration object with environment variables
const config = {
  apiKey: process.env.COSTKATANA_API_KEY,
  defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
  enableCostTracking: process.env.COSTKATANA_ENABLE_TRACKING !== 'false',
  enableOptimization: process.env.COSTKATANA_ENABLE_OPTIMIZATION !== 'false',
  maxCostPerRequest: parseFloat(process.env.COSTKATANA_MAX_COST_PER_REQUEST || '1.0'),
  logLevel: process.env.COSTKATANA_LOG_LEVEL || 'info',
  environment: process.env.NODE_ENV || 'development'
};

// Validate required configuration
if (!config.apiKey) {
  console.warn('⚠️  CostKatana: API key not configured. Cost tracking disabled.');
}

let costKatanaInstance = null;

/**
 * Initialize CostKatana with error handling
 * @returns {Object|null} CostKatana instance or null if initialization fails
 */
function initializeCostKatana() {
  if (costKatanaInstance) {
    return costKatanaInstance;
  }

  if (!config.apiKey) {
    console.log('CostKatana: Running in mock mode (no API key)');
    // Return mock instance for development
    return {
      track: async (operation, cost) => {
        console.log(`[Mock] Tracked: ${operation} - $${cost}`);
        return { success: true, mock: true };
      },
      optimize: async (params) => {
        console.log('[Mock] Optimization requested:', params);
        return { optimized: params, mock: true };
      },
      getCostReport: async () => {
        return { total: 0, operations: [], mock: true };
      },
      middleware: (req, res, next) => next()
    };
  }

  try {
    costKatanaInstance = new CostKatana({
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
      options: {
        enableCostTracking: config.enableCostTracking,
        enableOptimization: config.enableOptimization,
        maxCostPerRequest: config.maxCostPerRequest,
        logLevel: config.logLevel
      }
    });

    console.log('✅ CostKatana initialized successfully');
    console.log(`   - Cost Tracking: ${config.enableCostTracking ? 'Enabled' : 'Disabled'}`);
    console.log(`   - Optimization: ${config.enableOptimization ? 'Enabled' : 'Disabled'}`);
    console.log(`   - Default Model: ${config.defaultModel}`);
    
    return costKatanaInstance;
  } catch (error) {
    console.error('❌ Failed to initialize CostKatana:', error.message);
    return null;
  }
}

/**
 * Track AI operation costs
 * @param {string} operation - Operation name/identifier
 * @param {Object} metadata - Additional metadata for tracking
 * @returns {Promise<Object>} Tracking result
 */
async function trackCost(operation, metadata = {}) {
  const instance = initializeCostKatana();
  if (!instance) {
    return { success: false, error: 'CostKatana not initialized' };
  }

  try {
    const result = await instance.track({
      operation,
      model: metadata.model || config.defaultModel,
      tokens: metadata.tokens || 0,
      cost: metadata.cost,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        environment: config.environment
      }
    });

    if (config.logLevel === 'debug') {
      console.log(`[CostKatana] Tracked: ${operation}`, result);
    }

    return result;
  } catch (error) {
    console.error(`[CostKatana] Tracking error for ${operation}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Optimize AI request parameters using Cortex
 * @param {Object} params - Request parameters to optimize
 * @returns {Promise<Object>} Optimized parameters
 */
async function optimizeRequest(params) {
  const instance = initializeCostKatana();
  if (!instance || !config.enableOptimization) {
    return params; // Return original params if optimization is disabled
  }

  try {
    const optimized = await instance.optimize({
      ...params,
      constraints: {
        maxCost: config.maxCostPerRequest,
        preferredModels: [config.defaultModel],
        optimizationLevel: process.env.COSTKATANA_OPTIMIZATION_LEVEL || 'balanced'
      }
    });

    if (config.logLevel === 'debug') {
      console.log('[CostKatana] Optimization result:', {
        original: params,
        optimized
      });
    }

    return optimized;
  } catch (error) {
    console.error('[CostKatana] Optimization error:', error);
    return params; // Fallback to original params
  }
}

/**
 * Express middleware for automatic cost tracking
 * @returns {Function} Express middleware function
 */
function costTrackingMiddleware() {
  return async (req, res, next) => {
    if (!config.enableCostTracking) {
      return next();
    }

    const startTime = Date.now();
    const originalSend = res.send;
    
    // Track response and calculate costs
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      // Track the request if it's an AI endpoint
      if (req.path.includes('/ai') || req.path.includes('/llm')) {
        trackCost(`${req.method} ${req.path}`, {
          duration,
          statusCode: res.statusCode,
          requestSize: JSON.stringify(req.body || {}).length,
          responseSize: JSON.stringify(data || {}).length
        }).catch(err => {
          console.error('[CostKatana Middleware] Error:', err);
        });
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Get cost report for a specific time period
 * @param {Date} startDate - Start date for the report
 * @param {Date} endDate - End date for the report
 * @returns {Promise<Object>} Cost report
 */
async function getCostReport(startDate, endDate) {
  const instance = initializeCostKatana();
  if (!instance) {
    return { error: 'CostKatana not initialized' };
  }

  try {
    return await instance.getCostReport({
      startDate: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Default: last 7 days
      endDate: endDate || new Date(),
      groupBy: 'operation',
      includeDetails: true
    });
  } catch (error) {
    console.error('[CostKatana] Report generation error:', error);
    return { error: error.message };
  }
}

// Export configured instance and utility functions
module.exports = {
  initializeCostKatana,
  trackCost,
  optimizeRequest,
  costTrackingMiddleware,
  getCostReport,
  config,
  // Direct instance access (use with caution)
  getInstance: () => costKatanaInstance
};

// Example usage patterns (for documentation)
/*
// Cost Tracking Example:
const { trackCost } = require('./costkatana');

await trackCost('chat-completion', {
  model: 'gpt-4',
  tokens: 1500,
  cost: 0.045,
  userId: 'user123',
  endpoint: '/api/chat'
});

// Cortex Optimization Example:
const { optimizeRequest } = require('./costkatana');

const optimizedParams = await optimizeRequest({
  model: 'gpt-4',
  temperature: 0.7,
  max_tokens: 2000,
  messages: [...]
});
// Returns cost-optimized parameters while maintaining quality
*/