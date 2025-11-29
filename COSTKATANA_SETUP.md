# CostKatana Integration Setup Guide

## Overview
CostKatana has been integrated into your TypeScript Express backend to provide comprehensive cost tracking and monitoring for AI/LLM API calls.

## Installation

1. **Install the required packages:**
bash
npm install cost-katana
npm install --save-dev @types/node


2. **Configure environment variables:**
Copy `.env.example` to `.env` and update with your values:
bash
cp .env.example .env


3. **Get your API key:**
- Sign up at [CostKatana](https://costkatana.com)
- Navigate to your dashboard
- Generate an API key
- Add it to your `.env` file

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `COSTKATANA_API_KEY` | Your CostKatana API key | - | Yes |
| `COSTKATANA_DEFAULT_MODEL` | Default model for cost calculations | `amazon.nova-lite-v1:0` | No |
| `COSTKATANA_AUTO_TRACK` | Enable automatic tracking via middleware | `false` | No |
| `COSTKATANA_DEBUG` | Enable debug logging | `false` | No |
| `COSTKATANA_MAX_COST_PER_REQUEST` | Maximum cost per request (USD) | `1.0` | No |
| `COSTKATANA_ALERT_THRESHOLD` | Alert threshold for total spending (USD) | `10.0` | No |

## Usage

### Basic Cost Tracking

typescript
import costKatanaService from './costkatana';

// In your AI endpoint
app.post('/api/generate', async (req, res) => {
  try {
    // Your AI call
    const result = await aiService.generate(req.body);
    
    // Track the cost
    await costKatanaService.trackCost(
      'gpt-4',           // model name
      1500,              // input tokens
      500,               // output tokens
      req.id             // optional request ID
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


### Automatic Tracking with Middleware

1. **Enable in environment:**
env
COSTKATANA_AUTO_TRACK=true


2. **Add middleware in index.ts:**
typescript
app.use(costKatanaService.middleware());


3. **Format your API responses:**
typescript
// Include usage data in your responses
res.json({
  result: "Generated content",
  usage: {
    model: "gpt-4",
    inputTokens: 1500,
    outputTokens: 500
  }
});


### Cost Analytics

typescript
// Get analytics for the last 7 days
const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const endDate = new Date();

const analytics = await costKatanaService.getAnalytics(startDate, endDate);
console.log('Total cost:', analytics.totalCost);
console.log('Average cost per request:', analytics.averageCostPerRequest);


### Add Analytics Endpoint

typescript
app.get('/api/costs/analytics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const analytics = await costKatanaService.getAnalytics(
      new Date(startDate as string),
      new Date(endDate as string)
    );
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


## TypeScript Types

The integration includes full TypeScript support with the following types:

typescript
import { CostKatanaConfig, CostResult, CostAnalytics } from './costkatana';

// Use typed configuration
const config: CostKatanaConfig = {
  apiKey: process.env.COSTKATANA_API_KEY!,
  defaultModel: 'gpt-4',
  autoTrack: true
};

// Typed cost result
const cost: CostResult = await costKatanaService.trackCost(...);

// Typed analytics
const analytics: CostAnalytics = await costKatanaService.getAnalytics(...);


## Testing

### Manual Testing

1. **Test initialization:**
bash
npm start
# Look for: "✅ CostKatana initialized successfully"


2. **Test cost tracking:**
bash
curl -X POST http://localhost:3000/api/test-cost \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "inputTokens": 100, "outputTokens": 50}'


3. **Test analytics:**
bash
curl http://localhost:3000/api/costs/analytics


### Unit Testing

typescript
import { CostKatanaService } from './costkatana';

describe('CostKatana Integration', () => {
  let service: CostKatanaService;
  
  beforeEach(() => {
    service = new CostKatanaService();
  });
  
  test('should initialize successfully', async () => {
    await service.initialize();
    expect(service.isInitialized()).toBe(true);
  });
  
  test('should track costs', async () => {
    await service.initialize();
    const cost = await service.trackCost('gpt-4', 100, 50);
    expect(cost.totalCost).toBeGreaterThan(0);
  });
});


## Monitoring & Alerts

### Cost Alerts
The system will automatically log warnings when:
- A single request exceeds `COSTKATANA_MAX_COST_PER_REQUEST`
- Total spending exceeds `COSTKATANA_ALERT_THRESHOLD`

### Debug Mode
Enable debug mode for detailed logging:
env
COSTKATANA_DEBUG=true


## Best Practices

1. **Always track costs** for production AI calls
2. **Set appropriate thresholds** based on your budget
3. **Monitor analytics regularly** to identify cost trends
4. **Use request IDs** for better tracking and debugging
5. **Implement cost limits** in critical endpoints
6. **Cache responses** when possible to reduce API calls

## Troubleshooting

### CostKatana not initializing
- Check API key is valid
- Ensure environment variables are loaded
- Check network connectivity

### Costs not being tracked
- Verify `initialized` status
- Check token counts are being passed
- Enable debug mode for detailed logs

### Middleware not working
- Ensure `COSTKATANA_AUTO_TRACK=true`
- Verify middleware is added after initialization
- Check response format includes usage data

## Support

- Documentation: [https://costkatana.com/docs](https://costkatana.com/docs)
- Support: support@costkatana.com
- GitHub Issues: [https://github.com/costkatana/cost-katana-js](https://github.com/costkatana/cost-katana-js)

## License

This integration follows your project's existing license.