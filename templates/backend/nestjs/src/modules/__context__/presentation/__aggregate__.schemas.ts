// 形の検証。zod を import してよいのはこのファイルだけ (zod-only-in-module-presentation)。
// ここが見るのは型・必須・余計な項目・query の形まで。長さや状態の遷移などの意味は domain の値オブジェクトが見る。

import { z, type ZodError } from 'zod';

/** POST /__aggregates__ の本文。 */
export const create__Aggregate__BodySchema = z.object({ name: z.string() }).strict();

/** POST /__aggregates__/:id/close の経路の値。 */
export const close__Aggregate__ParamsSchema = z.object({ id: z.string().min(1) }).strict();

/** GET /__aggregates__ の query。status は省略できる。 */
export const list__Aggregate__ItemsQuerySchema = z.object({ status: z.enum(['open', 'closed']).optional() }).strict();

/** 落ちた項目名の配列 (VALIDATION_FAILED の details)。入れ子は `a.b`、値そのものが違うときは `(root)`。 */
export function detailsOf(error: ZodError): string[] {
  const names = error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') return issue.keys.map((key) => [...issue.path, key].join('.'));
    return [issue.path.length === 0 ? '(root)' : issue.path.join('.')];
  });
  return [...new Set(names)];
}
