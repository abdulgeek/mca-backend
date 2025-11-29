/**
 * CostKatana Integration Service
 * Provides cost tracking and monitoring for AI/LLM API calls
 */

import CostKatana from 'cost-katana';

/**
 * Configuration interface for CostKatana
 */
export interface CostKatanaConfig {
  apiKey: string;
  defaultModel?: string;
  autoTrack?: boolean;
  debug?: boolean;
  maxCostPerRequest?: number;
  alertThreshold?: number;
}

/**
 * CostKatana service class for managing cost tracking
 */
class CostKatanaService {
  private costKatana: any;
  private initialized: boolean = false;
  private config: CostKatanaConfig;

  constructor() {
    this.config = {
      apiKey: process.env.COSTKATANA_API_KEY || '',
      defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
      autoTrack: process.env.COSTKATANA_AUTO_TRACK === 'true',
      debug: process.env.COSTKATANA_DEBUG === 'true',
      maxCostPerRequest: parseFloat(process.env.COSTKATANA_MAX_COST_PER_REQUEST || '1.0'),
      alertThreshold: parseFloat(process.env.COSTKATANA_ALERT_THRESHOLD || '10.0')
    };
  }

  /**
   * Initialize CostKatana with configuration
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    try {
      if (!this.config.apiKey) {
        console.warn('⚠️  CostKatana: API key not provided. Cost tracking disabled.');
        return;
      }

      this.costKatana = new CostKatana({
        apiKey: this.config.apiKey,
        defaultModel: this.config.defaultModel,
        autoTrack: this.config.autoTrack,
        debug: this.config.debug
      });

      this.initialized = true;
      console.log('✅ CostKatana initialized successfully');
      
      if (this.config.debug) {
        console.log('📊 CostKatana Config:', {
          defaultModel: this.config.defaultModel,
          autoTrack: this.config.autoTrack,
          maxCostPerRequest: this.config.maxCostPerRequest,
          alertThreshold: this.config.alertThreshold
        });
      }
    } catch (error) {
      console.error('❌ Failed to initialize CostKatana:', error);
      throw error;
    }
  }

  /**
   * Track API call cost
   * @param {string} model - The model being used
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @param {string} [requestId] - Optional request identifier
   * @returns {Promise<CostResult>}
   */
  async trackCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    requestId?: string
  ): Promise<CostResult> {
    if (!this.initialized) {
      throw new Error('CostKatana not initialized. Call initialize() first.');
    }

    try {
      const cost = await this.costKatana.calculateCost({
        model,
        inputTokens,
        outputTokens,
        requestId: requestId || this.generateRequestId()
      });

      // Check if cost exceeds maximum allowed
      if (cost.totalCost > this.config.maxCostPerRequest!) {
        console.warn(`⚠️  Cost exceeded limit: $${cost.totalCost} > $${this.config.maxCostPerRequest}`);
      }

      // Check if cumulative cost exceeds alert threshold
      const totalSpent = await this.getTotalSpent();
      if (totalSpent > this.config.alertThreshold!) {
        console.warn(`🚨 Alert: Total spending ($${totalSpent}) exceeds threshold ($${this.config.alertThreshold})`);
      }

      if (this.config.debug) {
        console.log(`💰 Cost tracked: $${cost.totalCost} (${inputTokens} in, ${outputTokens} out)`);
      }

      return cost;
    } catch (error) {
      console.error('Error tracking cost:', error);
      throw error;
    }
  }

  /**
   * Get total spent across all tracked requests
   * @returns {Promise<number>}
   */
  async getTotalSpent(): Promise<number> {
    if (!this.initialized) {
      return 0;
    }

    try {
      return await this.costKatana.getTotalSpent();
    } catch (error) {
      console.error('Error getting total spent:', error);
      return 0;
    }
  }

  /**
   * Get cost analytics for a specific time period
   * @param {Date} startDate - Start of the period
   * @param {Date} endDate - End of the period
   * @returns {Promise<CostAnalytics>}
   */
  async getAnalytics(startDate: Date, endDate: Date): Promise<CostAnalytics> {
    if (!this.initialized) {
      throw new Error('CostKatana not initialized');
    }

    try {
      return await this.costKatana.getAnalytics({
        startDate,
        endDate
      });
    } catch (error) {
      console.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Express middleware for automatic cost tracking
   * @returns {Function} Express middleware function
   */
  middleware() {
    return async (req: any, res: any, next: any) => {
      if (!this.initialized || !this.config.autoTrack) {
        return next();
      }

      // Store original json method
      const originalJson = res.json;

      // Override json method to track costs
      res.json = function(data: any) {
        // Extract token counts from response if available
        if (data?.usage) {
          const { inputTokens, outputTokens, model } = data.usage;
          if (inputTokens && outputTokens) {
            costKatanaService.trackCost(
              model || costKatanaService.config.defaultModel!,
              inputTokens,
              outputTokens,
              req.id || req.headers['x-request-id']
            ).catch(error => {
              console.error('Failed to track cost in middleware:', error);
            });
          }
        }

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    };
  }

  /**
   * Generate a unique request ID
   * @returns {string}
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if CostKatana is initialized
   * @returns {boolean}
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current configuration
   * @returns {CostKatanaConfig}
   */
  getConfig(): CostKatanaConfig {
    return { ...this.config };
  }
}

/**
 * Cost result interface
 */
export interface CostResult {
  totalCost: number;
  inputCost: number;
  outputCost: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requestId: string;
  timestamp: Date;
}

/**
 * Cost analytics interface
 */
export interface CostAnalytics {
  totalCost: number;
  totalRequests: number;
  averageCostPerRequest: number;
  mostExpensiveModel: string;
  costByModel: Record<string, number>;
  dailyCosts: Array<{
    date: string;
    cost: number;
    requests: number;
  }>;
}

// Create and export singleton instance
const costKatanaService = new CostKatanaService();
export default costKatanaService;

// Export class for testing purposes
export { CostKatanaService };