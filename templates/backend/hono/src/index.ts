// 組み立て: 環境変数 → Firestore → /healthz → notFound → onError → serve。ここは spec を持たない (起動の配線だけ)。
// module も入口 (entries) もここでは登録しない。1 単位を展開したあと、`@igeta:register-*` の目印の上に足す (目印は消さない)。

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { toResponse } from '@/entries/http/to-response.js';
import { requireEnv } from '@/shared/infrastructure/env.js';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { apiError } from '@/shared/presentation/api-response.js';
// @igeta:register-import

const projectId = requireEnv('GCP_PROJECT');
const port = Number(process.env['PORT'] ?? 8080);

const db = createFirestore(projectId);
// module を組む: const <context> = create<Context>Module(db);  ← modules/<context>/index.ts から import する
// @igeta:register-module

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

// 入口を付ける: app.route('/<前置き>', create<Entry>Routes({ verify, <context> }));
//   verify (署名・トークンの検証) はこのアプリがここで作って渡す。
// @igeta:register-verify
// @igeta:register-entry

app.notFound((c) => toResponse(c, apiError(404, 'NOT_FOUND', 'route not found')));

app.onError((error, c) => {
  console.error(error);
  return toResponse(c, apiError(500, 'INTERNAL_ERROR', 'internal server error'));
});

serve({ fetch: app.fetch, port });
