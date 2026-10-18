// 描画の入口 (起動の 1 行)。経路と Provider は app/ が組む。
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
