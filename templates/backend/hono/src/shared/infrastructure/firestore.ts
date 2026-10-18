// Firestore クライアント生成。
// SDK は @google-cloud/firestore のみ (firebase-admin は使わない)。preferRest: true で gRPC の初回接続待ちを避ける。
// ただし emulator 接続時は REST fallback が ADC (Google 認証情報) を要求して CI で落ちるため、
// 認証不要の gRPC insecure channel に倒す (本番経路は FIRESTORE_EMULATOR_HOST が無いので preferRest のまま)。

import { Firestore, type Settings } from '@google-cloud/firestore';
import type { Env } from './env.js';

/** 接続設定を決める。projectId は引数 → GCP_PROJECT → GCLOUD_PROJECT の順で、どれも無ければ SDK の自動検出に任せる。 */
export function firestoreSettings(projectId?: string, env: Env = process.env): Settings {
  const settings: Settings = { preferRest: !env['FIRESTORE_EMULATOR_HOST'] };
  const resolved = projectId ?? env['GCP_PROJECT'] ?? env['GCLOUD_PROJECT'];
  return resolved ? { ...settings, projectId: resolved } : settings;
}

export function createFirestore(projectId?: string): Firestore {
  return new Firestore(firestoreSettings(projectId));
}
