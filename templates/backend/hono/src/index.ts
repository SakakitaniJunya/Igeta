// 組み立て: 環境変数 → Firestore → /healthz → notFound → onError → serve。ここは spec を持たない (起動の配線だけ)。
// module も入口 (entries) もここでは登録しない。1 単位を展開したあと、下のコメントの 2 か所に 1 行ずつ足す。

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { toResponse } from '@/entries/http/to-response.js';
import { requireEnv } from '@/shared/infrastructure/env.js';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { apiError } from '@/shared/presentation/api-response.js';

const projectId = requireEnv('GCP_PROJECT');
const port = Number(process.env['PORT'] ?? 8080);

const db = createFirestore(projectId);
// 1 つ目 (module を組む): const <module> = create<Context>Module(db);  ← modules/<context>/index.ts から import する

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

// 2 つ目 (入口を付ける): app.route('/<前置き>', create<Entry>Routes({ verify, <context>: <module> }));
//   verify (署名・トークンの検証) はこのアプリがここで作って渡す。

app.notFound((c) => toResponse(c, apiError(404, 'NOT_FOUND', 'route not found')));

app.onError((error, c) => {
  console.error(error);
  return toResponse(c, apiError(500, 'INTERNAL_ERROR', 'internal server error'));
});

serve({ fetch: app.fetch, port });
