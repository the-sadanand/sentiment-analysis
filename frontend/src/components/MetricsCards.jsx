export function MetricsCards({ metrics }) {
  return (
    <div className="metrics-row">
      <div className="metric-card">
        <div className="metric-label">Total Posts</div>
        <div className="metric-value">{metrics.total.toLocaleString()}</div>
      </div>
      <div className="metric-card positive">
        <div className="metric-label">Positive</div>
        <div className="metric-value">{metrics.positive.toLocaleString()}</div>
      </div>
      <div className="metric-card negative">
        <div className="metric-label">Negative</div>
        <div className="metric-value">{metrics.negative.toLocaleString()}</div>
      </div>
      <div className="metric-card neutral">
        <div className="metric-label">Neutral</div>
        <div className="metric-value">{metrics.neutral.toLocaleString()}</div>
      </div>
    </div>
  );
}