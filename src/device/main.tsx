import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Device from './Device'
import './device.css'

createRoot(document.getElementById('device')!).render(<StrictMode><Device /></StrictMode>)
