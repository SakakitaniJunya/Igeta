// node --test dist/cli/commands/decision/verbs.test.js
// decision-* の入口: 必須の引数、port の差し込み、終了コード。書き込みの中身は record.test.ts。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVER, DECISIONS, DECISIONS_README, adrText, disposeAllRepos, makeRepo, pullUrl } from '../../../core/decision/decision.test-support.js';
import { ExitCode } from '../../../core/ExitCode.js';
import { IGETA_ROOT } from '../../../core/Paths.js';
import { ArgParseError } from '../../Args.js';
import { createDecisionCommands } from './index.js';
import { fixturePort } from './port.test-support.js';

after(disposeAllRepos);

describe('decision-* コマンド', () => {
  it('5 つの名前で登録され、必須の引数が無ければ ArgParseError (検査不能)', async () => {
    const commands = createDecisionCommands(() => fixturePort({}));
    assert.deepEqual(commands.map((c) => c.name), ['decision-accept', 'decision-reject', 'decision-supersede', 'decision-amend', 'decision-pending']);
    const accept = commands[0];
    const ctx = { cwd: '.', igetaRoot: IGETA_ROOT, stdout: () => undefined, stderr: () => undefined };
    await assert.rejects(() => accept?.run(['0001', '--by', 'x'], ctx) ?? Promise.resolve(), ArgParseError);
    await assert.rejects(() => accept?.run(['--by', 'x', '--evidence', 'y'], ctx) ?? Promise.resolve(), ArgParseError);
  });

  it('差し込んだ port で --dry-run が通り、計画の行だけを標準出力に出す', async () => {
    const repo = makeRepo();
    repo.write(`${DECISIONS}/README.md`, DECISIONS_README);
    repo.write(`${DECISIONS}/proposed/0003-cache.md`, adrText({ number: '0003', slug: 'cache', extra: { awaiting: APPROVER.name } }));
    const sha = repo.commit('提案 (#7)');
    const port = fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha } }, commits: { 7: [sha] } });
    const out: string[] = [];
    const [accept] = createDecisionCommands(() => port);
    const code = await accept?.run(['0003', '--by', APPROVER.name, '--evidence', pullUrl(7), '--dry-run', '--root', repo.root], {
      cwd: '.',
      igetaRoot: IGETA_ROOT,
      stdout: (line) => out.push(line),
      stderr: () => undefined,
    });
    assert.equal(code, ExitCode.Ok);
    assert.ok(out.some((line) => line.startsWith('MOVE ')));
    assert.equal(repo.git('status', '--porcelain'), '');
  });
});
