// ...existing code...
const mongoose = require('mongoose');
const logger = require('../config/logger');

const DEFAULT_DB = 'sentimentdb';
const uri = process.env.MONGODB_URI ||
  `mongodb://${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 27017}/${process.env.DB_NAME || DEFAULT_DB}`;

async function connect() {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE, 10) || 10
    });
    logger.info(`MongoDB connected: ${uri.split('@').pop()}`);
  } catch (err) {
    logger.error('MongoDB connection error', err);
    throw err;
  }
}

async function close() {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected.');
  } catch (err) {
    logger.error('Error while disconnecting MongoDB', err);
    throw err;
  }
}

mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

process.on('SIGINT', async () => {
  await close();
  process.exit(0);
});

module.exports = { connect, close, mongoose };
// ...existing code...