export default function Loading({ message = 'Opening the archive…' }) {
  return <div className="archive-loading" aria-busy="true">
    <p className="sr-only" role="status">{message}</p>
    <div aria-hidden="true"><span className="loading-shape loading-search" />
      <div className="loading-facets">{[0, 1, 2].map(key => <span key={key} className="loading-shape" />)}</div>
      <div className="loading-grid">{[0, 1, 2, 3].map(key => <span key={key} className="loading-shape loading-card" />)}</div>
    </div>
  </div>;
}
