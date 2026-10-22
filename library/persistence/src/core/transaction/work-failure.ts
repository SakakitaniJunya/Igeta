/** runner が、利用者の work が投げた失敗と、DB の失敗を区別するための包み。work の失敗は翻訳せずそのまま上げる。 */

class WorkFailure {
  readonly thrown: unknown;

  constructor(thrown: unknown) {
    this.thrown = thrown;
  }
}

/** work の中で投げられた値を印つきの包みにして投げ直す。DB のライブラリはこの包みをそのまま上げる。 */
export async function markWorkFailure<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (thrown) {
    throw new WorkFailure(thrown);
  }
}

/** run の失敗を、work の失敗なら中身をそのまま、それ以外 (DB の失敗) なら translate を通して投げ直す。 */
export async function translateDatabaseFailure<Result>(
  run: () => Promise<Result>,
  translate: (thrown: unknown) => unknown,
): Promise<Result> {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof WorkFailure) throw thrown.thrown;

    throw translate(thrown);
  }
}
