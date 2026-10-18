// 日付 (YYYY-MM-DD の文字) の道具。今日は端末の時刻ではなく Asia/Tokyo で数える (UTC 15:00 に日付が変わる)。
// 加減と差は、時刻も夏時間も持たない UTC の暦で数える。

/** 日本時間の今日。now は試験で差し替える。 */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
}

/** date に日数を足す (負なら戻す)。月・年をまたいでよい。 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** a から b までの日数 (b が後なら正)。 */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcMs(b) - utcMs(a)) / 86_400_000);
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? Number.NaN, m ?? Number.NaN, d ?? Number.NaN];
}

function utcMs(date: string): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}
