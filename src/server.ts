// Existing imports
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import CostKatana integration
const {
  initializeCostKatana,
  costTrackingMiddleware,
  trackOperation,
  getCostSummary,
  shutdown: shutdownCostKatana
} = require('./costkatana');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize CostKatana
try {
  initializeCostKatana();
  console.log('✅ CostKatana initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize CostKatana:', error);
  // Continue running the app even if CostKatana fails
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Apply CostKatana tracking middleware
app.use(costTrackingMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// CostKatana endpoints
app.get('/api/costs/summary', async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;
    const summary = await getCostSummary({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      groupBy: groupBy as string
    });
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Failed to get cost summary:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve cost summary' });
  }
});

// Example AI endpoint with cost tracking
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    
    // Track the operation start
    const operationId = `op_${Date.now()}`;
    
    // Your AI generation logic here
    // const result = await yourAIService.generate(prompt, model);
    
    // Track the cost of this operation
    await trackOperation('ai_generation', {
      operationId,
      model: model || 'default',
      prompt: prompt?.substring(0, 100), // Log first 100 chars
      userId: (req as any).user?.id || 'anonymous'
    });
    
    // Mock response for example
    const result = {
      text: 'Generated response',
      model: model || 'amazon.nova-lite-v1:0',
      tokens: 150
    };
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('AI generation failed:', error);
    res.status(500).json({ success: false, error: 'Generation failed' });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 CostKatana cost tracking enabled`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    await shutdownCostKatana();
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(async () => {
    await shutdownCostKatana();
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;