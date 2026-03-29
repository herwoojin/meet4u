import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { HashRouter } from 'react-router-dom'
import ErrorBoundary from './Components/ErrorBoundary';

// Clear old workbox/SW caches (but preserve Firestore offline cache)
if ('caches' in window) {
    caches.keys().then(names => {
        names.forEach(name => {
            // Firestore 캐시는 삭제하지 않음
            if (!name.startsWith('firestore')) {
                caches.delete(name);
            }
        });
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
