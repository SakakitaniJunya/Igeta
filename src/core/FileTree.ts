import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** dir の下のファイルを dir からの相対 path で、名前順に返す。 */
export function listFiles(dir: string, base: string = dir): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full, base));
    else files.push(relative(base, full));
  }
  return files;
}
