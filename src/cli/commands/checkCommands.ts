import type { Check } from '../../core/Check.js';
import { DocGraphCheck } from '../../checks/DocGraphCheck.js';
import { DocTemplateCheck } from '../../checks/DocTemplateCheck.js';
import { DomainDiagramDriftCheck } from '../../checks/DomainDiagramDriftCheck.js';
import { SecretScanCheck } from '../../checks/SecretScanCheck.js';
import type { ParsedArgs } from '../Args.js';
import { CheckCommand } from '../CheckCommand.js';

export class DocsGraphCommand extends CheckCommand {
  readonly name = 'docs-graph';
  readonly summary = '索引 (docs/dependencies.md・各 README) を生成して書き出す';
  override readonly usage = ['  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)'];

  protected createCheck(): Check {
    return new DocGraphCheck({ write: true });
  }
}

export class DocsCheckCommand extends CheckCommand {
  readonly name = 'docs-check';
  readonly summary = '索引と参照の整合性を検査する (書き出さない)';
  override readonly usage = ['  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)'];

  protected createCheck(): Check {
    return new DocGraphCheck();
  }
}

export class TemplateCheckCommand extends CheckCommand {
  readonly name = 'template-check';
  readonly summary = '設計書がテンプレートの必須構造を満たしているか検査する';
  override readonly usage = [
    '  --root <dir>       対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>       検査対象 (既定: <root>/docs)',
    '  --templates <dir>  テンプレ置き場 (既定: Igeta 自身の templates/docs)',
    '  --require-kind     kind 未設定の doc を違反として扱う',
  ];

  protected override readonly argSpec = {
    valueOptions: ['docs', 'templates'],
    boolOptions: ['require-kind'],
  };

  protected createCheck(args: ParsedArgs): Check {
    return new DocTemplateCheck({
      docsDir: args.get('docs'),
      templatesDir: args.get('templates'),
      requireKind: args.has('require-kind'),
    });
  }
}

export class DomainDriftCommand extends CheckCommand {
  readonly name = 'domain-drift';
  readonly summary = 'ドメイン図と実装の乖離を検査する';
  override readonly usage = [
    '  --root <dir>            対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>            図のディレクトリ (既定: <root>/docs/design/detail/domain)',
    '  --allow-missing-code    code_root 未実装なら図側のみ検証する',
  ];

  protected override readonly argSpec = {
    valueOptions: ['docs'],
    boolOptions: ['allow-missing-code'],
  };

  protected createCheck(args: ParsedArgs): Check {
    return new DomainDiagramDriftCheck({
      docsDir: args.get('docs'),
      allowMissingCode: args.has('allow-missing-code'),
    });
  }
}

export class SecretScanCommand extends CheckCommand {
  readonly name = 'secret-scan';
  readonly summary = '社内情報・認証情報が混入していないか全ファイルを走査する';
  override readonly usage = [
    '  --root <dir>        対象リポジトリ (既定: カレントディレクトリ)',
    '  --deny-list <file>  追加の禁止語リスト (既定: <root>/deny-list/names.txt)',
    '  --internal-ids      社内制約 ID (C- + 3 桁) も検出する。公開リポジトリ向けの任意規則で既定 OFF',
  ];

  protected override readonly argSpec = {
    valueOptions: ['deny-list'],
    boolOptions: ['internal-ids'],
  };

  protected createCheck(args: ParsedArgs): Check {
    return new SecretScanCheck({
      denyListPath: args.get('deny-list'),
      internalIds: args.has('internal-ids'),
    });
  }
}
