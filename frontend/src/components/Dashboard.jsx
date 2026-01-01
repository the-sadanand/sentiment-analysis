import { useState, useEffect, useRef } from 'react';
import DistributionChart from './DistributionChart';
import SentimentChart from './SentimentChart';
import LiveFeed from './LiveFeed';
import MetricsCards from './MetricsCards';
import { fetchDistribution, fetchAggregateData, connectWebSocket } from '../services/api';

function Dashboard() {
  const [distributionData, setDistributionData] = useState({ positive: 0, negative: 0, neutral: 0 });
  const [trendData, setTrendData] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [metrics, setMetrics] = useState({ total: 0, positive: 0, negative: 0, neutral: 0 });
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleTimeString());
  
  const wsRef = useRef(null);

  useEffect(() => {
    // Fetch initial data
    loadInitialData();

    // Connect WebSocket
    const ws = connectWebSocket(
      handleWebSocketMessage,
      handleWebSocketError,
      handleWebSocketClose
    );
    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const loadInitialData = async () => {
    try {
      // Fetch distribution
      const dist = await fetchDistribution(24);
      setDistributionData(dist.distribution);
      setMetrics({
        total: dist.total,
        positive: dist.distribution.positive,
        negative: dist.distribution.negative,
        neutral: dist.distribution.neutral
      });

      // Fetch trend data
      const agg = await fetchAggregateData('hour');
      setTrendData(agg.data);

      setConnectionStatus('connected');
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setConnectionStatus('disconnected');
    }
  };

  const handleWebSocketMessage = (message) => {
    setLastUpdate(new Date().toLocaleTimeString());

    if (message.type === 'connected') {
      setConnectionStatus('connected');
      console.log('WebSocket connected');
    } else if (message.type === 'new_post') {
      // Add new post to feed
      setRecentPosts(prev => [message.data, ...prev].slice(0, 20));
      
      // Update distribution
      const sentiment = message.data.sentiment_label;
      setDistributionData(prev => ({
        ...prev,
        [sentiment]: prev[sentiment] + 1
      }));
      
      setMetrics(prev => ({
        ...prev,
        total: prev.total + 1,
        [sentiment]: prev[sentiment] + 1
      }));
    } else if (message.type === 'metrics_update') {
      // Update metrics from server
      const last24h = message.data.last_24_hours;
      setMetrics({
        total: last24h.total,
        positive: last24h.positive,
        negative: last24h.negative,
        neutral: last24h.neutral
      });
    }
  };

  const handleWebSocketError = (error) => {
    console.error('WebSocket error:', error);
    setConnectionStatus('disconnected');
  };

  const handleWebSocketClose = () => {
    console.log('WebSocket closed');
    setConnectionStatus('disconnected');
    
    // Try to reconnect after 5 seconds
    setTimeout(() => {
      const ws = connectWebSocket(
        handleWebSocketMessage,
        handleWebSocketError,
        handleWebSocketClose
      );
      wsRef.current = ws;
    }, 5000);
  };

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Real-Time Sentiment Analysis Dashboard</h1>
        <div className="status-bar">
          <div className={`status-indicator ${connectionStatus}`}>
            ● {connectionStatus === 'connected' ? 'Live' : connectionStatus}
          </div>
          <div className="last-update">
            Last Update: {lastUpdate}
          </div>
        </div>
      </header>

      <main className="main-content">
        <MetricsCards metrics={metrics} />

        <div className="charts-row">
          <div className="chart-container">
            <DistributionChart data={distributionData} />
          </div>
          <div className="chart-container">
            <LiveFeed posts={recentPosts} />
          </div>
        </div>

        <div className="trend-row">
          <SentimentChart data={trendData} />
        </div>
      </main>
    </div>
  );
}

export default Dashboard;