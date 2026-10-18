// API 応答の形の唯一の作り手。成功と失敗の本文はここだけが作る。
//   成功: { ok: true, ...データ }
//   失敗: { ok: false, error: { code, message, details? } }

use serde_json::{Map, Value, json};

use super::response::HttpResponse;
use crate::shared::domain::app_error::{AppError, AppErrorKind};

/// 成功。データ (オブジェクト) は平らに載せる。
pub fn ok(status: u16, data: Value) -> HttpResponse {
    let mut body = Map::new();
    body.insert("ok".to_string(), Value::Bool(true));
    if let Value::Object(fields) = data {
        body.extend(fields);
    }
    HttpResponse { status, body: Value::Object(body), headers: Vec::new() }
}

/// 失敗。details が無ければキー自体を出さない。
pub fn api_error(status: u16, code: &str, message: &str, details: Option<Vec<String>>) -> HttpResponse {
    let mut error = json!({ "code": code, "message": message });
    if let (Some(details), Value::Object(map)) = (details, &mut error) {
        map.insert("details".to_string(), json!(details));
    }
    HttpResponse { status, body: json!({ "ok": false, "error": error }), headers: Vec::new() }
}

/// kind の表。match は網羅されるので、kind を足して表を直し忘れるとコンパイルで落ちる。
fn status_and_code(kind: AppErrorKind) -> (u16, &'static str) {
    match kind {
        AppErrorKind::Invalid => (400, "INVALID_REQUEST"),
        AppErrorKind::Unauthorized => (401, "UNAUTHORIZED"),
        AppErrorKind::NotFound => (404, "NOT_FOUND"),
        AppErrorKind::Conflict => (409, "CONFLICT"),
        AppErrorKind::Unprocessable => (422, "UNPROCESSABLE"),
        AppErrorKind::Unavailable => (503, "UNAVAILABLE"),
    }
}

pub fn fail(error: &AppError) -> HttpResponse {
    let (status, code) = status_and_code(error.kind);
    api_error(status, code, &error.message, error.detail.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ok_flattens_data() {
        let response = ok(201, json!({ "item": { "id": "a" } }));
        assert_eq!(response.status, 201);
        assert_eq!(response.body, json!({ "ok": true, "item": { "id": "a" } }));
    }

    #[test]
    fn api_error_omits_details_when_absent() {
        let response = api_error(400, "X", "m", None);
        assert_eq!(response.body, json!({ "ok": false, "error": { "code": "X", "message": "m" } }));
    }

    #[test]
    fn api_error_carries_details() {
        let response = api_error(400, "X", "m", Some(vec!["name".to_string()]));
        assert_eq!(response.body["error"]["details"], json!(["name"]));
    }

    #[test]
    fn fail_maps_every_kind() {
        let table = [
            (AppError::invalid("m"), 400, "INVALID_REQUEST"),
            (AppError::unauthorized("m"), 401, "UNAUTHORIZED"),
            (AppError::not_found("m"), 404, "NOT_FOUND"),
            (AppError::conflict("m"), 409, "CONFLICT"),
            (AppError::unprocessable("m"), 422, "UNPROCESSABLE"),
            (AppError::unavailable("m"), 503, "UNAVAILABLE"),
        ];
        for (error, status, code) in table {
            let response = fail(&error);
            assert_eq!(response.status, status);
            assert_eq!(response.body["error"]["code"], code);
            assert_eq!(response.body["ok"], false);
        }
    }

    #[test]
    fn fail_passes_detail_through() {
        let response = fail(&AppError::invalid("m").with_detail(vec!["id".to_string()]));
        assert_eq!(response.body["error"]["details"], json!(["id"]));
    }
}
