require('dotenv').config();
const redis = require('redis');
const winston = require('winston');

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
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level}]: ${message}`;
        })
      )
    })
  ]
});

class DataIngester {
  constructor(redisClient, streamName, postsPerMinute = 60) {
    this.redisClient = redisClient;
    this.streamName = streamName;
    this.postsPerMinute = postsPerMinute;
    this.postIdCounter = 0;
    
    // Post templates
    this.positiveTemplates = [
      "I absolutely love {product}! Best purchase ever!",
      "This is amazing! {product} exceeded all my expectations!",
      "{product} is fantastic! Highly recommend to everyone!",
      "Just got {product} and I'm blown away by the quality!",
      "So happy with {product}! This is exactly what I needed!",
      "Can't stop using {product}! It's become essential in my life!",
      "{product} is a game changer! Everything works perfectly!",
      "Loving every moment with {product}! Worth every penny!",
      "Best decision ever getting {product}! Five stars!",
      "{product} has made my life so much easier! Incredible!"
    ];
    
    this.negativeTemplates = [
      "Very disappointed with {product}. Not worth the money.",
      "Terrible experience with {product}. Would not recommend.",
      "{product} is a complete waste of money. Save yourself the trouble.",
      "Regret buying {product}. Quality is terrible.",
      "Extremely unhappy with {product}. Nothing works as advertised.",
      "{product} broke after just one week. Avoid at all costs!",
      "Worst purchase ever. {product} is a complete disaster.",
      "{product} failed to meet even basic expectations. Disappointing.",
      "Don't buy {product}! Customer service is awful and product is worse.",
      "Frustrated with {product}. So many problems and no solutions."
    ];
    
    this.neutralTemplates = [
      "Just received {product} today. Will update after testing.",
      "Using {product} for the first time. So far it's okay.",
      "Got {product} as recommended. It's decent.",
      "Trying out {product}. Not sure yet how I feel about it.",
      "{product} arrived on time. Packaging was good.",
      "Testing {product} now. Initial impressions are neutral.",
      "Ordered {product} last week. It's what I expected.",
      "Using {product} daily. It does the job.",
      "{product} is functional. Nothing special but works.",
      "Had {product} for a month now. It's adequate for my needs."
    ];
    
    this.products = [
      "iPhone 16 Pro", "Tesla Model 3", "ChatGPT Plus", "Netflix Premium",
      "Amazon Prime", "PlayStation 5", "MacBook Pro M3", "Samsung Galaxy S24",
      "AirPods Pro", "Spotify Premium", "Microsoft Surface", "Nintendo Switch",
      "Google Pixel 8", "iPad Air", "Xbox Series X", "Disney Plus",
      "Kindle Oasis", "Apple Watch Series 9", "Sony WH-1000XM5", "Ring Doorbell"
    ];
    
    this.sources = ["reddit", "twitter", "facebook", "instagram"];
    this.firstNames = ["Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Jamie", "Quinn"];
    this.lastNames = ["Smith", "Johnson", "Brown", "Davis", "Wilson", "Moore", "Taylor", "Anderson"];
  }

  generatePost() {
    const sentiment = Math.random();
    let template, sentimentType;
    
    if (sentiment < 0.4) {
      // 40% positive
      template = this.positiveTemplates[Math.floor(Math.random() * this.positiveTemplates.length)];
      sentimentType = 'positive';
    } else if (sentiment < 0.7) {
      // 30% neutral
      template = this.neutralTemplates[Math.floor(Math.random() * this.neutralTemplates.length)];
      sentimentType = 'neutral';
    } else {
      // 30% negative
      template = this.negativeTemplates[Math.floor(Math.random() * this.negativeTemplates.length)];
      sentimentType = 'negative';
    }
    
    const product = this.products[Math.floor(Math.random() * this.products.length)];
    const content = template.replace('{product}', product);
    
    const firstName = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
    const lastName = this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
    const author = `${firstName}${lastName}${Math.floor(Math.random() * 1000)}`;
    
    this.postIdCounter++;
    
    return {
      post_id: `post_${Date.now()}_${this.postIdCounter}`,
      source: this.sources[Math.floor(Math.random() * this.sources.length)],
      content: content,
      author: author,
      created_at: new Date().toISOString(),
      _sentiment: sentimentType // For logging only, not sent to stream
    };
  }

  async publishPost(postData) {
    try {
      const { _sentiment, ...streamData } = postData;
      
      await this.redisClient.xAdd(
        this.streamName,
        '*',
        streamData
      );
      
      logger.info(`Published ${_sentiment} post: ${postData.post_id}`);
      return true;
    } catch (error) {
      logger.error('Failed to publish post:', error);
      return false;
    }
  }

  async start(durationSeconds = null) {
    logger.info(`Starting ingester: ${this.postsPerMinute} posts/minute`);
    
    const intervalMs = (60 * 1000) / this.postsPerMinute;
    const startTime = Date.now();
    let postCount = 0;

    const publishInterval = setInterval(async () => {
      try {
        const post = this.generatePost();
        const success = await this.publishPost(post);
        
        if (success) {
          postCount++;
        }

        // Check duration limit
        if (durationSeconds && (Date.now() - startTime) / 1000 >= durationSeconds) {
          clearInterval(publishInterval);
          logger.info(`Ingester stopped after ${durationSeconds}s. Total posts: ${postCount}`);
        }
      } catch (error) {
        logger.error('Error in publish loop:', error);
      }
    }, intervalMs);

    // Log stats every minute
    setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = postCount / (elapsed / 60);
      logger.info(`Stats: Posts=${postCount}, Rate=${rate.toFixed(1)}/min`);
    }, 60000);

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      clearInterval(publishInterval);
      logger.info('Ingester stopped gracefully');
    });

    process.on('SIGINT', () => {
      clearInterval(publishInterval);
      logger.info('Ingester stopped gracefully');
    });
  }
}

// Main
async function main() {
  const redisClient = redis.createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  await redisClient.connect();
  logger.info('Connected to Redis');

  const ingester = new DataIngester(
    redisClient,
    process.env.REDIS_STREAM_NAME,
    parseInt(process.env.POSTS_PER_MINUTE) || 60
  );

  await ingester.start();
}

main().catch((error) => {
  logger.error('Ingester failed:', error);
  process.exit(1);
});