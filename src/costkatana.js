/**
 * CostKatana Configuration and Initialization
 * This module handles the setup and configuration of CostKatana for cost tracking and telemetry
 */

import CostKatana from 'cost-katana';

// Initialize CostKatana with configuration from environment variables
class CostKatanaService {
  constructor() {
    this.instance = null;
    this.isInitialized = false;
  }

  /**
   * Initialize CostKatana with configuration
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.log('CostKatana already initialized');
        return;
      }

      const config = {
        apiKey: process.env.COSTKATANA_API_KEY,
        defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
        environment: process.env.NODE_ENV || 'development',
        projectName: process.env.COSTKATANA_PROJECT_NAME || 'mca-backend',
        
        // Cost tracking configuration
        costTracking: {
          enabled: process.env.COSTKATANA_COST_TRACKING_ENABLED !== 'false',
          currency: process.env.COSTKATANA_CURRENCY || 'USD',
          alertThreshold: parseFloat(process.env.COSTKATANA_ALERT_THRESHOLD) || 100,
          dailyLimit: parseFloat(process.env.COSTKATANA_DAILY_LIMIT) || 1000,
        },
        
        // Telemetry configuration
        telemetry: {
          enabled: process.env.COSTKATANA_TELEMETRY_ENABLED !== 'false',
          logLevel: process.env.COSTKATANA_LOG_LEVEL || 'info',
          sendMetrics: process.env.COSTKATANA_SEND_METRICS !== 'false',
          metricsInterval: parseInt(process.env.COSTKATANA_METRICS_INTERVAL) || 60000, // 1 minute
        },
      };

      this.instance = new CostKatana(config);
      await this.instance.init();
      
      this.isInitialized = true;
      console.log('✅ CostKatana initialized successfully');
      
      // Set up cost tracking hooks
      this.setupCostTracking();
      
      // Set up telemetry
      this.setupTelemetry();
      
    } catch (error) {
      console.error('❌ Failed to initialize CostKatana:', error);
      throw error;
    }
  }

  /**
   * Setup cost tracking middleware and hooks
   */
  setupCostTracking() {
    if (!this.instance) return;
    
    // Register cost tracking for API calls
    this.instance.on('cost', (event) => {
      console.log(`💰 Cost tracked: ${event.cost} ${event.currency} for ${event.operation}`);
    });
    
    // Set up alert handler
    this.instance.on('costAlert', (alert) => {
      console.warn(`⚠️ Cost Alert: ${alert.message}`);
      // You can add custom alert handling here (e.g., send email, Slack notification)
    });
  }

  /**
   * Setup telemetry collection
   */
  setupTelemetry() {
    if (!this.instance) return;
    
    // Register telemetry handlers
    this.instance.on('telemetry', (data) => {
      if (process.env.COSTKATANA_DEBUG === 'true') {
        console.log('📊 Telemetry data:', data);
      }
    });
  }

  /**
   * Track a custom operation cost
   * @param {string} operation - Operation name
   * @param {number} tokens - Number of tokens used
   * @param {string} model - Model used (optional)
   * @returns {Promise<Object>}
   */
  async trackCost(operation, tokens, model = null) {
    if (!this.instance) {
      console.warn('CostKatana not initialized');
      return null;
    }
    
    try {
      const result = await this.instance.track({
        operation,
        tokens,
        model: model || process.env.COSTKATANA_DEFAULT_MODEL,
        timestamp: new Date().toISOString(),
      });
      
      return result;
    } catch (error) {
      console.error('Failed to track cost:', error);
      return null;
    }
  }

  /**
   * Get cost summary for a time period
   * @param {string} period - Period ('day', 'week', 'month')
   * @returns {Promise<Object>}
   */
  async getCostSummary(period = 'day') {
    if (!this.instance) {
      console.warn('CostKatana not initialized');
      return null;
    }
    
    try {
      return await this.instance.getCostSummary(period);
    } catch (error) {
      console.error('Failed to get cost summary:', error);
      return null;
    }
  }

  /**
   * Send custom telemetry event
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   * @returns {Promise<void>}
   */
  async sendTelemetry(eventName, data) {
    if (!this.instance) {
      console.warn('CostKatana not initialized');
      return;
    }
    
    try {
      await this.instance.telemetry(eventName, data);
    } catch (error) {
      console.error('Failed to send telemetry:', error);
    }
  }

  /**
   * Express middleware for automatic cost tracking
   * @returns {Function}
   */
  middleware() {
    return async (req, res, next) => {
      if (!this.instance) {
        return next();
      }
      
      // Start tracking request
      const startTime = Date.now();
      req.costKatana = {
        startTime,
        operation: `${req.method} ${req.path}`,
      };
      
      // Override res.json to track AI responses
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        const duration = Date.now() - startTime;
        
        // Track telemetry for the request
        if (costKatanaService.instance) {
          costKatanaService.sendTelemetry('api_request', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
          });
        }
        
        return originalJson(data);
      };
      
      next();
    };
  }

  /**
   * Shutdown CostKatana gracefully
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.instance) {
      console.log('Shutting down CostKatana...');
      await this.instance.shutdown();
      this.instance = null;
      this.isInitialized = false;
    }
  }
}

// Create singleton instance
const costKatanaService = new CostKatanaService();

// Export both the service and convenience methods
export default costKatanaService;

// Convenience exports for common operations
export const trackCost = (operation, tokens, model) => 
  costKatanaService.trackCost(operation, tokens, model);

export const getCostSummary = (period) => 
  costKatanaService.getCostSummary(period);

export const sendTelemetry = (eventName, data) => 
  costKatanaService.sendTelemetry(eventName, data);

export const costKatanaMiddleware = () => 
  costKatanaService.middleware();