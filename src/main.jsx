import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './Layout.jsx' // Updated to point to Layout as App for now, or create App.jsx later
import './index.css'
import { BrowserRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <App />
        </BrowserRouter>
    </React.StrictMode>,
)
