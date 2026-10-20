// 組み立て: 環境変数 → Firestore → /healthz → fallback 404 → panic は 500 → serve。ここはテストを持たない (起動の配線だけ)。
// module も入口 (entries) もここでは登録しない。1 単位を展開したあと、`@igeta:register-*` の目印の上に足す (目印は消さない)。

use axum::Json;
use axum::Router;
use axum::response::Response;
use axum::routing::get;
use backend::entries::http::catch_panic::catch_panic_layer;
use backend::entries::http::to_response::to_response;
use backend::shared::infrastructure::env::require_env;
use backend::shared::infrastructure::firestore::create_firestore;
use backend::shared::presentation::api_response::api_error;
use serde_json::{Value, json};

// verify (署名・トークンの検証) はこのアプリがここで作って渡す。
// @igeta:register-verify

async fn healthz() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn not_found() -> Response {
    to_response(api_error(404, "NOT_FOUND", "route not found", None))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let project_id = require_env("GCP_PROJECT")?;
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());

    // 展開した module を使うまで未使用。
    #[allow(unused_variables)]
    let db = create_firestore(&project_id).await?;
    // module を組む: let <context> = backend::modules::<context>::create_module(db.clone());
    // @igeta:register-module

    let app = Router::new().route("/healthz", get(healthz));
    // 入口を付ける: let app = app.nest("/<前置き>", backend::entries::<entry>::routes(RoutesDeps { verify, <context> }));
    // @igeta:register-entry
    // handler の panic は 500 INTERNAL_ERROR の JSON にする (fallback も含め app 全体に掛ける)。
    let app = app.fallback(not_found).layer(catch_panic_layer());

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
