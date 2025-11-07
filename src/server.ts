import express from 'express';
import { initializeCostKatana, shutdownCostKatana, trackUsage, getCostReport, sendTelemetry } from './costkatana.js';

// ... existing imports ...

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize CostKatana
let costKatanaReady = false;

initializeCostKatana()
  .then(() => {
    costKatanaReady = true;
    console.log('CostKatana integration ready');
  })
  .catch((error) => {
    console.error('Failed to initialize CostKatana:', error);
    // Continue running without CostKatana if initialization fails
  });

// ... existing middleware setup ...

// Example: Track AI model usage in your endpoints
app.post('/api/ai/generate', async (req, res) => {
  try {
    // Your existing AI generation logic
    const { prompt, model } = req.body;
    
    // ... AI generation code ...
    
    // Track the usage with CostKatana
    if (costKatanaReady) {
      await trackUsage({
        model: model || 'amazon.nova-lite-v1:0',
        inputTokens: prompt.length, // Replace with actual token count
        outputTokens: 150, // Replace with actual output tokens
        metadata: {
          userId: req.user?.id,
          endpoint: '/api/ai/generate',
          requestId: req.id
        }
      });

      // Send telemetry data
      await sendTelemetry({
        event: 'ai_generation',
        model,
        userId: req.user?.id,
        success: true
      });
    }
    
    res.json({ success: true, /* ... response data ... */ });
  } catch (error) {
    console.error('Error in AI generation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cost reporting endpoint
app.get('/api/costs/report', async (req, res) => {
  try {
    if (!costKatanaReady) {
      return res.status(503).json({ error: 'Cost tracking not available' });
    }

    const { startDate, endDate, groupBy } = req.query;
    
    const report = await getCostReport({
      startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate as string) : new Date(),
      groupBy: (groupBy as string) || 'model'
    });
    
    res.json(report);
  } catch (error) {
    console.error('Error getting cost report:', error);
    res.status(500).json({ error: 'Failed to generate cost report' });
  }
});

// Health check endpoint with CostKatana status
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    costKatana: costKatanaReady ? 'active' : 'inactive',
    timestamp: new Date().toISOString()
  });
});

// ... rest of your existing routes ...

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Shutdown CostKatana
  await shutdownCostKatana();
  
  // ... existing shutdown logic ...
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});