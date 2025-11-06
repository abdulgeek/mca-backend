import express from 'express';
import dotenv from 'dotenv';
import costKatanaService from './costkatana.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize CostKatana
try {
  costKatanaService.initialize();
  
  // Add CostKatana middleware for automatic tracking
  if (process.env.COSTKATANA_AUTO_TRACK === 'true') {
    app.use(costKatanaService.middleware());
  }
} catch (error) {
  console.error('Failed to initialize CostKatana:', error);
  // Continue running the app even if CostKatana fails
}

// Example endpoint demonstrating cost tracking
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    
    // Simulate AI operation
    const response = await performAIOperation(prompt, model);
    
    // Track the cost of this operation
    if (costKatanaService.getInstance()) {
      await costKatanaService.trackCost({
        operation: 'text-generation',
        model: model || 'amazon.nova-lite-v1:0',
        inputTokens: estimateTokens(prompt),
        outputTokens: estimateTokens(response),
        userId: req.user?.id,
        metadata: {
          endpoint: '/api/ai/generate',
          promptLength: prompt.length
        }
      });
    }
    
    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Error in AI generation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cost analytics endpoint
app.get('/api/costs/analytics', async (req, res) => {
  try {
    const analytics = await costKatanaService.getAnalytics({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy || 'day'
    });
    
    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Budget management endpoint
app.post('/api/costs/budget', async (req, res) => {
  try {
    const result = await costKatanaService.setBudget(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error setting budget:', error);
    res.status(500).json({ error: 'Failed to set budget' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const costKatanaStatus = costKatanaService.isInitialized ? 'healthy' : 'not initialized';
  res.json({ 
    status: 'healthy',
    costKatana: costKatanaStatus,
    timestamp: new Date().toISOString()
  });
});

// Placeholder functions (replace with your actual implementations)
async function performAIOperation(prompt: string, model: string) {
  // Your AI operation logic here
  return `Generated response for: ${prompt}`;
}

function estimateTokens(text: string): number {
  // Simple token estimation (replace with actual tokenizer)
  return Math.ceil(text.length / 4);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await costKatanaService.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await costKatanaService.shutdown();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 CostKatana status: ${costKatanaService.isInitialized ? 'Active' : 'Inactive'}`);
});