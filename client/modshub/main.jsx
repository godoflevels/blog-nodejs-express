import { createRoot } from 'react-dom/client';
import './styles/studio.css';
import App from './App.jsx';

const root = document.getElementById('modshub-root');
root.textContent = '';
createRoot(root).render(<App />);
