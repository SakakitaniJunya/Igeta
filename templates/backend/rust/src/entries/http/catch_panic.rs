// handler が panic したら、プロセスを落とさず 500 INTERNAL_ERROR の JSON で返す (Hono の onError に当たる)。
// 中身 (panic の message) は応答に出さない。main.rs が app 全体 (fallback も) に掛ける。

use std::any::Any;

use axum::response::Response;
use tower_http::catch_panic::CatchPanicLayer;

use super::to_response::to_response;
use crate::shared::presentation::api_response::api_error;

fn internal_error(_panic: Box<dyn Any + Send + 'static>) -> Response {
    to_response(api_error(500, "INTERNAL_ERROR", "internal server error", None))
}

pub fn catch_panic_layer() -> CatchPanicLayer<fn(Box<dyn Any + Send + 'static>) -> Response> {
    CatchPanicLayer::custom(internal_error as fn(Box<dyn Any + Send + 'static>) -> Response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Router;
    use axum::body::Body;
    use axum::http::Request;
    use axum::routing::get;
    use http_body_util::BodyExt;
    use serde_json::{Value, json};
    use tower::ServiceExt;

    async fn boom() -> &'static str {
        panic!("secret detail");
    }

    #[tokio::test]
    async fn a_panicking_handler_becomes_500_internal_error_without_the_message() {
        let router = Router::new().route("/boom", get(boom)).layer(catch_panic_layer());
        let response = router.oneshot(Request::builder().uri("/boom").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status().as_u16(), 500);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            body,
            json!({ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "internal server error" } })
        );
    }
}
