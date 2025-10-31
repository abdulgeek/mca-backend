import express from 'express';
import { trackCost, optimizeCortex, manageBudget } from '../src/costkatana.js';

const app = express();

// Example usage of CostKatana features
app.get('/track-cost', async (req, res) => {
  await trackCost('example-operation', { details: 'Some operation details' });
  res.send('Cost tracked');
});

app.get('/optimize-cortex', async (req, res) => {
  const result = await optimizeCortex({ /* optimization parameters */ });
  res.json(result);
});

app.get('/manage-budget', async (req, res) => {
  const budget = await manageBudget({ /* budget parameters */ });
  res.json(budget);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));