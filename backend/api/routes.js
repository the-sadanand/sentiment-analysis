// ...existing code...
const express = require('express');
const logger = require('../config/logger');

const router = express.Router();

// Small in-process sentiment scorer (no external dependency)
const POSITIVE_WORDS = new Set(['good','great','happy','excellent','awesome','love','nice','positive','fantastic','best']);
const NEGATIVE_WORDS = new Set(['bad','sad','terrible','hate','awful','worst','poor','negative','angry','problem']);

function analyzeText(text) {
  if (!text || typeof text !== 'string') return { score: 0, comparative: 0, tokens: [], words: [], positive: [], negative: [] };

  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  let score = 0;
  const positive = [];
  const negative = [];

  tokens.forEach((t) => {
    if (POSITIVE_WORDS.has(t)) {
      score += 1;
      positive.push(t);
    } else if (NEGATIVE_WORDS.has(t)) {
      score -= 1;
      negative.push(t);
    }
  });

  const comparative = tokens.length ? score / tokens.length : 0;
  return { score, comparative, tokens, words: tokens, positive, negative };
}

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

// Basic sentiment analysis endpoint
router.post('/analyze', express.json(), (req, res) => {
  try {
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Field "text" is required and must be a non-empty string.' });
    }
    const result = analyzeText(text);
    logger.info('Analyzed text', { length: text.length, score: result.score });
    return res.json({ text, result });
  } catch (err) {
    logger.error('Error in /analyze', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Example route to list available routes
router.get('/', (req, res) => {
  res.json({
    routes: [
      { method: 'GET', path: '/api/health' },
      { method: 'POST', path: '/api/analyze', body: { text: 'string' } }
    ]
  });
});

// 404 for unknown API routes
router.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

module.exports = router;
// ...existing code...