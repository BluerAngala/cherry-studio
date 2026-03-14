import './assets/styles/index.css'
import './assets/styles/tailwind.css'
import '@ant-design/v5-patch-for-react-19'

import { loggerService } from '@logger'
import { createRoot } from 'react-dom/client'

import App from './App'

loggerService.initWindowSource('mainWindow')

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<App />)
