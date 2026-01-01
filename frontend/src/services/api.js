const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export async function fetchPosts(limit = 50, offset = 0, filters = {}) {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    ...filters
  });

  const response = await fetch(`${API_URL}/api/posts?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch posts');
  }
  return await response.json();
}

export async function fetchDistribution(hours = 24) {
  const response = await fetch(`${API_URL}/api/sentiment/distribution?hours=${hours}`);
  if (!response.ok) {
    throw new Error('Failed to fetch distribution');
  }
  return await response.json();
}

export async function fetchAggregateData(period = 'hour', startDate = null, endDate = null) {
  const params = new URLSearchParams({ period });
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  const response = await fetch(`${API_URL}/api/sentiment/aggregate?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch aggregate data');
  }
  return await response.json();
}

export function connectWebSocket(onMessage, onError, onClose) {
  const ws = new WebSocket(`${WS_URL}/ws/sentiment`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      onMessage(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    onError(error);
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
    onClose();
  };

  return ws;
}