// モジュールの公開面が返す HttpResponse (フレームワークを知らない形) を、axum の応答にする。
// 本文が Value::Null なら空 (204 など)。それ以外は JSON。

use axum::body::Body;
use axum::http::{HeaderName, HeaderValue, StatusCode, header::CONTENT_TYPE};
use axum::response::Response;
use serde_json::Value;

use crate::shared::presentation::response::HttpResponse;

pub fn to_response(response: HttpResponse) -> Response {
    // 範囲外の status は雛形の呼び出し側の誤りなので、成功に見せず 500 にする。
    let status = StatusCode::from_u16(response.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let mut builder = Response::builder().status(status).header(CONTENT_TYPE, "application/json");
    for (name, value) in &response.headers {
        if let (Ok(name), Ok(value)) = (HeaderName::try_from(name.as_str()), HeaderValue::from_str(value)) {
            builder = builder.header(name, value);
        }
    }
    let body = match response.body {
        Value::Null => Body::empty(),
        value => Body::from(value.to_string()),
    };
    builder.body(body).unwrap_or_else(|_| Response::new(Body::empty()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;
    use serde_json::json;

    async fn text(response: Response) -> String {
        String::from_utf8(response.into_body().collect().await.unwrap().to_bytes().to_vec()).unwrap()
    }

    #[tokio::test]
    async fn status_and_json_body() {
        let response = to_response(HttpResponse { status: 201, body: json!({ "ok": true }), headers: vec![] });
        assert_eq!(response.status(), 201);
        assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
        assert_eq!(text(response).await, r#"{"ok":true}"#);
    }

    #[tokio::test]
    async fn extra_headers_are_added() {
        let headers = vec![("retry-after".to_string(), "3".to_string())];
        let response = to_response(HttpResponse { status: 429, body: json!({}), headers });
        assert_eq!(response.status(), 429);
        assert_eq!(response.headers()["retry-after"], "3");
    }

    #[tokio::test]
    async fn null_body_is_empty() {
        let response = to_response(HttpResponse { status: 204, body: Value::Null, headers: vec![] });
        assert_eq!(response.status(), 204);
        assert_eq!(text(response).await, "");
    }
}
