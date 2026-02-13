import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './Layout.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import ErrorBoundary from './Components/ErrorBoundary';

const rootElement = document.getElementById('root');

// --- DEBUG START: Mobile White Screen Fix ---
window.onerror = function (message, source, lineno, colno, error) {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.backgroundColor = '#ffe6e6';
    errorDiv.style.padding = '20px';
    errorDiv.style.margin = '20px';
    errorDiv.style.border = '2px solid red';
    errorDiv.style.whiteSpace = 'pre-wrap';
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.zIndex = '999999';
    errorDiv.style.width = '100%';
    errorDiv.innerHTML = `<h3>Application Error</h3><p>${message}</p><p>${source}:${lineno}:${colno}</p>`;
    if (error && error.stack) {
        errorDiv.innerHTML += `<pre>${error.stack}</pre>`;
    }
    document.body.appendChild(errorDiv);
};

// Force unregister all service workers to clear cache issues
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (let registration of registrations) {
            registration.unregister();
        }
    });
}
// --- DEBUG END ---

if (rootElement) {
    try {
        ReactDOM.createRoot(rootElement).render(
            <React.StrictMode>
                <ErrorBoundary>
                    <BrowserRouter basename={import.meta.env.BASE_URL}>
                        <App />
                    </BrowserRouter>
                </ErrorBoundary>
            </React.StrictMode>,
        );
    } catch (e) {
        console.error("React render failed:", e);
        // Retry rendering without StrictMode or other wrappers if needed, but let's just log for now
        rootElement.innerHTML = `<h1>React Mount Failed</h1><pre>${e.toString()}</pre>`;
    }
} else {
    console.error("Failed to find the root element");
}
