require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const database = require('./models/database');
const redis = require('./services/redis');
const alertService = require('./services/alerting');
const websocketService = require('./api/websocket');
const routes = require('./api/routes');
const logger = require('./config/logger');

const app = express();
const PORT = process.env.API_PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api', routes);

// Health check at root
app.get('/', (req, res) => {
  res.json({ 
    service: 'Sentiment Analysis API',
    status: 'running',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Initialize services
async function initializeServices() {
  try {
    logger.info('Initializing services...');
    
    // Connect to database
    await database.initialize();
    
    // Connect to Redis
    await redis.connect();
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  await initializeServices();

  const server = http.createServer(app);
  
  // Initialize WebSocket
  websocketService.initialize(server);
  
  // Start alert monitoring
  alertService.runMonitoringLoop(60);

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Backend API server running on port ${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    
    alertService.stop();
    websocketService.close();
    await redis.close();
    await database.close();
    
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    
    alertService.stop();
    websocketService.close();
    await redis.close();
    await database.close();
    
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});