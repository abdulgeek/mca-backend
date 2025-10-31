# CostKatana Integration Setup Guide

## Prerequisites
- Node.js and npm installed
- Access to CostKatana API credentials

## Installation

1. Install the CostKatana package:
   ```
   npm install cost-katana
   ```

2. Create a `.env` file in the root of your project and add the following variables:
   ```
   COSTKATANA_API_KEY=dak_your_key_here
   COSTKATANA_DEFAULT_MODEL=amazon.nova-lite-v1:0
   ```

3. Update your `src/costkatana.js` file with the provided configuration.

4. Integrate CostKatana features into your application as shown in the updated `dist/server.js` file.

## Usage

### Cost Tracking
Use the `trackCost` function to log costs for specific operations:
```javascript
await trackCost('operation-name', { details: 'Operation details' });
```

### Cortex Optimization
Use the `optimizeCortex` function to optimize your AI model usage:
```javascript
const result = await optimizeCortex({ /* optimization parameters */ });
```

### Budget Management
Use the `manageBudget` function to handle budget-related operations:
```javascript
const budget = await manageBudget({ /* budget parameters */ });
```

## Testing

1. Start your server:
   ```
   npm start
   ```

2. Use the provided endpoints to test each feature:
   - `/track-cost`
   - `/optimize-cortex`
   - `/manage-budget`

3. Check your server logs for confirmation of successful operations or any error messages.

## Troubleshooting

- Ensure your `.env` file contains the correct API key and model name.
- Check the CostKatana documentation for any updates or changes to the API.
- If you encounter any issues, review the error logs and consult the CostKatana support resources.

## Additional Resources

- [CostKatana Official Documentation](https://docs.costkatana.com)
- [API Reference](https://api.costkatana.com)
- [Support Forum](https://support.costkatana.com)