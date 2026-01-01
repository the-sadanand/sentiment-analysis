const request = require('supertest');
const express = require('express');
const routes = require('../api/routes');

// Mock dependencies
jest.mock('../models/database');
jest.mock('../services/redis');

const database = require('../models/database');
const redis = require('../services/redis');

describe('API Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return healthy status when all services are connected', async () => {
      database.healthCheck.mockResolvedValue(true);
      redis.healthCheck.mockResolvedValue(true);
      database.query
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '50' }] });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.services.database).toBe('connected');
      expect(response.body.services.redis).toBe('connected');
      expect(response.body.stats.total_posts).toBe(1000);
    });

    it('should return degraded status when one service is down', async () => {
      database.healthCheck.mockResolvedValue(true);
      redis.healthCheck.mockResolvedValue(false);
      database.query
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '50' }] });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
    });
  });

  describe('GET /api/posts', () => {
    it('should return posts with default pagination', async () => {
      const mockPosts = [
        {
          post_id: 'post_1',
          source: 'reddit',
          content: 'Great product!',
          author: 'user1',
          created_at: new Date(),
          sentiment_label: 'positive',
          confidence_score: 0.95,
          emotion: 'joy',
          model_name: 'distilbert'
        }
      ];

      database.query
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: mockPosts });

      const response = await request(app).get('/api/posts');

      expect(response.status).toBe(200);
      expect(response.body.posts).toHaveLength(1);
      expect(response.body.total).toBe(100);
      expect(response.body.limit).toBe(50);
      expect(response.body.offset).toBe(0);
    });

    it('should filter posts by source', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/posts')
        .query({ source: 'reddit' });

      expect(response.status).toBe(200);
      expect(response.body.filters.source).toBe('reddit');
    });

    it('should filter posts by sentiment', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ total: '30' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/posts')
        .query({ sentiment: 'positive' });

      expect(response.status).toBe(200);
      expect(response.body.filters.sentiment).toBe('positive');
    });
  });

  describe('GET /api/sentiment/aggregate', () => {
    it('should return aggregate data by hour', async () => {
      const mockData = [
        {
          timestamp: new Date('2025-01-01T10:00:00Z'),
          sentiment_label: 'positive',
          count: '45',
          avg_confidence: '0.87'
        },
        {
          timestamp: new Date('2025-01-01T10:00:00Z'),
          sentiment_label: 'negative',
          count: '12',
          avg_confidence: '0.82'
        }
      ];

      database.query.mockResolvedValue({ rows: mockData });

      const response = await request(app)
        .get('/api/sentiment/aggregate')
        .query({ period: 'hour' });

      expect(response.status).toBe(200);
      expect(response.body.period).toBe('hour');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid period', async () => {
      const response = await request(app)
        .get('/api/sentiment/aggregate')
        .query({ period: 'invalid' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/sentiment/distribution', () => {
    it('should return distribution data', async () => {
      const mockData = [
        { sentiment_label: 'positive', emotion: 'joy', count: '450' },
        { sentiment_label: 'negative', emotion: 'anger', count: '120' },
        { sentiment_label: 'neutral', emotion: 'neutral', count: '230' }
      ];

      redis.get.mockResolvedValue(null);
      database.query.mockResolvedValue({ rows: mockData });
      redis.setEx.mockResolvedValue('OK');

      const response = await request(app)
        .get('/api/sentiment/distribution')
        .query({ hours: 24 });

      expect(response.status).toBe(200);
      expect(response.body.distribution.positive).toBe(450);
      expect(response.body.distribution.negative).toBe(120);
      expect(response.body.distribution.neutral).toBe(230);
      expect(response.body.total).toBe(800);
    });

    it('should return cached data if available', async () => {
      const cachedData = JSON.stringify({
        distribution: { positive: 450, negative: 120, neutral: 230 },
        total: 800,
        cached: false
      });

      redis.get.mockResolvedValue(cachedData);

      const response = await request(app)
        .get('/api/sentiment/distribution')
        .query({ hours: 24 });

      expect(response.status).toBe(200);
      expect(response.body.cached).toBe(true);
      expect(database.query).not.toHaveBeenCalled();
    });
  });
});

// Integration test
describe('Integration: End-to-end flow', () => {
  it('should process post from ingestion to API retrieval', async () => {
    // This would be a real integration test with actual services
    // For now, we'll mock it to show the structure
    
    const testPost = {
      post_id: 'test_post_123',
      source: 'reddit',
      content: 'This is amazing!',
      author: 'testuser',
      created_at: new Date().toISOString()
    };

    // Mock database insertion
    database.query.mockResolvedValue({ rows: [], rowCount: 1 });

    // Simulate analysis
    const analysisResult = {
      sentiment_label: 'positive',
      confidence_score: 0.95,
      emotion: 'joy'
    };

    // Verify post can be retrieved
    database.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({
        rows: [{
          ...testPost,
          ...analysisResult,
          model_name: 'distilbert'
        }]
      });

    const app = express();
    app.use(express.json());
    app.use('/api', routes);

    const response = await request(app)
      .get('/api/posts')
      .query({ limit: 1 });

    expect(response.status).toBe(200);
    expect(response.body.posts).toBeDefined();
  });
});