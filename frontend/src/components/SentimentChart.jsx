import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function SentimentChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div>
        <h3 className="chart-title">Sentiment Trend (Last 24 Hours)</h3>
        <div className="empty-state">No data available</div>
      </div>
    );
  }

  const formattedData = data.map(d => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }));

  return (
    <div>
      <h3 className="chart-title">Sentiment Trend (Last 24 Hours)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="time" 
            stroke="#9ca3af"
            style={{ fontSize: '0.75rem' }}
          />
          <YAxis 
            stroke="#9ca3af"
            style={{ fontSize: '0.75rem' }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem' }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="positive_count" 
            stroke="#10b981" 
            name="Positive"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line 
            type="monotone" 
            dataKey="negative_count" 
            stroke="#ef4444" 
            name="Negative"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line 
            type="monotone" 
            dataKey="neutral_count" 
            stroke="#6b7280" 
            name="Neutral"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
