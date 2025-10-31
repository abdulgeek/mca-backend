import { CostKatana } from 'cost-katana';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

const costKatanaConfig = {
  apiKey: process.env.COSTKATANA_API_KEY,
  defaultModel: process.env.COSTKATANA_DEFAULT_MODEL || 'amazon.nova-lite-v1:0',
};

let costKatanaInstance;

try {
  costKatanaInstance = new CostKatana(costKatanaConfig);
  logger.info('CostKatana initialized successfully');
} catch (error) {
  logger.error('Failed to initialize CostKatana:', error);
  throw error;
}

export const trackCost = async (modelName, tokens) => {
  try {
    const cost = await costKatanaInstance.trackCost(modelName, tokens);
    logger.info(`Cost tracked: ${cost} for model ${modelName} with ${tokens} tokens`);
    return cost;
  } catch (error) {
    logger.error('Error tracking cost:', error);
    throw error;
  }
};

export default costKatanaInstance;