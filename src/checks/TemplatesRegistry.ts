import { relative, sep } from 'node:path';
import type { TemplateVariant } from '../generators/TemplateExpandModule.js';
import { templateBaseDir } from '../generators/TemplateExpandModule.js';

/** check-templates の matrix に載る 1 変種の置き場。extensions は igeta-check-layout の --ext に渡す */
export interface RegisteredVariant {
  readonly variant: TemplateVariant;
  readonly folder: string;
  readonly extensions: readonly string[];
}

/** templates/ の登録 (ADR-0014)。root は第 1 階層、値は第 2 階層のフォルダ (undefined は葉) */
export interface TemplatesRegistry {
  readonly root: Readonly<Record<string, readonly string[] | undefined>>;
  readonly variants: readonly RegisteredVariant[];
  /** 第 2 階層のフォルダのうち、check-templates の matrix に無くてよいものと、その理由 */
  readonly exempt: Readonly<Record<string, string>>;
}

/** 変種の置き場 (templates/ からの相対)。expand が使う templateBaseDir と同じ対応から導く */
const folderOf = (variant: TemplateVariant): string => relative('templates', templateBaseDir('.', variant)).split(sep).join('/');

export const TEMPLATES_REGISTRY: TemplatesRegistry = {
  root: {
    '.github': undefined,
    'README.md': undefined,
    docs: undefined,
    backend: ['hono', 'nestjs', 'rust'],
    frontend: ['admin'],
    mobile: ['ios'],
  },
  variants: [
    { variant: 'hono', folder: folderOf('hono'), extensions: [] },
    { variant: 'nestjs', folder: folderOf('nestjs'), extensions: [] },
    { variant: 'rust', folder: folderOf('rust'), extensions: ['rs'] },
    { variant: 'frontend', folder: folderOf('frontend'), extensions: [] },
  ],
  exempt: { 'mobile/ios': '自己検査が無い (xcodegen と Xcode のため macOS が要る)' },
};
