/** 契約 C9: 壊れた保存データを読んだとき、id 付きの unprocessable を投げる。 */
import { expect, it } from 'vitest';
import { AppError } from '../core/app-error';
import { captureThrown } from './capture-thrown';
import type { ContractEntity, ContractOptions } from './contract-types';

interface FailureSummary {
  readonly kind: string;
  readonly detail: unknown;
}

function summarizeFailure(thrown: unknown): FailureSummary {
  if (thrown instanceof AppError) return { kind: thrown.kind, detail: thrown.detail };

  return { kind: 'not-an-app-error', detail: String(thrown) };
}

async function checkMalformedRecordIsUnprocessable<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
  caseIndex: number,
): Promise<void> {
  const { repository, newId, malformed } = options.setup();
  const plantMalformed = malformed[caseIndex];
  if (plantMalformed === undefined) throw new Error(`壊れた保存データの ${caseIndex} 件目がない`);
  const id = newId();
  await plantMalformed(id);

  const foundFailure = await captureThrown(() => repository.findById(id));
  const listedFailure = await captureThrown(() => repository.list({ limit: 1 }));

  const expected: FailureSummary = { kind: 'unprocessable', detail: { id } };
  expect(summarizeFailure(foundFailure), 'findById が unprocessable を投げない').toEqual(expected);
  expect(summarizeFailure(listedFailure), 'list が unprocessable を投げない').toEqual(expected);
}

/** 壊れた保存データ 1 件につき C9 の it を 1 つ登録する。一覧が空なら登録しない。 */
export function declareMalformedRows<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): void {
  const caseCount = options.setup().malformed.length;

  for (let caseIndex = 0; caseIndex < caseCount; caseIndex += 1) {
    const caseNumber = caseIndex + 1;
    it(`TST-209 契約 C9 壊れた保存データ ${caseNumber} 件目のとき findById と list は unprocessable を投げる`, () =>
      checkMalformedRecordIsUnprocessable(options, caseIndex),
    );
  }
}
