import CostKatana from 'cost-katana';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class CostKatanaService {
  constructor() {
    this.ck = null;
    this.initialized = false;
    this.trackingEnabled = process.env.COSTKATANA_TRACKING_ENABLED === 'true';
    this.debugMode = process.env.COSTKATANA_DEBUG === 'true';
  }

  /**
   * Initialize CostKatana with configuration
   */
  initialize() {
    try {
      if (this.initialized) {
        console.log('⚠️ CostKatana already initialized');
        return;
      }

      const apiKey = process.env.COSTKATANA_API_KEY;
      
      if (!apiKey) {
        console.warn('⚠️ COSTKATANA_API_KEY not found in environment variables');
        console.warn('⚠️ CostKatana tracking will be disabled');
        this.trackingEnabled = false;
        return;
      }

      // Initialize CostKatana
      this.ck = new CostKatana({
        apiKey,
        defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
        currency: process.env.COSTKATANA_CURRENCY || 'USD',
        debug: this.debugMode,
        autoTrack: process.env.COSTKATANA_AUTO_TRACK === 'true',
        trackingInterval: parseInt(process.env.COSTKATANA_TRACKING_INTERVAL || '60000'),
        maxBatchSize: parseInt(process.env.COSTKATANA_MAX_BATCH_SIZE || '100'),
        retryAttempts: parseInt(process.env.COSTKATANA_RETRY_ATTEMPTS || '3'),
        timeout: parseInt(process.env.COSTKATANA_TIMEOUT || '30000')
      });

      this.initialized = true;
      console.log('✅ CostKatana initialized successfully');

      // Log configuration in debug mode
      if (this.debugMode) {
        console.log('📊 CostKatana Configuration:', {
          defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
          currency: process.env.COSTKATANA_CURRENCY || 'USD',
          autoTrack: process.env.COSTKATANA_AUTO_TRACK === 'true',
          trackingInterval: process.env.COSTKATANA_TRACKING_INTERVAL || '60000'
        });
      }

      // Set up graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('❌ Failed to initialize CostKatana:', error);
      this.trackingEnabled = false;
    }
  }

  /**
   * Track an AI operation cost
   * @param {Object} params - Tracking parameters
   * @param {string} params.operation - Operation name
   * @param {string} params.model - AI model used
   * @param {number} params.inputTokens - Number of input tokens
   * @param {number} params.outputTokens - Number of output tokens
   * @param {Object} params.metadata - Additional metadata
   */
  async track(params) {
    if (!this.trackingEnabled || !this.ck) {
      if (this.debugMode) {
        console.log('⏭️ CostKatana tracking skipped (disabled or not initialized)');
      }
      return null;
    }

    try {
      const result = await this.ck.track({
        operation: params.operation || 'unknown',
        model: params.model || process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
        inputTokens: params.inputTokens || 0,
        outputTokens: params.outputTokens || 0,
        metadata: {
          ...params.metadata,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString()
        }
      });

      if (this.debugMode) {
        console.log('✅ Cost tracked:', result);
      }

      return result;
    } catch (error) {
      console.error('❌ Failed to track cost:', error);
      return null;
    }
  }

  /**
   * Get cost analytics for a specific time period
   * @param {Object} options - Query options
   * @param {Date} options.startDate - Start date
   * @param {Date} options.endDate - End date
   * @param {string} options.groupBy - Group results by (day, week, month)
   */
  async getAnalytics(options = {}) {
    if (!this.ck) {
      throw new Error('CostKatana not initialized');
    }

    try {
      const analytics = await this.ck.getAnalytics({
        startDate: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        endDate: options.endDate || new Date(),
        groupBy: options.groupBy || 'day'
      });

      return analytics;
    } catch (error) {
      console.error('❌ Failed to get analytics:', error);
      throw error;
    }
  }

  /**
   * Get current usage and remaining budget
   */
  async getUsage() {
    if (!this.ck) {
      throw new Error('CostKatana not initialized');
    }

    try {
      const usage = await this.ck.getUsage();
      return usage;
    } catch (error) {
      console.error('❌ Failed to get usage:', error);
      throw error;
    }
  }

  /**
   * Set budget alert threshold
   * @param {number} threshold - Budget threshold in currency units
   */
  async setBudgetAlert(threshold) {
    if (!this.ck) {
      throw new Error('CostKatana not initialized');
    }

    try {
      await this.ck.setBudgetAlert(threshold);
      console.log(`✅ Budget alert set at ${threshold} ${process.env.COSTKATANA_CURRENCY || 'USD'}`);
    } catch (error) {
      console.error('❌ Failed to set budget alert:', error);
      throw error;
    }
  }

  /**
   * Express middleware for automatic cost tracking
   */
  middleware() {
    return async (req, res, next) => {
      if (!this.trackingEnabled || !this.ck) {
        return next();
      }

      // Store start time
      req.costKatanaStart = Date.now();

      // Override res.json to track AI responses
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Check if response contains AI-related data
        if (body && (body.aiResponse || body.tokens || body.model)) {
          const duration = Date.now() - req.costKatanaStart;
          
          // Track the cost asynchronously
          this.track({
            operation: `${req.method} ${req.path}`,
            model: body.model,
            inputTokens: body.inputTokens || body.tokens?.input || 0,
            outputTokens: body.outputTokens || body.tokens?.output || 0,
            metadata: {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              duration,
              userAgent: req.get('user-agent'),
              ip: req.ip
            }
          }).catch(error => {
            console.error('Failed to track cost in middleware:', error);
          });
        }

        return originalJson(body);
      };

      next();
    };
  }

  /**
   * Set up graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async () => {
      if (this.ck) {
        try {
          console.log('📊 Flushing CostKatana data...');
          await this.ck.flush();
          console.log('✅ CostKatana data flushed successfully');
        } catch (error) {
          console.error('❌ Failed to flush CostKatana data:', error);
        }
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  /**
   * Check if CostKatana is initialized and ready
   */
  isReady() {
    return this.initialized && this.trackingEnabled;
  }

  /**
   * Get CostKatana instance (for advanced usage)
   */
  getInstance() {
    return this.ck;
  }
}

// Create singleton instance
const costKatanaService = new CostKatanaService();

export default costKatanaService;

// Named exports for specific functionality
export { costKatanaService };

// Example usage functions
export const trackAIOperation = async (operation, model, inputTokens, outputTokens, metadata = {}) => {
  return costKatanaService.track({
    operation,
    model,
    inputTokens,
    outputTokens,
    metadata
  });
};

export const getCostAnalytics = async (startDate, endDate, groupBy = 'day') => {
  return costKatanaService.getAnalytics({
    startDate,
    endDate,
    groupBy
  });
};

export const getCurrentUsage = async () => {
  return costKatanaService.getUsage();
};