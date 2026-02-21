import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { HashRouter } from 'react-router-dom'
import ErrorBoundary from './Components/ErrorBoundary';

// Force update: clear old caches so mobile gets the latest code
if ('caches' in window) {
    caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
    });
}

// Ensure service workers update immediately
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.update());
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <HashRouter>
                <App />
            </HashRouter>
        </ErrorBoundary>
    </React.StrictMode>,
)
