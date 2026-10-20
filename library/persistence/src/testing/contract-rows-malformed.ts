/** 契約 C9: 壊れた保存データを読んだとき、id 付きの unprocessable を投げる。 */
import { expect, it } from 'vitest';
import { AppError } from '../core/app-error';
import { captureThrown } from './capture-thrown';
import { LIST_ALL_LIMIT } from './contract-types';
import type { ContractContext, ContractEntity } from './contract-types';

interface FailureSummary {
  readonly kind: string;
  readonly detail: unknown;
}

function summarizeFailure(thrown: unknown): FailureSummary {
  if (thrown instanceof AppError) return { kind: thrown.kind, detail: thrown.detail };

  return { kind: 'not-an-app-error', detail: String(thrown) };
}

async function checkMalformedRecordIsUnprocessable<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
  kind: string,
): Promise<void> {
  const { repository, newId, malformed } = context.subject;
  if (malformed === undefined) throw new Error('malformed がない');
  const id = newId();
  await malformed.plant(kind, id);

  try {
    const foundFailure = await captureThrown(() => repository.findById(id));
    const listedFailure = await captureThrown(() => repository.list({ limit: LIST_ALL_LIMIT }));

    const expected: FailureSummary = { kind: 'unprocessable', detail: { id } };
    expect(summarizeFailure(foundFailure), 'findById が unprocessable を投げない').toEqual(expected);
    expect(summarizeFailure(listedFailure), 'list が unprocessable を投げない').toEqual(expected);
  } finally {
    // 残すと、同じ保存先を読む後続の list が壊れた行で失敗する
    await malformed.remove(id);
  }
}

/** 壊れた保存データの種類ごとに C9 の it を 1 つ登録する。種類が空なら登録しない。 */
export function declareMalformedRows<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
  malformedKinds: readonly string[],
): void {
  for (const kind of malformedKinds) {
    it(`TST-209 契約 C9 壊れた保存データ ${kind} のとき findById と list は unprocessable を投げる`, () =>
      checkMalformedRecordIsUnprocessable(context, kind),
    );
  }
}
