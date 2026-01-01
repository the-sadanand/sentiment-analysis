# System Architecture

## Overview

The Real-Time Sentiment Analysis Platform is a distributed microservices system designed to process social media posts, analyze sentiment using AI models, and provide real-time insights through a web dashboard.

## System Diagram

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  Ingester   │─────▶│ Redis Streams│◀─────│   Worker    │
│  Service    │      │   (Queue)    │      │   Service   │
└─────────────┘      └──────────────┘      └─────────────┘
                                                    │
                                                    ▼
                                            ┌───────────────┐
                                            │  AI Models    │
                                            │ • Hugging Face│
                                            │ • External LLM│
                                            └───────────────┘
                                                    │
                                                    ▼
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  Frontend   │◀────▶│  Backend API │◀────▶│ PostgreSQL  │
│ (React/WS)  │      │  (Express)   │      │  Database   │
└─────────────┘      └──────────────┘      └─────────────┘
```

## Component Descriptions

### 1. PostgreSQL Database
**Purpose**: Persistent storage for all posts, analysis results, and alerts

**Technology**: PostgreSQL 15+ with pgAdmin-compatible schema

**Responsibilities**:
- Store social media posts with metadata
- Store sentiment analysis results linked to posts
- Store triggered alerts with context
- Provide indexed queries for time-series data

**Tables**:
- `social_media_posts`: Raw post data
- `sentiment_analysis`: Analysis results
- `sentiment_alerts`: Triggered alerts

**Scaling**: Read replicas for query load distribution

### 2. Redis Service
**Purpose**: Message queue and caching layer

**Technology**: Redis 7+ with Streams support

**Responsibilities**:
- Message queue using Redis Streams
- Consumer group coordination for workers
- Caching for frequently accessed data (distribution metrics)
- Pub/sub for WebSocket broadcasting (optional)

**Key Features**:
- At-least-once delivery guarantees
- Message persistence
- Consumer group load balancing

**Scaling**: Redis Cluster for horizontal scaling

### 3. Ingester Service
**Purpose**: Generate and publish realistic social media posts

**Technology**: Node.js 18+

**Responsibilities**:
- Generate posts with varied sentiment (40% positive, 30% neutral, 30% negative)
- Publish to Redis Stream at configurable rate
- Simulate realistic post content and metadata
- Handle backpressure and connection failures

**Configuration**:
- `POSTS_PER_MINUTE`: Ingestion rate (default: 60)
- Post templates with product substitution
- Random author and source generation

**Scaling**: Multiple ingester instances for higher throughput

### 4. Worker Service
**Purpose**: Consume posts and perform sentiment analysis

**Technology**: Node.js 18+ with Python 3.9+ for ML

**Responsibilities**:
- Consume messages from Redis Stream
- Perform sentiment analysis (local + external LLM)
- Perform emotion detection
- Store results in PostgreSQL
- Acknowledge processed messages

**Architecture**:
- Main process (Node.js): Stream consumption, database operations
- Child process (Python): Hugging Face transformers for analysis
- Dual model strategy: Local (fast) + External (fallback)

**AI Models**:
- **Local**: DistilBERT for sentiment, DistilRoBERTa for emotion
- **External**: Groq/OpenAI/Anthropic LLM API

**Performance**:
- Batch processing: 10 messages per read
- Concurrent analysis using Promise.all()
- Target: 2+ messages/second

**Scaling**: Horizontal scaling via multiple worker instances

### 5. Backend API Service
**Purpose**: Serve data via REST and WebSocket

**Technology**: Express.js (Node.js 18+)

**Responsibilities**:
- REST endpoints for historical data
- WebSocket for real-time updates
- Alert monitoring and persistence
- Data aggregation and caching
- Health checks and metrics

**API Endpoints**:
- `GET /api/health`: System health check
- `GET /api/posts`: Paginated posts with filters
- `GET /api/sentiment/aggregate`: Time-series data
- `GET /api/sentiment/distribution`: Current distribution
- `WS /ws/sentiment`: Real-time updates

**Caching Strategy**:
- Distribution data cached in Redis (60s TTL)
- Aggregate queries use database indexes

**Scaling**: Horizontal scaling with load balancer

### 6. Frontend Service
**Purpose**: Interactive web dashboard

**Technology**: React 18+ with Vite, Recharts

**Responsibilities**:
- Display real-time sentiment metrics
- Visualize distribution (pie chart)
- Show sentiment trends (line chart)
- Live post feed with WebSocket
- Connection status monitoring

**Components**:
- Dashboard: Main container
- MetricsCards: Total, positive, negative, neutral counts
- DistributionChart: Pie chart using Recharts
- SentimentChart: Line chart for trends
- LiveFeed: Scrolling post feed

**Scaling**: Static assets via CDN, API calls balanced across backends

## Data Flow

### Ingestion to Analysis Flow

1. **Ingester** generates post with metadata
2. Post published to **Redis Stream** (`XADD`)
3. **Worker** consumes from stream (`XREADGROUP`)
4. **Worker** analyzes sentiment using AI models
5. **Worker** stores post + analysis in **PostgreSQL**
6. **Worker** acknowledges message (`XACK`)
7. **Backend** broadcasts via **WebSocket** to connected clients

### Query Flow

1. **Frontend** requests data via REST API
2. **Backend** checks **Redis** cache
3. If cache miss, query **PostgreSQL**
4. **Backend** caches result in **Redis**
5. **Backend** returns JSON response
6. **Frontend** renders visualization

### Real-time Update Flow

1. **Worker** saves analysis to database
2. **Backend** polls database for new posts (or uses trigger)
3. **Backend** broadcasts via **WebSocket** to all clients
4. **Frontend** receives update and updates UI

## Technology Justification

### Why PostgreSQL?
- ACID transactions for data integrity
- Excellent time-series query performance with indexes
- Native JSON support for alert details
- Proven scalability with partitioning
- Rich ecosystem and tooling

### Why Redis Streams?
- Message persistence (unlike Pub/Sub)
- Consumer groups ensure exactly-once processing per group
- Backpressure handling via blocking reads
- Fast and lightweight
- Built-in message acknowledgment

### Why Express.js?
- Lightweight and fast
- Excellent ecosystem for REST and WebSocket
- Easy integration with PostgreSQL and Redis
- Non-blocking I/O for high concurrency
- Simple to test and deploy

### Why React + Vite?
- Fast development with hot module replacement
- Component-based architecture
- Large ecosystem (Recharts for charts)
- Excellent performance with virtual DOM
- Easy WebSocket integration

### Why Hugging Face + External LLM?
- Local models: Fast, no API costs, no rate limits
- External LLMs: More sophisticated, better quality
- Dual approach: Reliability via fallback
- DistilBERT: 40% smaller than BERT, similar accuracy
- Groq: Free tier, fast inference, good quality

## Database Schema

### Entity-Relationship Diagram

```
┌─────────────────────────┐
│  social_media_posts     │
├─────────────────────────┤
│ id (PK)                 │
│ post_id (UNIQUE)        │◀───┐
│ source                  │    │
│ content                 │    │
│ author                  │    │
│ created_at              │    │
│ ingested_at             │    │
└─────────────────────────┘    │
                               │
                               │ FK
