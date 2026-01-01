const WebSocket = require('ws');
const database = require('../models/database');
const logger = require('../config/logger');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.metricsInterval = null;
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws/sentiment'
    });

    this.wss.on('connection', (ws) => {
      logger.info('New WebSocket client connected');
      this.clients.add(ws);

      // Send connection confirmation
      this.sendToClient(ws, {
        type: 'connected',
        message: 'Connected to sentiment stream',
        timestamp: new Date().toISOString()
      });

      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    // Start periodic metrics updates
    this.startMetricsUpdates();

    logger.info('WebSocket service initialized');
  }

  sendToClient(client, data) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (error) {
        logger.error('Error sending to client:', error);
      }
    }
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          sentCount++;
        } catch (error) {
          logger.error('Error broadcasting to client:', error);
        }
      }
    });

    logger.debug(`Broadcast to ${sentCount} clients`);
  }

  async broadcastNewPost(postData) {
    try {
      this.broadcast({
        type: 'new_post',
        data: {
          post_id: postData.post_id,
          content: postData.content.substring(0, 100) + (postData.content.length > 100 ? '...' : ''),
          source: postData.source,
          sentiment_label: postData.sentiment_label,
          confidence_score: postData.confidence_score,
          emotion: postData.emotion,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error broadcasting new post:', error);
    }
  }

  startMetricsUpdates() {
    this.metricsInterval = setInterval(async () => {
      try {
        if (this.clients.size === 0) return;

        const metrics = await this.calculateMetrics();
        this.broadcast({
          type: 'metrics_update',
          data: metrics,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error sending metrics update:', error);
      }
    }, 30000); // Every 30 seconds
  }

  async calculateMetrics() {
    try {
      // Last minute
      const lastMinuteQuery = `
        SELECT sentiment_label, COUNT(*) as count
        FROM sentiment_analysis
        WHERE analyzed_at >= NOW() - INTERVAL '1 minute'
        GROUP BY sentiment_label
      `;
      const lastMinuteResult = await database.query(lastMinuteQuery);
      const lastMinute = this.formatMetrics(lastMinuteResult.rows);

      // Last hour
      const lastHourQuery = `
        SELECT sentiment_label, COUNT(*) as count
        FROM sentiment_analysis
        WHERE analyzed_at >= NOW() - INTERVAL '1 hour'
        GROUP BY sentiment_label
      `;
      const lastHourResult = await database.query(lastHourQuery);
      const lastHour = this.formatMetrics(lastHourResult.rows);

      // Last 24 hours
      const last24HoursQuery = `
        SELECT sentiment_label, COUNT(*) as count
        FROM sentiment_analysis
        WHERE analyzed_at >= NOW() - INTERVAL '24 hours'
        GROUP BY sentiment_label
      `;
      const last24HoursResult = await database.query(last24HoursQuery);
      const last24Hours = this.formatMetrics(last24HoursResult.rows);

      return {
        last_minute: lastMinute,
        last_hour: lastHour,
        last_24_hours: last24Hours
      };
    } catch (error) {
      logger.error('Error calculating metrics:', error);
      throw error;
    }
  }

  formatMetrics(rows) {
    const metrics = { positive: 0, negative: 0, neutral: 0, total: 0 };
    rows.forEach(row => {
      const count = parseInt(row.count);
      metrics[row.sentiment_label] = count;
      metrics.total += count;
    });
    return metrics;
  }

  close() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.wss) {
      this.wss.close();
      logger.info('WebSocket service closed');
    }
  }
}

module.exports = new WebSocketService();