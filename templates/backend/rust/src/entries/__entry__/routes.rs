// 入口 (管理 API・proxy・webhook など) ごとの経路の雛形。置き場所: backend/src/entries/<入口>/。
// axum を使ってよいのは entries と main.rs だけ (tests/architecture.rs の axum-only-in-entries)。
// ここでやるのは 3 つだけ: 検証 layer を掛ける / リクエストから値を取り出す / module の公開面を呼んで応答にする。
// 取り出した本文と id は検証せず Value のまま渡す (形の検証は module の presentation、意味の検証は domain)。
// ここが見るのは本文の上限 (413) と JSON の構文 (400) まで。query の未知の項目は消さずに渡す。

use std::sync::Arc;

use axum::Router;
use axum::extract::{Path, RawQuery, Request, State};
use axum::middleware::from_fn_with_state;
use axum::response::Response;
use axum::routing::{get, post};
use serde_json::{Map, Value};

use super::verify::{Verifier, verify_layer};
use crate::entries::http::read_body::{BodyError, parse_json_body, read_body};
use crate::entries::http::to_response::to_response;
use crate::modules::__context__::__Context__Module;
use crate::shared::presentation::api_response::api_error;

/// 本文の上限 (バイト)。これを超えたら読むのをやめて 413。
pub const BODY_LIMIT_BYTES: usize = 16 * 1024;

pub struct RoutesDeps<V, M> {
    /// 署名・トークンの検証。実体は利用 repo の main.rs が作って渡す。
    pub verify: V,
    pub __context__: M,
}

fn malformed(message: &str) -> Response {
    to_response(api_error(400, "MALFORMED_REQUEST", message, None))
}

/// 本文を上限つきで読み、JSON の構文だけ見て Value で返す。空の本文は Value::Null。
async fn read_json(request: Request) -> Result<Value, Response> {
    let raw = read_body(request, BODY_LIMIT_BYTES).await.map_err(|error| match error {
        BodyError::TooLarge => to_response(api_error(413, "PAYLOAD_TOO_LARGE", "request body is too large", None)),
        BodyError::Malformed => malformed("request body is malformed JSON"),
    })?;
    parse_json_body(&raw).map_err(|_| malformed("request body is malformed JSON"))
}

/// query を {キー: 最初の値} の Value にする。壊れた `%` や不正な UTF-8 は serde_urlencoded が落とさず通す (実測)。
fn query_to_value(raw: Option<String>) -> Value {
    let pairs: Vec<(String, String)> = serde_urlencoded::from_str(raw.as_deref().unwrap_or("")).unwrap_or_default();
    let mut map = Map::new();
    for (key, value) in pairs {
        map.entry(key).or_insert(Value::String(value));
    }
    Value::Object(map)
}

/// main.rs で `.nest("/<入口の前置き>", routes(deps))` として付ける。
pub fn routes<V: Verifier, M: __Context__Module>(deps: RoutesDeps<V, M>) -> Router {
    Router::new()
        .route("/__aggregatesPath__", get(list::<M>).post(create::<M>))
        .route("/__aggregatesPath__/{id}/close", post(close::<M>))
        .layer(from_fn_with_state(Arc::new(deps.verify), verify_layer::<V>))
        .with_state(Arc::new(deps.__context__))
}

async fn list<M: __Context__Module>(State(module): State<Arc<M>>, RawQuery(raw): RawQuery) -> Response {
    to_response(module.list___aggregates__(query_to_value(raw)).await)
}

async fn create<M: __Context__Module>(State(module): State<Arc<M>>, request: Request) -> Response {
    match read_json(request).await {
        Ok(body) => to_response(module.create___aggregate__(body).await),
        Err(response) => response,
    }
}

async fn close<M: __Context__Module>(State(module): State<Arc<M>>, Path(id): Path<String>) -> Response {
    to_response(module.close___aggregate__(&id).await)
}
