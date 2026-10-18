// 画面側の保存 (localStorage)。使えない環境 (保存が禁止されている・埋め込みの制限) では、何も保存せず、何も出さない。

export function readSessionValue(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

export function writeSessionValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 保存できなくても、画面は動く (次の画面で値が無いだけ)
  }
}
