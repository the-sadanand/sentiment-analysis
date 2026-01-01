import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function DistributionChart({ data }) {
  const total = data.positive + data.negative + data.neutral;
  
  if (total === 0) {
    return (
      <div className="chart-container">
        <h3 className="chart-title">Sentiment Distribution</h3>
        <div className="empty-state">No data available</div>
      </div>
    );
  }

  const chartData = [
    { name: 'Positive', value: data.positive, percentage: ((data.positive / total) * 100).toFixed(1) },
    { name: 'Negative', value: data.negative, percentage: ((data.negative / total) * 100).toFixed(1) },
    { name: 'Neutral', value: data.neutral, percentage: ((data.neutral / total) * 100).toFixed(1) }
  ].filter(d => d.value > 0);

  const COLORS = {
    'Positive': '#10b981',
    'Negative': '#ef4444',
    'Neutral': '#6b7280'
  };

  const renderLabel = (entry) => {
    return `${entry.name}: ${entry.percentage}%`;
  };

  return (
    <div>
      <h3 className="chart-title">Sentiment Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.name]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem' }}
            formatter={(value, name, props) => [`${value} (${props.payload.percentage}%)`, name]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}