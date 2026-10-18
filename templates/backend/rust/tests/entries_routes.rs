// 入口の経路のテスト。サーバを立てず `oneshot` で投げる。verify と module の公開面は偽物にし、
// 「検証に落ちたら配下を呼ばない」「本文と id が Value のまま渡る」「本文の上限と JSON 構文」「応答がそのまま返る」を確かめる。

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Body;
use axum::http::Request;
use backend::entries::__entry__::{BODY_LIMIT_BYTES, Claims, RoutesDeps, Verifier, VerifyRequest, routes};
use backend::modules::__context__::__Context__Module;
use backend::shared::domain::app_error::AppError;
use backend::shared::domain::result::AppResult;
use backend::shared::presentation::response::HttpResponse;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

struct FakeVerifier;

impl Verifier for FakeVerifier {
    async fn verify(&self, request: VerifyRequest<'_>) -> AppResult<Claims> {
        match request.headers.get("authorization") {
            Some(_) => Ok(Claims { subject: "user-1".to_string() }),
            None => Err(AppError::unauthorized("bad signature")),
        }
    }
}

type Calls = Arc<Mutex<Vec<(String, Value)>>>;

struct FakeModule(Calls);

impl FakeModule {
    fn record(&self, name: &str, value: Value) {
        self.0.lock().unwrap().push((name.to_string(), value));
    }
}

fn reply(status: u16, body: Value) -> HttpResponse {
    HttpResponse { status, body, headers: vec![] }
}

impl __Context__Module for FakeModule {
    async fn list___aggregates__(&self, query: Value) -> HttpResponse {
        self.record("list", query);
        reply(200, json!({ "ok": true, "items": [], "truncated": false }))
    }

    async fn create___aggregate__(&self, body: Value) -> HttpResponse {
        self.record("create", body);
        reply(201, json!({ "ok": true, "item": { "id": "a-1" } }))
    }

    async fn close___aggregate__(&self, id: &str) -> HttpResponse {
        self.record("close", json!(id));
        reply(200, json!({ "ok": true, "item": { "id": "a-1" } }))
    }
}

fn app() -> (Router, Calls) {
    let calls = Calls::default();
    let router = routes(RoutesDeps { verify: FakeVerifier, __context__: FakeModule(Arc::clone(&calls)) });
    (router, calls)
}

fn request(method: &str, path: &str, body: Body, authorized: bool) -> Request<Body> {
    let mut builder = Request::builder().method(method).uri(path).header("content-type", "application/json");
    if authorized {
        builder = builder.header("authorization", "t");
    }
    builder.body(body).unwrap()
}

async fn send(router: Router, request: Request<Body>) -> (u16, Value) {
    let response = router.oneshot(request).await.unwrap();
    let status = response.status().as_u16();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

#[tokio::test]
async fn unauthorized_is_401_on_every_route_and_the_module_is_not_called() {
    for (method, path) in [("GET", "/__aggregates__"), ("POST", "/__aggregates__"), ("POST", "/__aggregates__/a-1/close")] {
        let (router, calls) = app();
        let (status, body) = send(router, request(method, path, Body::from("{}"), false)).await;
        assert_eq!(status, 401, "{method} {path}");
        assert_eq!(body["error"]["code"], "UNAUTHORIZED");
        assert!(calls.lock().unwrap().is_empty());
    }
}

#[tokio::test]
async fn get_passes_the_query_as_it_is() {
    let (router, calls) = app();
    let (status, body) = send(router, request("GET", "/__aggregates__?status=open", Body::empty(), true)).await;
    assert_eq!(status, 200);
    assert_eq!(body, json!({ "ok": true, "items": [], "truncated": false }));
    assert_eq!(calls.lock().unwrap().as_slice(), [("list".to_string(), json!({ "status": "open" }))]);
}

#[tokio::test]
async fn post_passes_the_body_without_validating_it() {
    let (router, calls) = app();
    let (status, _) = send(router, request("POST", "/__aggregates__", Body::from(r#"{"name":1,"extra":true}"#), true)).await;
    assert_eq!(status, 201);
    assert_eq!(calls.lock().unwrap().as_slice(), [("create".to_string(), json!({ "name": 1, "extra": true }))]);
}

#[tokio::test]
async fn post_with_an_empty_body_passes_null() {
    let (router, calls) = app();
    send(router, request("POST", "/__aggregates__", Body::empty(), true)).await;
    assert_eq!(calls.lock().unwrap().as_slice(), [("create".to_string(), Value::Null)]);
}

#[tokio::test]
async fn post_with_broken_json_is_400_and_the_module_is_not_called() {
    let (router, calls) = app();
    let (status, body) = send(router, request("POST", "/__aggregates__", Body::from("{oops"), true)).await;
    assert_eq!(status, 400);
    assert_eq!(body["error"]["code"], "MALFORMED_REQUEST");
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn post_over_the_limit_is_413_and_the_module_is_not_called() {
    let (router, calls) = app();
    let big = json!({ "name": "x".repeat(BODY_LIMIT_BYTES) }).to_string();
    let (status, body) = send(router, request("POST", "/__aggregates__", Body::from(big), true)).await;
    assert_eq!(status, 413);
    assert_eq!(body["error"]["code"], "PAYLOAD_TOO_LARGE");
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn close_passes_the_path_id() {
    let (router, calls) = app();
    let (status, _) = send(router, request("POST", "/__aggregates__/a-1/close", Body::empty(), true)).await;
    assert_eq!(status, 200);
    assert_eq!(calls.lock().unwrap().as_slice(), [("close".to_string(), json!("a-1"))]);
}
