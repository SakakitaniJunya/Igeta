// 要求の本文を上限つきで読み、JSON の構文まで見て Value で返す。中身 (項目) は見ない。
// content-length が上限を超えていれば読まずに返す。無くても、読んだ量が上限を超えた時点で読むのをやめる。

use axum::body::Bytes;
use axum::extract::Request;
use axum::http::header::CONTENT_LENGTH;
use http_body_util::{BodyExt, LengthLimitError, Limited};
use serde_json::Value;

#[derive(Debug, PartialEq, Eq)]
pub enum BodyError {
    /// 上限を超えた (413)。
    TooLarge,
    /// 本文を最後まで読めなかった、または JSON として読めない (400)。
    Malformed,
}

pub async fn read_body(request: Request, limit: usize) -> Result<Bytes, BodyError> {
    let declared = request
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok());
    if declared.is_some_and(|n| n > limit) {
        return Err(BodyError::TooLarge);
    }
    match Limited::new(request.into_body(), limit).collect().await {
        Ok(collected) => Ok(collected.to_bytes()),
        Err(error) if error.is::<LengthLimitError>() => Err(BodyError::TooLarge),
        Err(_) => Err(BodyError::Malformed),
    }
}

/// 本文が空なら `Value::Null`。JSON として読めなければ Malformed。
pub fn parse_json_body(raw: &[u8]) -> Result<Value, BodyError> {
    if raw.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(raw).map_err(|_| BodyError::Malformed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use serde_json::json;

    fn post(body: Body) -> Request {
        Request::builder().method("POST").uri("/x").body(body).unwrap()
    }

    #[tokio::test]
    async fn within_limit_returns_the_bytes() {
        let raw = read_body(post(Body::from(r#"{"a":1}"#)), 100).await.unwrap();
        assert_eq!(&raw[..], br#"{"a":1}"#);
    }

    #[tokio::test]
    async fn declared_length_over_limit_is_rejected_without_reading() {
        let request = Request::builder()
            .method("POST")
            .uri("/x")
            .header(CONTENT_LENGTH, "1000")
            .body(Body::from("x"))
            .unwrap();
        assert_eq!(read_body(request, 10).await, Err(BodyError::TooLarge));
    }

    #[tokio::test]
    async fn body_over_limit_is_rejected_without_content_length() {
        assert_eq!(read_body(post(Body::from("x".repeat(16))), 10).await, Err(BodyError::TooLarge));
    }

    #[tokio::test]
    async fn empty_body_is_empty_bytes() {
        let raw = read_body(post(Body::empty()), 10).await.unwrap();
        assert!(raw.is_empty());
    }

    #[test]
    fn parse_returns_value_null_for_empty_and_malformed_for_broken() {
        assert_eq!(parse_json_body(br#"{"a":1}"#), Ok(json!({ "a": 1 })));
        assert_eq!(parse_json_body(b""), Ok(Value::Null));
        assert_eq!(parse_json_body(b"{oops"), Err(BodyError::Malformed));
    }
}
