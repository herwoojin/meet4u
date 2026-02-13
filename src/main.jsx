import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './Layout.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import ErrorBoundary from './Components/ErrorBoundary';

const initApp = () => {
    try {
        const rootElement = document.getElementById('root');
        if (!rootElement) throw new Error("Failed to find the root element");

        ReactDOM.createRoot(rootElement).render(
            <React.StrictMode>
                <ErrorBoundary>
                    <BrowserRouter basename={import.meta.env.BASE_URL}>
                        <App />
                    </BrowserRouter>
                </ErrorBoundary>
            </React.StrictMode>,
        );
    } catch (error) {
        console.error("Failed to initialize app:", error);
        document.body.innerHTML = `<div style="padding: 20px; text-align: center;"><h1>Something went wrong.</h1><p>Please refresh the page.</p></div>`;
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
