# Real-Time Sentiment Analysis Platform

A production-grade real-time sentiment analysis platform that processes social media posts, analyzes sentiment and emotions using AI models, and provides live visualizations through a web dashboard.

## Features

- **Real-time Data Processing**: Continuous ingestion and analysis of social media posts
- **AI-Powered Analysis**: Dual model approach (local Hugging Face + external LLM API)
- **Live Dashboard**: Real-time updates via WebSocket with interactive visualizations
- **Microservices Architecture**: 6 containerized services orchestrated with Docker Compose
- **Scalable Design**: Redis Streams for message queuing, PostgreSQL for persistence
- **Alert System**: Automated monitoring for negative sentiment spikes
- **Production Ready**: Comprehensive error handling, logging, and health checks

## Architecture Overview

The system consists of 6 microservices:

1. **Database (PostgreSQL)**: Stores posts, sentiment analysis results, and alerts
2. **Message Queue (Redis)**: Manages data streams using Redis Streams
3. **Ingester**: Generates and publishes realistic social media posts
4. **Worker**: Consumes posts, performs AI analysis, stores results
5. **Backend API**: Serves data via REST endpoints and WebSocket
6. **Frontend**: React dashboard with live visualizations

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- 4GB RAM minimum
- Ports 3000 and 8000 available
- API key from Groq (https://console.groq.com/keys) or OpenAI/Anthropic

## Quick Start

```bash
# Clone repository
git clone <your-repo-url>
cd sentiment-platform

# Copy environment template
cp .env.example .env

# Edit .env file with your API keys
nano .env
# Set POSTGRES_PASSWORD and EXTERNAL_LLM_API_KEY

# Start all services
docker-compose up -d

# Wait for services to be healthy (30-60 seconds)
docker-compose ps

# Check logs
docker-compose logs -f

# Access dashboard
# Open http://localhost:3000 in browser

# Access API
# Open http://localhost:8000/api/health

# Stop services
docker-compose down

# Stop and remove volumes (clears all data)
docker-compose down -v
```

## Configuration

### Required Environment Variables

Edit `.env` file with your values:

```bash
# Database
POSTGRES_PASSWORD=your_secure_password_here

# AI Models
EXTERNAL_LLM_API_KEY=your_groq_api_key_here
```

### Optional Configuration

```bash
# Adjust ingestion rate (posts per minute)
POSTS_PER_MINUTE=60

# Alert thresholds
ALERT_NEGATIVE_RATIO_THRESHOLD=2.0  # Trigger when negative/positive > 2.0
ALERT_WINDOW_MINUTES=5              # Time window for analysis
ALERT_MIN_POSTS=10                  # Minimum posts required
```

## API Documentation

### REST Endpoints

#### Health Check
```
GET /api/health
```
Returns system health and statistics.

#### Get Posts
```
GET /api/posts?limit=50&offset=0&source=reddit&sentiment=positive
```
Retrieve posts with pagination and filtering.

#### Aggregate Data
```
GET /api/sentiment/aggregate?period=hour&start_date=2025-01-01T00:00:00Z
```
Get time-series aggregated sentiment data.

#### Distribution
```
GET /api/sentiment/distribution?hours=24
```
Get current sentiment distribution.

### WebSocket

Connect to `ws://localhost:8000/ws/sentiment` for real-time updates.

**Message Types:**
- `connected`: Connection confirmation
- `new_post`: New post analyzed
- `metrics_update`: Periodic metrics (every 30s)

## Testing

### Backend Tests

```bash
# Run tests with coverage
docker-compose exec backend npm test

# View coverage report
docker-compose exec backend npm test -- --coverage
```

### Integration Tests

```bash
# Test end-to-end flow
docker-compose exec backend npm run test:integration
```

## Troubleshooting

### Services Not Starting

```bash
# Check service status
docker-compose ps

# View logs for specific service
docker-compose logs backend
docker-compose logs worker

# Restart specific service
docker-compose restart backend
```

### Database Connection Issues

```bash
# Check PostgreSQL is healthy
docker-compose exec postgres pg_isready -U sentiment_user

# Connect to database
docker-compose exec postgres psql -U sentiment_user -d sentiment_db

# Verify tables exist
\dt
```

### Redis Connection Issues

```bash
# Check Redis is healthy
docker-compose exec redis redis-cli ping

# View stream info
docker-compose exec redis redis-cli XINFO STREAM social_posts_stream
```

### Worker Not Processing

```bash
# Check worker logs
docker-compose logs -f worker

# Verify consumer group exists
docker-compose exec redis redis-cli XINFO GROUPS social_posts_stream

# Check pending messages
docker-compose exec redis redis-cli XPENDING social_posts_stream sentiment_workers
```

### Frontend Not Loading

```bash
# Check frontend logs
docker-compose logs frontend

# Rebuild frontend
docker-compose up -d --build frontend

# Check API connectivity
curl http://localhost:8000/api/health
```

## Project Structure

```
sentiment-platform/
├── docker-compose.yml
├── .env.example
├── README.md
├── ARCHITECTURE.md
│
├── backend/               # Express.js API
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── models/
│   │   └── database.js
│   ├── api/
│   │   ├── routes.js
│   │   └── websocket.js
│   ├── services/
│   │   ├── redis.js
│   │   └── alerting.js
│   ├── config/
│   │   └── logger.js
│   └── tests/
│
├── worker/               # Sentiment analysis worker
│   ├── Dockerfile
│   ├── package.json
│   ├── requirements.txt
│   ├── worker.js
│   └── sentiment_analyzer.py
│
├── ingester/            # Data ingestion service
│   ├── Dockerfile
│   ├── package.json
│   └── ingester.js
│
└── frontend/            # React dashboard
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── components/
        │   ├── Dashboard.jsx
        │   ├── DistributionChart.jsx
        │   ├── SentimentChart.jsx
        │   ├── LiveFeed.jsx
        │   └── MetricsCards.jsx
        └── services/
            └── api.js
```

## Performance

- **Throughput**: Processes 60+ posts/minute by default
- **Latency**: < 2 seconds from ingestion to dashboard update
- **Scalability**: Horizontal scaling via multiple worker instances
- **Reliability**: At-least-once delivery guarantees via Redis Streams

## Security Considerations

- **No exposed credentials**: All secrets loaded from `.env`
- **Internal networking**: Database and Redis not exposed to host
- **Input validation**: All API endpoints validate inputs
- **SQL injection protection**: Parameterized queries throughout
- **Rate limiting**: Configurable via Redis

## License

MIT License

## Support

For issues and questions:
- Check the Troubleshooting section above
- Review logs: `docker-compose logs <service-name>`
- Verify environment configuration in `.env`