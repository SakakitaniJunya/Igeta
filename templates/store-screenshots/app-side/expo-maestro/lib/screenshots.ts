import { LaunchArguments } from 'react-native-launch-arguments';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { api } from '@/lib/api'; // TODO: 自分の axios インスタンスの場所に合わせる
import { SCREENSHOT_MOCKS } from '@/lib/screenshotData';

function readScenarioArg(): string | null {
  if (!__DEV__) return null;
  try {
    const args = LaunchArguments.value();
    const value = args?.screenshot;
    if (typeof value === 'string' && value.length > 0) return value;
  } catch {
    // ネイティブモジュールが無い環境（Expo Go / web）
  }
  // web 開発用フォールバック: http://localhost:8081/?screenshot=home
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const p = new URLSearchParams(window.location.search).get('screenshot');
      if (p) return p;
    }
  } catch {}
  return null;
}

export const SCREENSHOT_SCENARIO: string | null = readScenarioArg();

function findMock(method: string, url: string): unknown {
  const key = `${method} ${url}`;
  const table = SCREENSHOT_MOCKS as Record<string, unknown>;
  if (key in table) return table[key];
  for (const pattern of Object.keys(table)) {
    if (!pattern.includes('*')) continue;
    const [pMethod, pUrl] = pattern.split(' ');
    if (pMethod !== method) continue;
    const re = new RegExp(`^${pUrl.split('*').map(escapeRe).join('[^/]+')}$`);
    if (re.test(url)) return table[pattern];
  }
  return undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function mockAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method ?? 'get').toUpperCase();
  const url = (config.url ?? '').replace(/[?#].*$/, '');
  const data = findMock(method, url);
  if (data === undefined) {
    const empty = method === 'GET' ? [] : {};
    return { data: empty, status: 200, statusText: 'OK', headers: {}, config };
  }
  await new Promise((r) => setTimeout(r, 60));
  return { data, status: 200, statusText: 'OK', headers: {}, config };
}

if (SCREENSHOT_SCENARIO) {
  api.defaults.adapter = mockAdapter;
}
