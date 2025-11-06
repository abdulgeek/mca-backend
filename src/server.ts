// Updated server.ts with CostKatana integration
import express from 'express';
import { initializeCostKatana, costTrackingMiddleware, trackCost, optimizeRequest, getCostReport } from './costkatana';

// ... existing imports ...

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize CostKatana early in the application lifecycle
const costKatana = initializeCostKatana();

// ... existing middleware ...

// Add CostKatana tracking middleware (add after body parser but before routes)
app.use(costTrackingMiddleware());

// CostKatana health check endpoint
app.get('/health/costkatana', async (req, res) => {
  const instance = costKatana;
  if (!instance) {
    return res.status(503).json({ 
      status: 'unavailable', 
      message: 'CostKatana not initialized' 
    });
  }
  
  res.json({ 
    status: 'healthy',
    tracking: process.env.COSTKATANA_ENABLE_TRACKING !== 'false',
    optimization: process.env.COSTKATANA_ENABLE_OPTIMIZATION !== 'false',
    environment: process.env.NODE_ENV || 'development'
  });
});

// CostKatana cost report endpoint
app.get('/api/costs/report', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const report = await getCostReport(
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate cost report' });
  }
});

// Example: Integrate CostKatana with an AI endpoint
app.post('/api/ai/completion', async (req, res) => {
  try {
    // Optimize request parameters using Cortex
    const optimizedParams = await optimizeRequest({
      model: req.body.model || process.env.COSTKATANA_DEFAULT_MODEL,
      prompt: req.body.prompt,
      max_tokens: req.body.max_tokens || 1000,
      temperature: req.body.temperature || 0.7
    });

    // Your existing AI logic here
    // const result = await yourAIService.complete(optimizedParams);
    
    // Track the cost of this operation
    await trackCost('ai-completion', {
      model: optimizedParams.model,
      tokens: optimizedParams.max_tokens,
      userId: req.user?.id,
      endpoint: req.path
    });

    // For demo purposes, returning optimized params
    res.json({ 
      success: true, 
      optimizedParams,
      message: 'AI completion with cost tracking' 
    });
  } catch (error) {
    console.error('AI completion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ... existing routes ...

// Graceful shutdown with CostKatana cleanup
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Flush any pending CostKatana metrics
  if (costKatana && typeof costKatana.flush === 'function') {
    await costKatana.flush().catch(console.error);
  }
  
  // ... existing shutdown logic ...
  
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CostKatana: ${costKatana ? 'Initialized ✓' : 'Not initialized ✗'}`);
});

export default app;