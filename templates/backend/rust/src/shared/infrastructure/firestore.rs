// Firestore クライアントの生成。
// `FIRESTORE_EMULATOR_HOST` が設定されているときは、firestore crate が認証情報を探さず emulator へ繋ぐ
// (本番経路ではこの変数を設定しない)。接続先の切り替えはこの crate に任せ、ここでは再実装しない。

use firestore::{FirestoreDb, FirestoreResult};

pub async fn create_firestore(project_id: &str) -> FirestoreResult<FirestoreDb> {
    FirestoreDb::new(project_id).await
}
