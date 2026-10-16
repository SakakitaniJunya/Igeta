// Firestore クライアント生成。
// SDK は @google-cloud/firestore のみ (firebase-admin は使わない)。preferRest: true で gRPC の初回接続待ちを避ける。
// ただし emulator 接続時は REST fallback が ADC (Google 認証情報) を要求して CI で落ちるため、
// 認証不要の gRPC insecure channel に倒す (本番経路は FIRESTORE_EMULATOR_HOST が無いので preferRest のまま)。

import { Firestore } from '@google-cloud/firestore';

export function createFirestore(projectId?: string): Firestore {
  const settings = { preferRest: !process.env['FIRESTORE_EMULATOR_HOST'] };
  const resolved = projectId ?? process.env['GCP_PROJECT'] ?? process.env['GCLOUD_PROJECT'];
  return resolved ? new Firestore({ ...settings, projectId: resolved }) : new Firestore(settings);
}
