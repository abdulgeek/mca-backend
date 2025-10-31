import express from 'express';
import { trackCost } from '../src/costkatana';

const app = express();

// ... existing code ...

app.post('/track-cost', async (req, res) => {
  try {
    const { modelName, tokens } = req.body;
    const cost = await trackCost(modelName, tokens);
    res.json({ cost });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track cost' });
  }
});

// ... rest of the server code ...