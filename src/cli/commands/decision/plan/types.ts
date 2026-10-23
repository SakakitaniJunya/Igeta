// 決定の状態を変える計画の型 (ADR-0013 決定 2)。要求・結果・1 文書の変更・確かめの段 (Step)・確かめに使う前提 (Context)。

import type { DecisionDoc } from '#decision/core';
import { ExitCode } from '#core/ExitCode.js';
import type { DecisionsConfig } from '#core/IgetaConfig.js';
import type { GitHubPort } from '../port.js';

export type DecisionVerb = 'accept' | 'reject' | 'supersede' | 'amend';

export interface RecordRequest {
  readonly root: string;
  readonly igetaRoot: string;
  readonly verb: DecisionVerb;
  /** ADR の id か番号 (`0013`・`13`・`ADR-0013`) */
  readonly target: string;
  readonly by?: string;
  readonly evidence?: string;
  readonly reason?: string;
  /** supersede の、置いた方の ADR (id か番号) */
  readonly byAdr?: string;
  readonly isDryRun: boolean;
  readonly port: GitHubPort;
  /** 記録の日 (YYYY-MM-DD) */
  readonly today: string;
}

export interface RecordOutcome {
  readonly exitCode: ExitCode;
  readonly lines: readonly string[];
}

/** 1 つの文書の変更。newPath が path と違えば移動。edit は、リンクを書き換えた後の本文に履歴と frontmatter を重ねる */
export interface Change {
  /** 変える文書。ADR のほか、移行では決定台帳も入る */
  readonly doc: Pick<DecisionDoc, 'path' | 'text'>;
  readonly newPath: string;
  readonly edit: (text: string) => string;
  readonly appended: string;
  readonly settings: readonly string[];
}

export type Step<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly exitCode: ExitCode; readonly reason: string };
export const proceed = <T>(value: T): Step<T> => ({ ok: true, value });
export const refuse = (reason: string): Step<never> => ({ ok: false, exitCode: ExitCode.Violation, reason });
export const cannotCheck = (reason: string): Step<never> => ({ ok: false, exitCode: ExitCode.CannotCheck, reason });

export interface Context {
  readonly request: RecordRequest;
  readonly config: DecisionsConfig;
  readonly slug: string;
  readonly docs: readonly DecisionDoc[];
}
