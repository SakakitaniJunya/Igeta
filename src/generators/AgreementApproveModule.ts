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
  const exportIndexOf = (version: string): number =>
    ledger.events.findIndex((e) => e.event === 'export' && e.version === version);
  const targetIndex = exportIndexOf(request.version);
  if (targetIndex === -1) {
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

  // 承認の基準は後の提出にだけ進む。最後に承認された版より前に提出された版を承認すると、
  // agreement-check の基準が静かに過去へ戻るため拒否する (版の文字列の大小ではなく
  // 台帳上の提出順で判定する — 版の番号付けは人の決める領域)。古い内容への合意は、
  // その内容で新しい版を提出してから承認する。
  const lastApprove = ledger.events.findLast((e) => e.event === 'approve');
  if (lastApprove !== undefined && lastApprove.event === 'approve') {
    const baselineIndex = exportIndexOf(lastApprove.targetVersion);
    if (baselineIndex === -1) {
      return {
        kind: 'rejected',
        violation: { severity: 'cannot-check', message: `承認された版 ${lastApprove.targetVersion} の提出の記録が台帳に無い (台帳が内部不整合)` },
      };
    }
    if (targetIndex <= baselineIndex) {
      return {
        kind: 'rejected',
        violation: {
          severity: 'violation',
          message: `版 ${request.version} の提出は、最後に承認された版 ${lastApprove.targetVersion} より前に記録されている (承認の基準は後の提出にだけ進む。古い内容に戻す合意なら、その内容で新しい版を提出して承認する)`,
        },
      };
    }
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
