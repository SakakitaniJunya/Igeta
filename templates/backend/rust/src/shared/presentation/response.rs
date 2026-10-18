// presentation 層が共通で使う HTTP 応答の形。フレームワークを知らない。
// 失敗の本文を作るのは api_response.rs だけ。

use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct HttpResponse {
    pub status: u16,
    /// `Value::Null` は本文なし (204 など)。
    pub body: Value,
    /// 追加のヘッダ (例: 429 の retry-after)。空なら content-type だけ。
    pub headers: Vec<(String, String)>,
}
