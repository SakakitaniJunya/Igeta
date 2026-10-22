/** 契約 C9: 壊れた保存データを読んだとき、id 付きの unprocessable を投げる。 */
import { expect, it } from 'vitest';
import { captureThrown } from '#testing/harness/capture-thrown';
import { summarizeFailure } from '#testing/contract/failure';
import type { FailureSummary } from '#testing/contract/failure';
import { LIST_ALL_LIMIT } from '#testing/contract/types';
import type { ContractContext, ContractEntity } from '#testing/contract/types';

async function checkMalformedRecordIsUnprocessable<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
  kind: string,
): Promise<void> {
  const { repository, newId, plantMalformed, remove } = context.subject();
  if (plantMalformed === undefined) throw new Error('plantMalformed がない');
  const id = newId();
  await plantMalformed(kind, id);

  try {
    const foundFailure = await captureThrown(() => repository.findById(id));
    const listedFailure = await captureThrown(() => repository.list({ limit: LIST_ALL_LIMIT }));

    const expected: FailureSummary = { kind: 'unprocessable', detail: { id } };
    expect(summarizeFailure(foundFailure), 'findById が unprocessable を投げない').toEqual(expected);
    expect(summarizeFailure(listedFailure), 'list が unprocessable を投げない').toEqual(expected);
  } finally {
    // 残すと、同じ保存先を読む後続の list が壊れた行で失敗する
    await remove(id);
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
