const database = require('../models/database');
const logger = require('../config/logger');

class AlertService {
  constructor() {
    this.threshold = parseFloat(process.env.ALERT_NEGATIVE_RATIO_THRESHOLD) || 2.0;
    this.windowMinutes = parseInt(process.env.ALERT_WINDOW_MINUTES) || 5;
    this.minPosts = parseInt(process.env.ALERT_MIN_POSTS) || 10;
    this.checkInterval = null;
  }

  async checkThresholds() {
    try {
      const windowStart = new Date(Date.now() - this.windowMinutes * 60 * 1000);
      const windowEnd = new Date();

      const query = `
        SELECT 
          sentiment_label,
          COUNT(*) as count
        FROM sentiment_analysis
        WHERE analyzed_at >= $1 AND analyzed_at <= $2
        GROUP BY sentiment_label
      `;

      const result = await database.query(query, [windowStart, windowEnd]);

      const metrics = {
        positive_count: 0,
        negative_count: 0,
        neutral_count: 0,
        total_count: 0
      };

      result.rows.forEach(row => {
        const count = parseInt(row.count);
        metrics[`${row.sentiment_label}_count`] = count;
        metrics.total_count += count;
      });

      // Check if we have enough data
      if (metrics.total_count < this.minPosts) {
        return null;
      }

      // Calculate ratio (avoid division by zero)
      const ratio = metrics.positive_count > 0 
        ? metrics.negative_count / metrics.positive_count 
        : metrics.negative_count;

      // Check if threshold exceeded
      if (ratio > this.threshold) {
        return {
          alert_triggered: true,
          alert_type: 'high_negative_ratio',
          threshold: this.threshold,
          actual_ratio: parseFloat(ratio.toFixed(2)),
          window_minutes: this.windowMinutes,
          metrics,
          timestamp: new Date().toISOString(),
          window_start: windowStart.toISOString(),
          window_end: windowEnd.toISOString()
        };
      }

      return null;
    } catch (error) {
      logger.error('Error checking thresholds:', error);
      throw error;
    }
  }

  async saveAlert(alertData) {
    try {
      const query = `
        INSERT INTO sentiment_alerts (
          alert_type, threshold_value, actual_value, 
          window_start, window_end, post_count, details
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;

      const details = {
        positive_count: alertData.metrics.positive_count,
        negative_count: alertData.metrics.negative_count,
        neutral_count: alertData.metrics.neutral_count
      };

      const result = await database.query(query, [
        alertData.alert_type,
        alertData.threshold,
        alertData.actual_ratio,
        alertData.window_start,
        alertData.window_end,
        alertData.metrics.total_count,
        JSON.stringify(details)
      ]);

      logger.info(`Alert saved with ID: ${result.rows[0].id}`);
      return result.rows[0].id;
    } catch (error) {
      logger.error('Error saving alert:', error);
      throw error;
    }
  }

  async runMonitoringLoop(checkIntervalSeconds = 60) {
    logger.info(`Starting alert monitoring loop (checking every ${checkIntervalSeconds}s)`);

    this.checkInterval = setInterval(async () => {
      try {
        const alertData = await this.checkThresholds();
        
        if (alertData) {
          logger.warn('ALERT TRIGGERED:', alertData);
          await this.saveAlert(alertData);
        }
      } catch (error) {
        logger.error('Error in monitoring loop:', error);
      }
    }, checkIntervalSeconds * 1000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      logger.info('Alert monitoring stopped');
    }
  }
}

module.exports = new AlertService();