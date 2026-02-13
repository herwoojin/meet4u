import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './Layout.jsx'
import './index.css'
import { HashRouter } from 'react-router-dom'
import ErrorBoundary from './Components/ErrorBoundary';

const rootElement = document.getElementById('root');

// --- DEBUG START: Mobile White Screen Fix ---
function showError(title, message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.backgroundColor = '#ffe6e6';
    errorDiv.style.padding = '10px';
    errorDiv.style.margin = '10px';
    errorDiv.style.border = '2px solid red';
    errorDiv.style.whiteSpace = 'pre-wrap';
    errorDiv.style.fontSize = '12px';
    errorDiv.style.position = 'relative'; // Stack them naturally
    errorDiv.style.zIndex = '999999';
    errorDiv.innerHTML = `<h3>${title}</h3><p>${message}</p>`;
    document.body.appendChild(errorDiv);
}

window.onerror = function (message, source, lineno, colno, error) {
    showError("Global Error", `${message}\n${source}:${lineno}:${colno}\n${error?.stack || ''}`);
};

window.addEventListener('unhandledrejection', function (event) {
    showError("Unhandled Promise Rejection", event.reason);
});

// Capture console.error
const originalConsoleError = console.error;
console.error = function (...args) {
    originalConsoleError.apply(console, args);
    showError("Console Error", args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '));
};

// Log checkpoints
showError("Debug Info", "JS execution started. Waiting for React mount...");

// Force unregister all service workers
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
        showError("Debug Info", "Found root element. Attempting createRoot...");
        const root = ReactDOM.createRoot(rootElement);
        showError("Debug Info", "createRoot successful. Rendering App...");

        root.render(
            <React.StrictMode>
                <ErrorBoundary>
                    <HashRouter>
                        <App />
                    </HashRouter>
                </ErrorBoundary>
            </React.StrictMode>,
        );
        showError("Debug Info", "Render called.");
    } catch (e) {
        showError("React Mount Failed", e.toString());
    }
} else {
    showError("Fatal Error", "Failed to find the root element");
}
