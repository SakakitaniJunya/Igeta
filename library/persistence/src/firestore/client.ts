/** Firestore クライアントの生成。SDK は @google-cloud/firestore だけを使う。 */
import { Firestore } from '@google-cloud/firestore';
import type { Settings } from '@google-cloud/firestore';

/** 環境変数の読み取り元。 */
export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * 接続設定を決める。projectId は引数 → GCP_PROJECT → GCLOUD_PROJECT の順で、どれも無ければ SDK の自動検出に任せる。
 * emulator 接続時は REST fallback が認証情報を要求して CI で落ちるため、preferRest を外して gRPC に倒す。
 */
export function firestoreSettings(projectId?: string, env: Environment = process.env): Settings {
  const settings: Settings = { preferRest: !env['FIRESTORE_EMULATOR_HOST'] };
  const resolvedProjectId = projectId ?? env['GCP_PROJECT'] ?? env['GCLOUD_PROJECT'];

  return resolvedProjectId ? { ...settings, projectId: resolvedProjectId } : settings;
}

/** Firestore クライアントを作る。 */
export function createFirestore(projectId?: string): Firestore {
  return new Firestore(firestoreSettings(projectId));
}
