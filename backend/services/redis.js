const redis = require('redis');
const logger = require('../config/logger');

class RedisService {
  constructor() {
    this.client = null;
  }

  async connect() {
    try {
      this.client = redis.createClient({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis reconnection failed after 10 attempts');
              return new Error('Redis reconnection limit exceeded');
            }
            return retries * 1000;
          }
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      await this.client.connect();
      logger.info('Redis service initialized');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET error:', error);
      throw error;
    }
  }

  async set(key, value, expirySeconds = null) {
    try {
      if (expirySeconds) {
        return await this.client.setEx(key, expirySeconds, value);
      }
      return await this.client.set(key, value);
    } catch (error) {
      logger.error('Redis SET error:', error);
      throw error;
    }
  }

  async setEx(key, expirySeconds, value) {
    return await this.set(key, value, expirySeconds);
  }

  async publish(channel, message) {
    try {
      return await this.client.publish(channel, message);
    } catch (error) {
      logger.error('Redis PUBLISH error:', error);
      throw error;
    }
  }

  async close() {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis connection closed');
    }
  }
}

module.exports = new RedisService();