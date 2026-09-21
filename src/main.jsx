import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from './routes.jsx';
import '../dist/fonts.css';
import '../dist/styles.css';
import '../dist/responsive.css';
import '../dist/search.css';
import '../dist/dashboard.css';
import '../dist/polish.css';
import './app.css';

const router = createBrowserRouter(routes);
createRoot(document.getElementById('root')).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
window.dispatchEvent(new Event('archive:boot'));
