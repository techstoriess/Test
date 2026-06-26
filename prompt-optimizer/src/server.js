require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { optimizeWithClaude } = require('./providers/claude');
const { optimizeWithGemini } = require('./providers/gemini');
const { optimizeWithChatGPT } = require('./providers/chatgpt');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/optimize', async (req, res) => {
  const { idea } = req.body;
  if (!idea || !idea.trim()) {
    return res.status(400).json({ error: 'Idea is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (provider, data) => {
    res.write(`data: ${JSON.stringify({ provider, ...data })}\n\n`);
  };

  const providers = [
    { name: 'claude', fn: optimizeWithClaude, key: process.env.ANTHROPIC_API_KEY },
    { name: 'gemini', fn: optimizeWithGemini, key: process.env.GEMINI_API_KEY },
    { name: 'chatgpt', fn: optimizeWithChatGPT, key: process.env.OPENAI_API_KEY },
  ];

  await Promise.all(
    providers.map(async ({ name, fn, key }) => {
      if (!key || key.startsWith('your_')) {
        sendEvent(name, { status: 'error', message: `${name} API key not configured` });
        return;
      }
      try {
        sendEvent(name, { status: 'loading' });
        const result = await fn(idea.trim());
        sendEvent(name, { status: 'success', result });
      } catch (err) {
        sendEvent(name, { status: 'error', message: err.message });
      }
    })
  );

  res.write('data: {"done":true}\n\n');
  res.end();
});

app.listen(PORT, () => {
  console.log(`Prompt Optimizer running at http://localhost:${PORT}`);
});
