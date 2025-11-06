/**
 * CostKatana Integration Module
 * Handles initialization and configuration of cost tracking for AI operations
 */

import CostKatana from 'cost-katana';

class CostKatanaService {
  constructor() {
    this.instance = null;
    this.isInitialized = false;
  }

  /**
   * Initialize CostKatana with configuration
   * @param {Object} config - Configuration options
   * @returns {CostKatana} Configured CostKatana instance
   */
  initialize(config = {}) {
    try {
      // Validate required environment variables
      if (!process.env.COSTKATANA_API_KEY) {
        console.warn('⚠️  CostKatana: API key not found. Cost tracking will be disabled.');
        return null;
      }

      // Initialize CostKatana with configuration
      this.instance = new CostKatana({
        apiKey: process.env.COSTKATANA_API_KEY,
        defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
        environment: process.env.NODE_ENV || 'development',
        enableLogging: process.env.COSTKATANA_ENABLE_LOGGING === 'true',
        logLevel: process.env.COSTKATANA_LOG_LEVEL || 'info',
        maxRetries: parseInt(process.env.COSTKATANA_MAX_RETRIES || '3', 10),
        timeout: parseInt(process.env.COSTKATANA_TIMEOUT || '30000', 10),
        ...config
      });

      this.isInitialized = true;
      console.log('✅ CostKatana initialized successfully');
      
      return this.instance;
    } catch (error) {
      console.error('❌ Failed to initialize CostKatana:', error.message);
      throw error;
    }
  }

  /**
   * Track AI operation cost
   * @param {Object} params - Tracking parameters
   * @returns {Promise<Object>} Cost tracking result
   */
  async trackCost(params) {
    if (!this.isInitialized || !this.instance) {
      console.warn('CostKatana not initialized. Skipping cost tracking.');
      return null;
    }

    try {
      const result = await this.instance.track({
        model: params.model || process.env.COSTKATANA_DEFAULT_MODEL,
        operation: params.operation || 'unknown',
        inputTokens: params.inputTokens || 0,
        outputTokens: params.outputTokens || 0,
        metadata: {
          userId: params.userId,
          sessionId: params.sessionId,
          timestamp: new Date().toISOString(),
          ...params.metadata
        }
      });

      return result;
    } catch (error) {
      console.error('Error tracking cost:', error);
      // Don't throw - cost tracking should not break the application
      return null;
    }
  }

  /**
   * Get cost analytics for a specific period
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Analytics data
   */
  async getAnalytics(options = {}) {
    if (!this.isInitialized || !this.instance) {
      throw new Error('CostKatana not initialized');
    }

    try {
      return await this.instance.getAnalytics({
        startDate: options.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: options.endDate || new Date(),
        groupBy: options.groupBy || 'day',
        ...options
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }
  }

  /**
   * Set cost budget alerts
   * @param {Object} budget - Budget configuration
   * @returns {Promise<Object>} Budget setup result
   */
  async setBudget(budget) {
    if (!this.isInitialized || !this.instance) {
      throw new Error('CostKatana not initialized');
    }

    try {
      return await this.instance.setBudget({
        amount: budget.amount,
        period: budget.period || 'monthly',
        alertThreshold: budget.alertThreshold || 0.8,
        notificationEmail: budget.email || process.env.COSTKATANA_ALERT_EMAIL
      });
    } catch (error) {
      console.error('Error setting budget:', error);
      throw error;
    }
  }

  /**
   * Middleware for Express to automatically track costs
   * @returns {Function} Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      // Store start time for latency tracking
      req.costKatanaStart = Date.now();
      
      // Store original send method
      const originalSend = res.send;
      
      // Override send to track costs
      res.send = function(data) {
        // Track cost if AI operation was performed
        if (req.aiOperation) {
          const latency = Date.now() - req.costKatanaStart;
          
          this.trackCost({
            ...req.aiOperation,
            latency,
            endpoint: req.path,
            method: req.method,
            statusCode: res.statusCode
          }).catch(err => {
            console.error('CostKatana middleware error:', err);
          });
        }
        
        // Call original send
        return originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
  }

  /**
   * Get current instance
   * @returns {CostKatana|null} Current CostKatana instance
   */
  getInstance() {
    return this.instance;
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    if (this.instance && this.instance.close) {
      await this.instance.close();
    }
    this.instance = null;
    this.isInitialized = false;
    console.log('CostKatana shutdown complete');
  }
}

// Create singleton instance
const costKatanaService = new CostKatanaService();

// Export both the service and a convenience function
export default costKatanaService;

// Convenience exports for common operations
export const trackCost = (params) => costKatanaService.trackCost(params);
export const getAnalytics = (options) => costKatanaService.getAnalytics(options);
export const setBudget = (budget) => costKatanaService.setBudget(budget);