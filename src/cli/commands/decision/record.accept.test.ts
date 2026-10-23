// node --test dist/cli/commands/decision/record.accept.test.js
// decision-accept と decision-reject (テスト仕様 10 の TST-101・102・110・111・326)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseHistory } from '#decision/core';
import { APPROVER, DECISIONS, disposeAllRepos } from '#core/decision/decision.test-support.js';
import { adrText, pullUrl } from '#core/decision/adr.test-support.js';
import { ExitCode } from '#core/ExitCode.js';
import { fixturePort } from './port.test-support.js';
import { recordDecision } from './record.js';
import { newRepo, seedProposed, mergedPort, request, status, checkClean } from './record.test-support.js';

after(disposeAllRepos);

describe('decision-accept', () => {
  it('[TST-101] approver が merge した PR で accepted/<年>/ へ移り、履歴に 7 列が埋まった 1 行、索引の承認済の表に ✅・日付・決めた人・根拠リンク。終了 0', async () => {
    const repo = newRepo();
    const { sha, port } = seedProposed(repo);
    const outcome = await recordDecision(request(repo, port));
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    const path = `${DECISIONS}/accepted/2026/0003-cache.md`;
    assert.equal(existsSync(join(repo.root, `${DECISIONS}/proposed/0003-cache.md`)), false);
    const text = repo.read(path);
    assert.match(text, /^status: accepted$/m);
    assert.doesNotMatch(text, /^awaiting:/m);
    const rows = parseHistory(text.split('\n')).rows;
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.deepEqual([row?.date, row?.event, row?.before, row?.after, row?.by, row?.evidence, row?.commit], ['2026-10-05', '承認', 'proposed', 'accepted', APPROVER.name, pullUrl(7), sha]);
    assert.match(row?.fingerprint ?? '', /^sha256:[0-9a-f]{64}$/);
    const index = repo.read(`${DECISIONS}/README.md`);
    assert.match(index, /\| \[0003\]\(accepted\/2026\/0003-cache\.md\) \| .* \| ✅ 承認済 \| 2026-10-05 \| CEO \| \[PR #7\]\(https:\/\/github\.com\/acme\/widgets\/pull\/7\) \| — \|/);
    assert.deepEqual(checkClean(repo), [], '記録の後は docs-check の DS が全部通る');
  });

  it('[TST-110] 他の文書の旧パスへの相対リンクと、移した ADR の中のリンクが、新しいパスへ書き換わる。コードスパンの旧パスは NOTICE', async () => {
    const repo = newRepo();
    repo.write('docs/person/design/shared/05-glossary.md', '---\nid: glossary\ntitle: 用語\ntype: design\nkind: glossary\nstatus: active\nowners: [eng]\n---\n\n# 用語\n');
    repo.write('docs/person/design/shared/00-map.md', `---\nid: map\ntitle: 地図\ntype: design\nkind: map\nstatus: active\nowners: [eng]\n---\n\n# 地図\n\n[決定](../../decisions/proposed/0003-cache.md) と \`docs/person/decisions/proposed/0003-cache.md\`\n`);
    const path = `${DECISIONS}/proposed/0003-cache.md`;
    repo.write(path, adrText({ number: '0003', slug: 'cache', extra: { awaiting: APPROVER.name }, body: '[用語](../../design/shared/05-glossary.md)' }));
    const sha = repo.commit('adr (#7)');
    const outcome = await recordDecision(request(repo, mergedPort(sha)));
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    assert.match(repo.read('docs/person/design/shared/00-map.md'), /\[決定\]\(\.\.\/\.\.\/decisions\/accepted\/2026\/0003-cache\.md\)/);
    assert.match(repo.read(`${DECISIONS}/accepted/2026/0003-cache.md`), /\[用語\]\(\.\.\/\.\.\/\.\.\/design\/shared\/05-glossary\.md\)/);
    assert.ok(outcome.lines.some((line) => line.startsWith('NOTICE') && line.includes('proposed/0003-cache.md')));
  });

  it('[TST-111] --dry-run は MOVE・APPEND・REWRITE・SET の行だけを出し、作業ツリーは同じ', async () => {
    const repo = newRepo();
    const { port } = seedProposed(repo);
    const before = repo.git('rev-parse', 'HEAD');
    const outcome = await recordDecision(request(repo, port, { isDryRun: true }));
    assert.equal(outcome.exitCode, ExitCode.Ok);
    assert.deepEqual([...new Set(outcome.lines.map((line) => line.split(' ')[0]))].sort(), ['APPEND', 'MOVE', 'REWRITE', 'SET']);
    assert.equal(status(repo), '');
    assert.equal(repo.git('rev-parse', 'HEAD'), before);
  });
});

describe('decision-reject', () => {
  it('[TST-102] approver が閉じた PR を根拠に rejected/<年>/ へ。却下の表に ❌・根拠。根拠 commit は空 (TST-326)', async () => {
    const repo = newRepo();
    seedProposed(repo);
    const port = fixturePort({ pulls: { 9: { state: 'closed', author: 'ai', closedBy: APPROVER.github } } });
    const outcome = await recordDecision(request(repo, port, { verb: 'reject', evidence: pullUrl(9), reason: '重複するため' }));
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    const rows = parseHistory(repo.read(`${DECISIONS}/rejected/2026/0003-cache.md`).split('\n')).rows;
    assert.deepEqual([rows[0]?.event, rows[0]?.commit, rows[0]?.memo], ['却下', '', '重複するため']);
    assert.match(repo.read(`${DECISIONS}/README.md`), /❌ 却下 \(1\)[\s\S]*\| ❌ 却下 \|/);
    assert.deepEqual(checkClean(repo), []);
  });

  it('Issue を根拠にでき、閉じた人が違えば拒否', async () => {
    const repo = newRepo();
    seedProposed(repo);
    const wrong = fixturePort({ issues: { 4: { state: 'closed', closedBy: 'stranger' } } });
    assert.equal((await recordDecision(request(repo, wrong, { verb: 'reject', evidence: `https://github.com/acme/widgets/issues/4`, reason: 'r' }))).exitCode, ExitCode.Violation);
    const right = fixturePort({ issues: { 4: { state: 'closed', closedBy: APPROVER.github } } });
    assert.equal((await recordDecision(request(repo, right, { verb: 'reject', evidence: `https://github.com/acme/widgets/issues/4`, reason: 'r' }))).exitCode, ExitCode.Ok);
  });
});
