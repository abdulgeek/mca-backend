// Import existing dependencies
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Import CostKatana
import costKatanaService, { costKatanaMiddleware, trackCost, sendTelemetry } from './costkatana.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add CostKatana middleware for automatic tracking
app.use(costKatanaMiddleware());

// Initialize CostKatana
async function initializeCostKatana() {
  try {
    await costKatanaService.initialize();
    console.log('CostKatana integration ready');
  } catch (error) {
    console.error('Failed to initialize CostKatana:', error);
    // Continue running the app even if CostKatana fails to initialize
  }
}

// Example route with cost tracking
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    
    // Your AI generation logic here
    // const response = await generateAIResponse(prompt);
    
    // Track the cost of this AI operation
    const tokensUsed = 150; // Example: get actual token count from your AI service
    await trackCost('ai_generation', tokensUsed, model);
    
    // Send telemetry about the operation
    await sendTelemetry('ai_request', {
      prompt_length: prompt?.length || 0,
      model: model || 'default',
      timestamp: new Date().toISOString(),
    });
    
    res.json({ 
      success: true, 
      message: 'AI response generated',
      // response: response 
    });
  } catch (error) {
    console.error('Error in AI generation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cost summary endpoint
app.get('/api/costs/summary', async (req, res) => {
  try {
    const { period = 'day' } = req.query;
    const summary = await costKatanaService.getCostSummary(period as string);
    
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error getting cost summary:', error);
    res.status(500).json({ error: 'Failed to get cost summary' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    costKatana: costKatanaService.isInitialized ? 'active' : 'inactive',
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  // Track errors in telemetry
  sendTelemetry('error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  
  res.status(500).json({ error: 'Internal server error' });
});

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
async function startServer() {
  try {
    // Initialize CostKatana first
    await initializeCostKatana();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 CostKatana status: ${costKatanaService.isInitialized ? 'Active' : 'Inactive'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
startServer();

export default app;