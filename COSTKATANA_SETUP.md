# CostKatana Setup Guide

This guide will help you set up and integrate CostKatana into your project for cost tracking.

## Prerequisites

- Node.js and npm installed
- Access to your project's environment variables

## Installation

1. Install the CostKatana package:
   ```
   npm install cost-katana
   ```

2. Create or update your `.env` file with the following variables:
   ```
   COSTKATANA_API_KEY=dak_your_key_here
   COSTKATANA_DEFAULT_MODEL=amazon.nova-lite-v1:0
   ```

3. Ensure the `src/costkatana.js` file is present in your project. This file initializes CostKatana and exports the necessary functions.

## Usage

To track costs in your application:

1. Import the `trackCost` function from `src/costkatana.js`:
   ```javascript
   import { trackCost } from '../src/costkatana';
   ```

2. Use the `trackCost` function to track costs for a specific model and token count:
   ```javascript
   try {
     const cost = await trackCost('model-name', tokenCount);
     console.log(`Cost: ${cost}`);
   } catch (error) {
     console.error('Error tracking cost:', error);
   }
   ```

3. The `trackCost` function returns the cost as a number, which you can use in your application as needed.

## Error Handling

The CostKatana integration includes error handling and logging. If there are any issues with initialization or cost tracking, errors will be logged using the project's logger.

## Testing

To test the CostKatana integration:

1. Ensure your `.env` file is properly configured with valid credentials.
2. Start your server and make a POST request to the `/track-cost` endpoint with a JSON body containing `modelName` and `tokens`.
3. Check the response and server logs to verify that costs are being tracked correctly.

If you encounter any issues, please check your API key, environment variables, and network connectivity.

## Support

For additional help or questions about CostKatana, please refer to the official documentation or contact their support team.