┌─────────────────────────┐    │
│  sentiment_analysis     │    │
├─────────────────────────┤    │
│ id (PK)                 │    │
│ post_id (FK) ───────────────┘
│ model_name              │
│ sentiment_label         │
│ confidence_score        │
│ emotion                 │
│ analyzed_at             │
└─────────────────────────┘

┌─────────────────────────┐
│  sentiment_alerts       │
├─────────────────────────┤
│ id (PK)                 │
│ alert_type              │
│ threshold_value         │
│ actual_value            │
│ window_start            │
│ window_end              │
│ post_count              │
│ triggered_at            │
│ details (JSONB)         │
└─────────────────────────┘
```

### Indexes

**social_media_posts**:
- `idx_post_id`: Unique index on post_id for fast lookups
- `idx_posts_source`: Index on source for filtering
- `idx_posts_created_at`: Index on created_at for time-range queries

**sentiment_analysis**:
- `idx_analysis_analyzed_at`: Index on analyzed_at for time-series queries

**sentiment_alerts**:
- `idx_alerts_triggered_at`: Index on triggered_at for recent alerts

## API Design

### REST Endpoints

All endpoints follow RESTful conventions:
- Use HTTP methods correctly (GET for reads)
- Return appropriate status codes (200, 400, 500, 503)
- Use query parameters for filtering/pagination
- Return consistent JSON structure

### Response Format

```json
{
  "data": [...],
  "metadata": {
    "total": 1000,
    "limit": 50,
    "offset": 0
  },
  "filters": {...},
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Error Format

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### WebSocket Protocol

**Client → Server**: No messages required (read-only)

**Server → Client**:
- `type: "connected"`: Connection confirmation
- `type: "new_post"`: New post analyzed
- `type: "metrics_update"`: Periodic metrics (30s)

## Scalability Considerations

### Horizontal Scaling

**Workers**: Scale to N instances
- Consumer groups ensure load distribution
- Each worker processes subset of messages
- No coordination required

**Backend API**: Scale to N instances
- Stateless design enables simple load balancing
- WebSocket connections distributed across instances
- Use sticky sessions for WebSocket

**Frontend**: Scale via CDN
- Static assets cached at edge
- API calls balanced across backend instances

### Vertical Scaling

**Database**: Increase resources
- More RAM for query caching
- Faster storage for write throughput
- Read replicas for query distribution

**Redis**: Increase resources
- More memory for larger streams
- Faster storage for persistence

### Data Partitioning

**Database**: Partition by time
- Monthly partitions for old data
- Archive old partitions to cold storage

**Redis Streams**: Multiple streams
- Partition by source (reddit_stream, twitter_stream)
- Reduces contention on single stream

## Security Considerations

### Authentication & Authorization
- No authentication in MVP (internal use)
- Future: JWT tokens for API access
- Future: OAuth for user login

### Data Security
- Environment variables for secrets (no hardcoding)
- Database credentials in .env file
- API keys not exposed to frontend
- HTTPS in production (not implemented)

### Input Validation
- All API inputs validated
- SQL injection protection via parameterized queries
- XSS protection in frontend (React escapes by default)

### Rate Limiting
- Redis-based rate limiting for API endpoints
- Configurable limits per IP
- Backoff strategy for retries

### Network Security
- Database and Redis on internal network only
- Only API and Frontend exposed to host
- Docker network isolation

## Monitoring & Observability

### Logging
- Winston logger with JSON format
- Log levels: ERROR, WARN, INFO, DEBUG
- Centralized logging (future: ELK stack)

### Metrics
- Health check endpoints
- Processing rates (posts/second)
- Error counts
- WebSocket connection counts

### Alerting
- Automated alerts for high negative sentiment
- Configurable thresholds
- Alert persistence in database

### Tracing
- Request IDs for distributed tracing (future)
- Correlation across services

## Failure Modes & Recovery

### Database Failure
- Backend returns 503 status
- Worker stops processing (no acknowledgments)
- Messages remain in Redis pending list
- Recovery: Automatic retry after reconnection

### Redis Failure
- Ingester stops publishing
- Worker stops consuming
- Backend cache unavailable (falls back to database)
- Recovery: Reconnection with exponential backoff

### Worker Failure
- Messages remain unacknowledged
- Other workers continue processing
- Recovery: Messages reassigned after timeout

### Backend Failure
- Frontend shows disconnected status
- WebSocket auto-reconnects
- REST queries fail gracefully
- Recovery: Frontend retries after delay

### Network Partition
- Services operate independently
- Messages queued in Redis
- Recovery: Catch-up after partition heals

## Performance Optimization

### Database
- Indexes on frequently queried columns
- Connection pooling (max 20 connections)
- Prepared statements for repeated queries

### Redis
- Pipeline commands for batch operations
- Expiration for cached data (60s TTL)
- Connection pooling

### Worker
- Batch processing (10 messages at once)
- Concurrent analysis (Promise.all)
- Python process reuse (no restart per message)

### API
- Response caching in Redis
- Pagination for large datasets
- Lazy loading for frontend

### Frontend
- Code splitting with Vite
- Memoization for expensive computations
- Virtual scrolling for long lists (future)

## Future Enhancements

1. **Advanced Analytics**: Trend detection, anomaly detection
2. **Multi-tenancy**: Support multiple customers
3. **User Authentication**: Secure access control
4. **Export Functionality**: CSV, PDF reports
5. **Advanced Filtering**: Keyword search, date ranges
6. **Mobile App**: React Native or Flutter
7. **Real-time Collaboration**: Multiple users watching same dashboard
8. **Machine Learning Improvements**: Fine-tune models on domain data
9. **Kubernetes Deployment**: Replace Docker Compose
10. **Observability Stack**: Prometheus + Grafana monitoring