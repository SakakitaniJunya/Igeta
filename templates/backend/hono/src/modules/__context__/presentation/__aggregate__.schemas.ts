// 形の検証 (zod)。zod を import してよいのは module の presentation だけ (zod-only-in-module-presentation)。
// ここが見るのは型・必須・余計な項目・query の形まで。意味 (名前の長さなど) は domain の値オブジェクトが見る。
// 入口 (entries/) は本文と id を unknown のまま渡してくるので、controller がここで safeParse する。

import { z } from 'zod';

export const create__Aggregate__BodySchema = z.object({ name: z.string() }).strict();

/** id は path の値。落ちたときに項目名 `id` を出すため、オブジェクトに包んで検査する。 */
export const close__Aggregate__ParamsSchema = z.object({ id: z.string().min(1) }).strict();

export const list__Aggregate__ItemsQuerySchema = z.object({ status: z.enum(['open', 'closed']).optional() }).strict();

/** 落ちた項目名の配列 (重複なし)。VALIDATION_FAILED の details にする。余計な項目はその名前、本文全体の型違いは `(root)`。 */
export function detailsOf(error: z.ZodError): string[] {
  const names = error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.length === 0 ? '(root)' : issue.path.join('.')],
  );
  return [...new Set(names)];
}
