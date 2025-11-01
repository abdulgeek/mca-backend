/**
 * Main Server Entry Point with CostKatana Integration
 */

import express from 'express';
import { trackCost, costTrackingMiddleware, getCostSummary } from './costkatana.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply CostKatana middleware for automatic tracking
app.use(costTrackingMiddleware({
  metadata: {
    service: 'mca-backend'
  }
}));

// Example endpoint demonstrating cost tracking
app.post('/api/ai/generate', async (req, res) => {
  try {
    // Your AI/LLM operation here
    const { prompt, model = 'amazon.nova-lite-v1:0' } = req.body;
    
    // Simulate AI operation (replace with actual AI call)
    const inputTokens = prompt ? prompt.length / 4 : 0; // Rough token estimation
    const outputTokens = 100; // Example output
    
    // Track the cost of this operation
    await trackCost({
      operation: 'text-generation',
      model,
      inputTokens,
      outputTokens,
      metadata: {
        endpoint: '/api/ai/generate',
        userId: req.headers['x-user-id'] || 'anonymous'
      }
    });
    
    // Store AI usage for middleware tracking
    res.locals.aiUsage = {
      model,
      inputTokens,
      outputTokens
    };
    
    res.json({
      success: true,
      result: 'AI response here',
      usage: {
        inputTokens,
        outputTokens,
        model
      }
    });
  } catch (error) {
    console.error('Error in AI generation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to get cost analytics
app.get('/api/costs/summary', async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;
    
    const summary = await getCostSummary({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      groupBy: groupBy as string
    });
    
    res.json(summary);
  } catch (error) {
    console.error('Error fetching cost summary:', error);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    costTracking: process.env.COSTKATANA_API_KEY ? 'enabled' : 'disabled',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💰 CostKatana: ${process.env.COSTKATANA_API_KEY ? 'Enabled' : 'Disabled (no API key)'}`);
});