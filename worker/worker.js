require('dotenv').config();
const { Pool } = require('pg');
const redis = require('redis');
const { spawn } = require('child_process');
const winston = require('winston');
const axios = require('axios');

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
          }
          return msg;
        })
      )
    })
  ]
});

class SentimentWorker {
  constructor() {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10
    });

    this.redisClient = null;
    this.streamName = process.env.REDIS_STREAM_NAME;
    this.consumerGroup = process.env.REDIS_CONSUMER_GROUP;
    this.consumerName = `worker_${process.pid}`;
    this.pythonProcess = null;
    this.processedCount = 0;
    this.errorCount = 0;
  }

  async initialize() {
    try {
      // Connect to Redis
      this.redisClient = redis.createClient({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
      });

      this.redisClient.on('error', (err) => {
        logger.error('Redis client error:', err);
      });

      await this.redisClient.connect();
      logger.info('Connected to Redis');

      // Create consumer group (ignore error if already exists)
      try {
        await this.redisClient.xGroupCreate(this.streamName, this.consumerGroup, '0', {
          MKSTREAM: true
        });
        logger.info(`Consumer group ${this.consumerGroup} created`);
      } catch (error) {
        if (error.message.includes('BUSYGROUP')) {
          logger.info(`Consumer group ${this.consumerGroup} already exists`);
        } else {
          throw error;
        }
      }

      // Start Python sentiment analyzer process
      this.startPythonProcess();

      logger.info('Worker initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize worker:', error);
      throw error;
    }
  }

  startPythonProcess() {
    this.pythonProcess = spawn('python3', ['sentiment_analyzer.py'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.pythonProcess.stderr.on('data', (data) => {
      logger.warn('Python stderr:', data.toString());
    });

    this.pythonProcess.on('error', (error) => {
      logger.error('Python process error:', error);
    });

    this.pythonProcess.on('close', (code) => {
      logger.error(`Python process exited with code ${code}`);
      // Restart after 5 seconds
      setTimeout(() => this.startPythonProcess(), 5000);
    });

    logger.info('Python sentiment analyzer started');
  }

  async analyzeWithPython(text) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Python analysis timeout'));
      }, 30000);

      const listener = (data) => {
        clearTimeout(timeout);
        try {
          const result = JSON.parse(data.toString());
          this.pythonProcess.stdout.removeListener('data', listener);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      this.pythonProcess.stdout.once('data', listener);
      this.pythonProcess.stdin.write(JSON.stringify({ text }) + '\n');
    });
  }

  async analyzeWithExternalLLM(text) {
    try {
      const provider = process.env.EXTERNAL_LLM_PROVIDER;
      const apiKey = process.env.EXTERNAL_LLM_API_KEY;
      const model = process.env.EXTERNAL_LLM_MODEL;

      if (provider === 'groq') {
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are a sentiment analysis AI. Respond ONLY with valid JSON in this exact format: {"sentiment": "positive|negative|neutral", "confidence": 0.0-1.0, "emotion": "joy|sadness|anger|fear|surprise|neutral"}. No other text.'
              },
              {
                role: 'user',
                content: `Analyze the sentiment and emotion of this text: "${text}"`
              }
            ],
            temperature: 0.2
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        const content = response.data.choices[0].message.content;
        const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));

        return {
          sentiment: {
            sentiment_label: parsed.sentiment,
            confidence_score: parsed.confidence,
            model_name: model
          },
          emotion: {
            emotion: parsed.emotion,
            confidence_score: parsed.confidence,
            model_name: model
          }
        };
      }

      throw new Error('Unsupported LLM provider');
    } catch (error) {
      logger.error('External LLM analysis failed:', error);
      throw error;
    }
  }

  async processMessage(messageId, messageData) {
    try {
      logger.debug('Processing message:', messageId);

      // Validate message data
      if (!messageData.post_id || !messageData.content) {
        logger.warn('Invalid message data, acknowledging to skip');
        await this.redisClient.xAck(this.streamName, this.consumerGroup, messageId);
        return false;
      }

      // Analyze sentiment (try local first, fallback to external)
      let analysis;
      try {
        analysis = await this.analyzeWithPython(messageData.content);
      } catch (error) {
        logger.warn('Python analysis failed, trying external LLM');
        analysis = await this.analyzeWithExternalLLM(messageData.content);
      }

      // Save to database
      const client = await this.dbPool.connect();
      try {
        await client.query('BEGIN');

        // Insert or update post
        await client.query(
          `INSERT INTO social_media_posts (post_id, source, content, author, created_at, ingested_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (post_id) DO UPDATE SET ingested_at = NOW()`,
          [
            messageData.post_id,
            messageData.source,
            messageData.content,
            messageData.author,
            messageData.created_at
          ]
        );

        // Insert sentiment analysis
        await client.query(
          `INSERT INTO sentiment_analysis (post_id, model_name, sentiment_label, confidence_score, emotion)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            messageData.post_id,
            analysis.sentiment.model_name,
            analysis.sentiment.sentiment_label,
            analysis.sentiment.confidence_score,
            analysis.emotion.emotion
          ]
        );

        await client.query('COMMIT');

        // Acknowledge message
        await this.redisClient.xAck(this.streamName, this.consumerGroup, messageId);

        this.processedCount++;
        logger.info(`Processed message ${messageId} (total: ${this.processedCount})`);

        return true;
      } catch (dbError) {
        await client.query('ROLLBACK');
        logger.error('Database error, message not acknowledged:', dbError);
        throw dbError;
      } finally {
        client.release();
      }
    } catch (error) {
      this.errorCount++;
      logger.error('Failed to process message:', error);
      return false;
    }
  }

  async run() {
    logger.info('Starting worker loop');

    while (true) {
      try {
        // Read messages from stream
        const messages = await this.redisClient.xReadGroup(
          this.consumerGroup,
          this.consumerName,
          [{ key: this.streamName, id: '>' }],
          {
            COUNT: 10,
            BLOCK: 5000
          }
        );

        if (messages && messages.length > 0) {
          const streamMessages = messages[0].messages;

          // Process messages concurrently
          const promises = streamMessages.map(msg =>
            this.processMessage(msg.id, msg.message)
          );

          await Promise.all(promises);
        }

        // Log stats every 100 messages
        if (this.processedCount % 100 === 0 && this.processedCount > 0) {
          logger.info(`Stats: Processed=${this.processedCount}, Errors=${this.errorCount}`);
        }
      } catch (error) {
        logger.error('Error in worker loop:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Backoff
      }
    }
  }

  async close() {
    logger.info('Shutting down worker...');

    if (this.pythonProcess) {
      this.pythonProcess.kill();
    }

    if (this.redisClient) {
      await this.redisClient.quit();
    }

    await this.dbPool.end();

    logger.info('Worker shutdown complete');
  }
}

// Start worker
async function main() {
  const worker = new SentimentWorker();

  process.on('SIGTERM', async () => {
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await worker.close();
    process.exit(0);
  });

  await worker.initialize();
  await worker.run();
}

main().catch((error) => {
  logger.error('Worker failed:', error);
  process.exit(1);
});