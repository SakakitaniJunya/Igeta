// Firestore クライアント生成。
// SDK は @google-cloud/firestore のみ (firebase-admin は使わない)。preferRest: true で gRPC の初回接続待ちを避ける。
// ただし emulator 接続時は REST fallback が Google の認証情報を要求して CI で落ちるため、
// 認証不要の gRPC insecure channel に倒す (本番経路は FIRESTORE_EMULATOR_HOST が無いので preferRest のまま)。

import { Firestore } from '@google-cloud/firestore';

export interface FirestoreSettings {
  readonly preferRest: boolean;
  readonly projectId?: string;
}

/** 環境変数から接続の設定を決める。projectId は引数 → GCP_PROJECT → GCLOUD_PROJECT の順。 */
export function resolveFirestoreSettings(
  env: Readonly<Record<string, string | undefined>>,
  projectId?: string,
): FirestoreSettings {
  const preferRest = !env['FIRESTORE_EMULATOR_HOST'];
  const resolved = projectId ?? env['GCP_PROJECT'] ?? env['GCLOUD_PROJECT'];
  return resolved ? { preferRest, projectId: resolved } : { preferRest };
}

export function createFirestore(projectId?: string): Firestore {
  return new Firestore(resolveFirestoreSettings(process.env, projectId));
}
