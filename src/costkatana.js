import { CostKatana } from 'cost-katana';
import dotenv from 'dotenv';

dotenv.config();

const costKatana = new CostKatana({
  apiKey: process.env.COSTKATANA_API_KEY,
  defaultModel: process.env.COSTKATANA_DEFAULT_MODEL,
});

// Cost tracking feature
export const trackCost = async (operation, details) => {
  try {
    await costKatana.trackCost(operation, details);
    console.log(`Cost tracked for operation: ${operation}`);
  } catch (error) {
    console.error(`Error tracking cost: ${error.message}`);
  }
};

// Cortex optimization feature
export const optimizeCortex = async (params) => {
  try {
    const result = await costKatana.optimizeCortex(params);
    console.log('Cortex optimization completed');
    return result;
  } catch (error) {
    console.error(`Error optimizing cortex: ${error.message}`);
    throw error;
  }
};

// Budget management feature
export const manageBudget = async (budgetParams) => {
  try {
    const budget = await costKatana.manageBudget(budgetParams);
    console.log('Budget management operation completed');
    return budget;
  } catch (error) {
    console.error(`Error managing budget: ${error.message}`);
    throw error;
  }
};

export default costKatana;