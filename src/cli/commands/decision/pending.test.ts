// node --test dist/cli/commands/decision/pending.test.js
// decision-pending (テスト仕様 10 の TST-105)。経過日数は、ADR が初めて現れた commit の日付から数える。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVER, DECISIONS, disposeAllRepos, makeRepo } from '#core/decision/decision.test-support.js';
import { adrText } from '#core/decision/adr.test-support.js';
import { ExitCode } from '#core/ExitCode.js';
import { IGETA_ROOT } from '#core/Paths.js';
import { DecisionPendingCommand, PENDING_LIMIT_NOTE, collectPending } from './pending.js';

after(disposeAllRepos);

/** 名前の変更の検出 (--follow) が別の ADR と取り違えないよう、本文を十分に違えた ADR */
const longBody = (topic: string): string => Array.from({ length: 12 }, (_, i) => `${topic} の理由 ${i} 番目。${topic.repeat(i + 3)} について決める。`).join('\n\n');

function seed(): ReturnType<typeof makeRepo> {
  const repo = makeRepo();
  repo.write(`${DECISIONS}/proposed/0001-old.md`, adrText({ number: '0001', slug: 'old', body: longBody('古い決定'), extra: { awaiting: APPROVER.name } }));
  repo.commit('ADR-0001 を提案 (#11)', '2026-10-02T09:00:00Z');
  repo.write(`${DECISIONS}/proposed/0002-late.md`, adrText({ number: '0002', slug: 'late', body: longBody('遅れた決定'), extra: { awaiting: APPROVER.name, due: '2026-10-10' } }));
  repo.commit('ADR-0002 を提案 (#12)', '2026-10-19T09:00:00Z');
  repo.write(`${DECISIONS}/proposed/0003-new.md`, adrText({ number: '0003', slug: 'new', body: longBody('新しい決定'), extra: { awaiting: APPROVER.name } }));
  repo.commit('ADR-0003 を提案', '2026-10-19T10:00:00Z');
  return repo;
}

describe('decision-pending', () => {
  it('[TST-105] 経過日数の降順で、持ち主・期限・初めて現れた PR・候補コマンドを出す。候補は書かない', () => {
    const repo = seed();
    const { entries } = collectPending({ root: repo.root, today: '2026-10-22', staleDays: 14 });
    assert.deepEqual(entries.map((e) => [e.number, e.waitedDays, e.isStale]), [['0001', 20, true], ['0002', 3, true], ['0003', 3, false]]);
    assert.equal(entries[0]?.pull, '#11');
    assert.equal(entries[0]?.candidate, `igeta decision-accept 0001 --by "${APPROVER.name}" --evidence https://github.com/acme/widgets/pull/11`);
    assert.equal(entries[2]?.pull, '');
    assert.equal(repo.git('status', '--porcelain'), '');
  });

  it('--json は同じ内容で、末尾の限界の文言を持つ。通常の出力の末尾にも必ず出る', async () => {
    const repo = seed();
    const run = async (extra: string[]): Promise<string[]> => {
      const lines: string[] = [];
      const code = await new DecisionPendingCommand().run(['--root', repo.root, ...extra], { cwd: repo.root, igetaRoot: IGETA_ROOT, stdout: (l) => lines.push(l), stderr: () => undefined });
      assert.equal(code, ExitCode.Ok);
      return lines;
    };
    const text = await run([]);
    assert.equal(text.at(-1), `NOTE ${PENDING_LIMIT_NOTE}`);
    assert.equal(text.length, 4);
    const json = JSON.parse((await run(['--json'])).join('\n')) as { pending: { number: string }[]; note: string };
    assert.deepEqual(json.pending.map((e) => e.number).sort(), ['0001', '0002', '0003']);
    assert.equal(json.note, PENDING_LIMIT_NOTE);
  });

  it('承認待ちが無ければ、その旨と限界の文言だけを出す', async () => {
    const repo = makeRepo();
    const lines: string[] = [];
    await new DecisionPendingCommand().run(['--root', repo.root], { cwd: repo.root, igetaRoot: IGETA_ROOT, stdout: (l) => lines.push(l), stderr: () => undefined });
    assert.deepEqual(lines, ['承認待ちの ADR は無い', `NOTE ${PENDING_LIMIT_NOTE}`]);
  });
});
