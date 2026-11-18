import React, { lazy, Suspense, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const HeritageReview = lazy(() => import('./HeritageReview'));

function Root() {
  const [review, setReview] = useState(window.location.hash === '#heritage-review');
  useEffect(() => {
    const onHashChange = () => setReview(window.location.hash === '#heritage-review');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return review ? <Suspense fallback={<div className="heritage-review-message">Đang mở bản xem thử…</div>}><HeritageReview /></Suspense> : <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
