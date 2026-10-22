// node --test dist/cli/commands/decision/record.test.js
// decision-accept|reject|supersede|amend の書き込み口 (テスト仕様 10 の TST-101〜104・110・111・301〜326)。
// git は一時フォルダの本物の repo、GitHub は GitHubPort の fixture。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory } from '#decision/core';
import { DecisionStatusCheck } from '../../../checks/DecisionStatusCheck.js';
import { APPROVER, DECISIONS, DECISIONS_README, adrText, disposeAllRepos, landAccepted, makeRepo, pullUrl } from '../../../core/decision/decision.test-support.js';
import type { TestRepo } from '../../../core/decision/decision.test-support.js';
import { ExitCode } from '../../../core/ExitCode.js';
import { IGETA_ROOT } from '../../../core/Paths.js';
import { fixturePort, unavailablePort } from './port.test-support.js';
import type { GitHubPort, PullInfo } from './port.js';
import type { DecisionVerb, RecordRequest } from './record.js';
import { recordDecision } from './record.js';

after(disposeAllRepos);

const OTHER = { name: '別の承認者', github: 'other-gh' };

function newRepo(): TestRepo {
  const repo = makeRepo();
  repo.write(`${DECISIONS}/README.md`, DECISIONS_README);
  return repo;
}

/** proposed の ADR を commit する (この commit が PR の merge commit)。fixture の PR #7 は approver が merge 済み */
function seedProposed(repo: TestRepo, number = '0003', slug = 'cache'): { sha: string; port: GitHubPort; path: string } {
  const path = `${DECISIONS}/proposed/${number}-${slug}.md`;
  repo.write(path, adrText({ number, slug, extra: { awaiting: APPROVER.name } }));
  const sha = repo.commit(`ADR-${number} を提案 (#7)`);
  return { sha, port: mergedPort(sha), path };
}

const mergedPort = (sha: string, patch: Partial<PullInfo> = {}): GitHubPort =>
  fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha, mergedAt: '2026-10-05', ...patch } }, commits: { 7: [sha] } });

function request(repo: TestRepo, port: GitHubPort, patch: Partial<RecordRequest> = {}): RecordRequest {
  return {
    root: repo.root,
    igetaRoot: IGETA_ROOT,
    verb: 'accept' as DecisionVerb,
    target: '0003',
    by: APPROVER.name,
    evidence: pullUrl(7),
    isDryRun: false,
    port,
    today: '2026-10-22',
    ...patch,
  };
}

const status = (repo: TestRepo): string => repo.git('status', '--porcelain');

