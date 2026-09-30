// agreement-approve: 提出した版への承認を合意台帳に追記する。
// Spec: docs/explanation/08-agreement-ledger.md §3
//
// 台帳は「承認した」という記録を残すだけで、合意の成立そのもの (口頭・メール等) は記録の外にある。

import { normalizeActor } from '../core/ActorName.js';
import type { AgreementApproveEvent } from '../core/AgreementLedger.js';
import { appendLedgerEvent, readLedger } from '../core/AgreementLedger.js';
import type { Violation } from '../core/Report.js';

export interface AgreementApproveRequest {
  readonly submissionDir: string;
  readonly version: string;
  readonly by: string;
  readonly note?: string;
  readonly now?: Date;
}

export type AgreementApproveResult =
  | { readonly kind: 'ok'; readonly event: AgreementApproveEvent }
  | { readonly kind: 'rejected'; readonly violation: Violation };

export function approveAgreement(request: AgreementApproveRequest): AgreementApproveResult {
  const by = normalizeActor(request.by);
  if (by === '') {
    return { kind: 'rejected', violation: { severity: 'cannot-check', message: '--by が空 (承認者を指定する)' } };
  }

  const ledger = readLedger(request.submissionDir);
  if (ledger.kind === 'invalid') return { kind: 'rejected', violation: ledger.violation };
  if (ledger.kind === 'absent') {
    return {
      kind: 'rejected',
      violation: { severity: 'cannot-check', message: `合意台帳が無い: ${request.submissionDir} (先に export --record-agreement で提出を記録する)` },
    };
  }
  if (!ledger.events.some((e) => e.event === 'export' && e.version === request.version)) {
    return {
      kind: 'rejected',
      violation: { severity: 'cannot-check', message: `版 ${request.version} の提出の記録が台帳に無い (承認できるのは記録済みの版だけ)` },
    };
  }
  if (ledger.events.some((e) => e.event === 'approve' && e.targetVersion === request.version)) {
    return {
      kind: 'rejected',
      violation: { severity: 'violation', message: `版 ${request.version} は既に承認が記録されている (台帳は追記のみで、承認を書き換えない)` },
    };
  }

  const event: AgreementApproveEvent = {
    event: 'approve',
    targetVersion: request.version,
    approvedBy: by,
    approvedAt: (request.now ?? new Date()).toISOString().slice(0, 10),
    ...(request.note !== undefined && request.note !== '' ? { note: request.note } : {}),
  };
  const failure = appendLedgerEvent(request.submissionDir, event);
  if (failure !== null) return { kind: 'rejected', violation: failure };
  return { kind: 'ok', event };
}
