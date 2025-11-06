# CostKatana Integration Setup Guide

## Overview

CostKatana has been integrated into your Express application to provide:
- **Cost Tracking**: Monitor AI operation costs in real-time
- **Cortex Optimization**: Automatically optimize AI requests for cost efficiency

## Installation

1. Install the CostKatana package:
bash
npm install cost-katana


2. Copy environment variables:
bash
cp .env.example .env


3. Configure your CostKatana API key in `.env`:
env
COSTKATANA_API_KEY=your_actual_api_key_here


## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `COSTKATANA_API_KEY` | Your CostKatana API key | - | Yes |
| `COSTKATANA_DEFAULT_MODEL` | Default AI model for calculations | `amazon.nova-lite-v1:0` | No |
| `COSTKATANA_ENABLE_TRACKING` | Enable/disable cost tracking | `true` | No |
| `COSTKATANA_ENABLE_OPTIMIZATION` | Enable/disable Cortex optimization | `true` | No |
| `COSTKATANA_MAX_COST_PER_REQUEST` | Maximum cost per request (USD) | `1.0` | No |
| `COSTKATANA_OPTIMIZATION_LEVEL` | Optimization aggressiveness | `balanced` | No |
| `COSTKATANA_LOG_LEVEL` | Logging verbosity | `info` | No |

### Optimization Levels

- **aggressive**: Maximum cost reduction, may impact quality
- **balanced**: Optimal balance between cost and quality (recommended)
- **quality**: Prioritize quality with moderate cost optimization

## Usage Examples

### 1. Cost Tracking

Track costs for any AI operation:

javascript
const { trackCost } = require('./costkatana');

// Track a chat completion
await trackCost('chat-completion', {
  model: 'gpt-4',
  tokens: 1500,
  cost: 0.045,
  userId: 'user123',
  endpoint: '/api/chat'
});

// Track an embedding operation
await trackCost('embedding-generation', {
  model: 'text-embedding-ada-002',
  tokens: 8000,
  cost: 0.0004,
  batchSize: 100
});


### 2. Cortex Optimization

Optimize AI requests automatically:

javascript
const { optimizeRequest } = require('./costkatana');

// Original expensive request
const originalParams = {
  model: 'gpt-4',
  temperature: 0.9,
  max_tokens: 4000,
  messages: [...]
};

// Get optimized parameters
const optimizedParams = await optimizeRequest(originalParams);
// May return: { model: 'gpt-3.5-turbo', temperature: 0.7, max_tokens: 2000, ... }

// Use optimized parameters with your AI service
const response = await openai.chat.completions.create(optimizedParams);


### 3. Automatic Middleware Tracking

The middleware automatically tracks costs for AI endpoints:

javascript
// Any route containing '/ai' or '/llm' is automatically tracked
app.post('/api/ai/summarize', async (req, res) => {
  // Your AI logic here
  // Costs are tracked automatically!
});


### 4. Cost Reports

Generate cost reports via the API:

bash
# Get last 7 days report
curl http://localhost:3000/api/costs/report

# Get specific date range
curl "http://localhost:3000/api/costs/report?startDate=2024-01-01&endDate=2024-01-31"


Or programmatically:

javascript
const { getCostReport } = require('./costkatana');

const report = await getCostReport(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

console.log('Total costs:', report.total);
console.log('By operation:', report.operations);


## API Endpoints

### Health Check

GET /health/costkatana

Returns CostKatana service status.

### Cost Report

GET /api/costs/report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD

Returns detailed cost report for the specified period.

## Best Practices

1. **Always track costs** for AI operations to maintain visibility
2. **Use optimization** for non-critical requests to reduce costs
3. **Set appropriate limits** via `COSTKATANA_MAX_COST_PER_REQUEST`
4. **Monitor reports** regularly to identify cost trends
5. **Use debug logging** in development to understand optimizations

## Troubleshooting

### CostKatana not initializing
- Verify your API key is correct
- Check network connectivity
- Review console logs for error messages

### Costs not being tracked
- Ensure `COSTKATANA_ENABLE_TRACKING=true`
- Verify the middleware is properly configured
- Check that your endpoints match tracking patterns

### Optimization not working
- Ensure `COSTKATANA_ENABLE_OPTIMIZATION=true`
- Verify you're awaiting the `optimizeRequest` function
- Check optimization level settings

## Development Mode

When running without an API key, CostKatana operates in mock mode:
- All functions return mock data
- Console logs show simulated tracking
- Useful for local development and testing

## Production Checklist

- [ ] Set production API key in environment
- [ ] Configure appropriate cost limits
- [ ] Set optimization level based on requirements
- [ ] Enable monitoring and alerting
- [ ] Review and adjust tracking patterns
- [ ] Test cost report generation
- [ ] Implement cost alerts if needed

## Support

- Documentation: https://costkatana.com/docs
- API Reference: https://costkatana.com/api
- Support: support@costkatana.com

## License

See LICENSE file in the project root.