import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class SemVer {
  private constructor(
    readonly major: number,
    readonly minor: number,
    readonly patch: number,
  ) {}

  static parse(text: string): SemVer | null {
    const matched = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
    if (matched === null) return null;
    const [, major, minor, patch] = matched;
    if (major === undefined || minor === undefined || patch === undefined) return null;
    return new SemVer(Number(major), Number(minor), Number(patch));
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
}

/** Igeta パッケージ自身の版。 */
export function readIgetaVersion(igetaRoot: string): SemVer {
  const raw: unknown = JSON.parse(readFileSync(join(igetaRoot, 'package.json'), 'utf8'));
  const version =
    typeof raw === 'object' && raw !== null && 'version' in raw ? (raw as { version: unknown }).version : undefined;
  if (typeof version !== 'string') throw new Error('Igeta の package.json に version がない');
  const parsed = SemVer.parse(version);
  if (parsed === null) throw new Error(`Igeta の version が semver でない: ${version}`);
  return parsed;
}

/** マイナー 2 つ以上、またはメジャーが 1 つ以上遅れていたら追従が必要。 */
export function isOutdated(pinned: SemVer, current: SemVer): boolean {
  if (pinned.major < current.major) return true;
  if (pinned.major > current.major) return false;
  return current.minor - pinned.minor >= 2;
}

export const IGETA_VERSION_FILE = '.igeta-version';
