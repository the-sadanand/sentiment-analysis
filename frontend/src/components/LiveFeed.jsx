export default function LiveFeed({ posts }) {
  if (!posts || posts.length === 0) {
    return (
      <div>
        <h3 className="chart-title">Live Post Feed</h3>
        <div className="empty-state">Waiting for posts...</div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="chart-title">Live Post Feed</h3>
      <div className="live-feed">
        {posts.map((post, index) => (
          <div key={`${post.post_id}-${index}`} className="feed-item">
            <div className="feed-meta">
              <span>{post.source}</span>
              <span className={`feed-sentiment ${post.sentiment_label}`}>
                {post.sentiment_label} ({(post.confidence_score * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="feed-content">{post.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
