import {createRoot} from 'react-dom/client';
import Coach from './shared/Coach';
import './shared/style.css';
createRoot(document.getElementById('root')!).render(<Coach storageScope="vercel-local" runtime="vercel"/>);