function checkClean(repo: TestRepo): string[] {
  const check = new DecisionStatusCheck({ now: () => new Date('2026-10-22T00:00:00Z') });
  return check.run({ targetRoot: repo.root, igetaRoot: IGETA_ROOT }).map((v) => `${v.file ?? ''} ${v.message}`);
}

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
    assert.match(index, /\| \[0003\]\(accepted\/2026\/0003-cache\.md\) \| .* \| ✅ 承認済 \| 2026-10-05 \| 榊谷 隼也 \| \[PR #7\]\(https:\/\/github\.com\/acme\/widgets\/pull\/7\) \| — \|/);
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

describe('decision-accept: 拒否 (終了 1) と検査不能 (終了 2)', () => {
  async function refused(patch: (repo: TestRepo, sha: string) => Partial<RecordRequest> & { port?: GitHubPort }, expected: ExitCode = ExitCode.Violation): Promise<string> {
    const repo = newRepo();
    const seeded = seedProposed(repo);
    const extra = patch(repo, seeded.sha);
    const outcome = await recordDecision(request(repo, extra.port ?? seeded.port, extra));
    assert.equal(outcome.exitCode, expected, outcome.lines.join('\n'));
    assert.equal(status(repo), '', '作業ツリーは前と同じ');
    assert.equal(existsSync(join(repo.root, seeded.path)), true);
    return outcome.lines.join('\n');
  }

  it('[TST-303] 根拠が blog・PR の /files URL・commit の URL は拒否', async () => {
    for (const evidence of ['https://blog.example/post', `${pullUrl(7)}/files`, 'https://github.com/acme/widgets/commit/abc1234']) {
      await refused(() => ({ evidence }));
    }
  });

  it('[TST-304] 実在する PR だが、その commit にこの ADR が無い (ADR より前の commit) なら拒否', async () => {
    const repo = newRepo();
    repo.write('docs/other.md', '# 他\n');
    const before = repo.commit('他の PR (#5)');
    const seeded = seedProposed(repo);
    const port = fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: before } }, commits: { 7: [before] } });
    const outcome = await recordDecision(request(repo, port));
    assert.equal(outcome.exitCode, ExitCode.Violation, outcome.lines.join('\n'));
    assert.match(outcome.lines.join('\n'), /adr-0003-cache が無い/);
    assert.equal(existsSync(join(repo.root, seeded.path)), true);
  });

  it('[TST-324] 別 repo の PR の URL は拒否', async () => {
    await refused(() => ({ evidence: 'https://github.com/other/repo/pull/7' }));
  });

  it('[TST-325] merge 済みで ADR を含むが、今の本文と指紋が違う commit なら拒否', async () => {
    const message = await refused((repo) => {
      repo.write(`${DECISIONS}/proposed/0003-cache.md`, adrText({ number: '0003', slug: 'cache', body: '承認の後に変えた本文。', extra: { awaiting: APPROVER.name } }));
      repo.commit('本文を変えた');
      return {};
    });
    assert.match(message, /指紋/);
  });

  it('[TST-305] PR が open か、merge せずに close なら拒否', async () => {
    for (const state of ['open', 'closed'] as const) {
      await refused((_repo, sha) => ({ port: fixturePort({ pulls: { 7: { state, author: 'ai', closedBy: APPROVER.github, mergeCommit: sha } }, commits: { 7: [sha] } }) }));
    }
  });

  it('[TST-306] merge した人が approvers に無い・--by が approvers の名前に無い・--by の github と merge した人が別は拒否', async () => {
    await refused((_repo, sha) => ({ port: mergedPort(sha, { mergedBy: 'stranger' }) }));
    await refused(() => ({ by: '知らない人' }));
    const repo = newRepo();
    const { sha, port } = seedProposed(repo);
    repo.write('.igeta.json', JSON.stringify({ decisions: { approvers: [APPROVER, OTHER] } }));
    repo.commit('two approvers');
    const outcome = await recordDecision(request(repo, port, { by: OTHER.name }));
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.ok(sha.length > 0);
  });

  it('[TST-313] 作業ツリーが dirty なら拒否 (1)。gh が使えなければ検査不能 (2)。どちらも前と同じ', async () => {
    const dirty = newRepo();
    const seeded = seedProposed(dirty);
    dirty.write('memo.txt', 'x');
    assert.equal((await recordDecision(request(dirty, seeded.port))).exitCode, ExitCode.Violation);
    await refused(() => ({ port: unavailablePort }), ExitCode.CannotCheck);
  });

  it('[TST-315] 却下した ADR に accept は拒否', async () => {
    const repo = newRepo();
    repo.write(`${DECISIONS}/rejected/2026/0003-cache.md`, adrText({ number: '0003', slug: 'cache', status: 'rejected' }));
    const sha = repo.commit('rejected (#7)');
    const outcome = await recordDecision(request(repo, mergedPort(sha)));
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.match(outcome.lines.join('\n'), /遷移できない/);
  });

  it('[TST-313] 書き込みの途中で失敗したら、書く前の状態に戻る (索引の区間が無く docs-graph が落ちる)', async () => {
    const repo = makeRepo();
    const { port } = seedProposed(repo);
    repo.write(`${DECISIONS}/README.md`, '---\nid: decisions-index\ntitle: x\ntype: index\nstatus: active\nowners: [eng]\n---\n\n# decisions\n');
    repo.commit('readme without markers');
    const outcome = await recordDecision(request(repo, port));
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.match(outcome.lines.join('\n'), /戻した/);
    assert.equal(status(repo), '');
  });

  it('[TST-322] 同じ id の accept を 2 つ同時に流すと、後の 1 本は拒否 (1)。履歴の行は 1 本', async () => {
    const repo = newRepo();
    const { port } = seedProposed(repo);
    const outcomes = await Promise.all([recordDecision(request(repo, port)), recordDecision(request(repo, port))]);
    assert.deepEqual(outcomes.map((o) => o.exitCode).sort(), [ExitCode.Ok, ExitCode.Violation]);
    assert.equal(parseHistory(repo.read(`${DECISIONS}/accepted/2026/0003-cache.md`).split('\n')).rows.length, 1);
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

describe('decision-supersede / decision-amend', () => {
  it('[TST-103] 新が accepted のとき旧が retired/ へ移り、旧に superseded_by、新に supersedes。索引の承認済に「覆す」・置換の表に覆した ADR', async () => {
    const repo = newRepo();
    landAccepted(repo, { number: '0001', slug: 'old' });
    landAccepted(repo, { number: '0002', slug: 'new' });
    const outcome = await recordDecision(request(repo, unavailablePort, { verb: 'supersede', target: '0001', byAdr: '0002', by: undefined, evidence: undefined }));
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    const old = repo.read(`${DECISIONS}/retired/2026/0001-old.md`);
    assert.match(old, /^status: superseded$/m);
    assert.match(old, /^superseded_by: adr-0002-new$/m);
    assert.match(repo.read(`${DECISIONS}/accepted/2026/0002-new.md`), /^supersedes: \[adr-0001-old\]$/m);
    const index = repo.read(`${DECISIONS}/README.md`);
    assert.match(index, /\| \[0002\]\([^)]*\) \| .* \| ✅ 承認済 \|.*\| \[0001\]\(retired\/2026\/0001-old\.md\) \|/);
    assert.match(index, /\| \[0001\]\(retired\/2026\/0001-old\.md\) \| .* \| ↪ 置換 \| 2026-10-22 \| \[0002\]/);
    assert.deepEqual(checkClean(repo), []);
  });

  it('新が proposed なら supersede は拒否', async () => {
    const repo = newRepo();
    landAccepted(repo, { number: '0001', slug: 'old' });
    repo.write(`${DECISIONS}/proposed/0002-new.md`, adrText({ number: '0002', slug: 'new', extra: { awaiting: APPROVER.name } }));
    repo.commit('proposed new');
    const outcome = await recordDecision(request(repo, unavailablePort, { verb: 'supersede', target: '0001', byAdr: '0002' }));
    assert.equal(outcome.exitCode, ExitCode.Violation);
  });

  it('[TST-104][TST-307] 承認後に本文を直し、新しい PR が merge 済みなら amend: 改訂の行・新しい指紋・status: amended。フォルダはそのまま', async () => {
    const repo = newRepo();
    const landed = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(landed.path, repo.read(landed.path).replace('決定の本文。', '直した本文。'));
    const sha = repo.commit('本文を直す (#8)');
    const port = fixturePort({ pulls: { 8: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha, mergedAt: '2026-10-20' } }, commits: { 8: [sha] } });
    assert.ok(checkClean(repo).some((m) => m.includes('[DS6]')), 'amend の前は DS6 の違反');
    const outcome = await recordDecision(request(repo, port, { verb: 'amend', target: '0001', evidence: pullUrl(8) }));
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    const text = repo.read(landed.path);
    assert.match(text, /^status: amended$/m);
    const rows = parseHistory(text.split('\n')).rows;
    assert.deepEqual(rows.map((r) => r.event), ['承認', '改訂']);
    assert.notEqual(rows[0]?.fingerprint, rows[1]?.fingerprint);
    assert.deepEqual(checkClean(repo), []);
  });

  it('本文が変わっていない amend は拒否', async () => {
    const repo = newRepo();
    landAccepted(repo, { number: '0001', slug: 'a' });
    const outcome = await recordDecision(request(repo, unavailablePort, { verb: 'amend', target: '0001', evidence: pullUrl(8) }));
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.match(outcome.lines.join('\n'), /変わっていない/);
  });
});
