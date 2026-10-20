/** work が投げた値を取り出すテスト用の関数。投げなかったときは失敗させる。 */

/** work を実行し、投げられた値を返す。同期でも非同期でもよい。 */
export async function captureThrown(work: () => unknown): Promise<unknown> {
  try {
    await work();
  } catch (thrown) {
    return thrown;
  }

  throw new Error('例外が投げられなかった');
}
