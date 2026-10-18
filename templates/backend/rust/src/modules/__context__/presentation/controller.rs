// controller の雛形。axum を知らない関数にする。入力は Value、出力は HttpResponse。
// 入口 (src/entries/<入口>/routes.rs) がリクエストから値を取り出して module の公開面 (mod.rs) 経由でここを呼ぶ。
// 流れは「schema に parse → 落ちたら 400 VALIDATION_FAILED + details → 通ったら usecase → ok / fail」。
// usecase は AppResult を返し、HttpResponse を組むのはここ。

use serde_json::{Value, json};

use super::schemas::{Close__Aggregate__Params, Create__Aggregate__Body, List__Aggregate__sQuery, parse};
use crate::modules::__context__::application::{
    Close__Aggregate__, Create__Aggregate__, List__Aggregate__s, List__Aggregate__sInput, __Aggregate__Repository, __Aggregate__View,
};
use crate::shared::presentation::api_response::{api_error, fail, ok};
use crate::shared::presentation::response::HttpResponse;

fn validation_failed(details: Vec<String>) -> HttpResponse {
    api_error(400, "VALIDATION_FAILED", "request validation failed", Some(details))
}

fn view_json(view: &__Aggregate__View) -> Value {
    json!({ "id": view.id, "name": view.name, "status": view.status.as_str() })
}

pub async fn handle_list___aggregates__<R: __Aggregate__Repository>(use_case: &List__Aggregate__s<R>, query: Value) -> HttpResponse {
    let query = match parse::<List__Aggregate__sQuery>(query) {
        Ok(query) => query,
        Err(details) => return validation_failed(details),
    };
    let input = List__Aggregate__sInput { status: query.status.map(Into::into) };
    match use_case.execute(input).await {
        Ok(output) => {
            let items: Vec<Value> = output.items.iter().map(view_json).collect();
            ok(200, json!({ "items": items, "truncated": output.truncated }))
        }
        Err(error) => fail(&error),
    }
}

pub async fn handle_create___aggregate__<R, G>(use_case: &Create__Aggregate__<R, G>, body: Value) -> HttpResponse
where
    R: __Aggregate__Repository,
    G: Fn() -> String + Send + Sync,
{
    let body = match parse::<Create__Aggregate__Body>(body) {
        Ok(body) => body,
        Err(details) => return validation_failed(details),
    };
    match use_case.execute(&body.name).await {
        Ok(view) => ok(201, json!({ "item": view_json(&view) })),
        Err(error) => fail(&error),
    }
}

pub async fn handle_close___aggregate__<R: __Aggregate__Repository>(use_case: &Close__Aggregate__<R>, id: &str) -> HttpResponse {
    let params = match parse::<Close__Aggregate__Params>(json!({ "id": id })) {
        Ok(params) => params,
        Err(details) => return validation_failed(details),
    };
    match use_case.execute(&params.id).await {
        Ok(view) => ok(200, json!({ "item": view_json(&view) })),
        Err(error) => fail(&error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::__context__::domain::{DomainError, TransitionError, __Aggregate__, __Aggregate__Name, __Aggregate__Status};
    use crate::shared::domain::app_error::AppError;
    use crate::shared::domain::result::AppResult;

    /// 決めた失敗か、決めた 1 件を返す偽の repository。
    struct Fake(Result<__Aggregate__, AppError>);

    impl __Aggregate__Repository for Fake {
        async fn find_by_id(&self, _id: &str) -> AppResult<Option<__Aggregate__>> {
            self.0.clone().map(Some)
        }
        async fn list(&self, _s: Option<__Aggregate__Status>, _l: usize) -> AppResult<Vec<__Aggregate__>> {
            self.0.clone().map(|i| vec![i])
        }
        async fn save(&self, _item: &__Aggregate__) -> AppResult<()> {
            self.0.clone().map(|_| ())
        }
        async fn transition<F>(&self, _id: &str, f: F) -> Result<__Aggregate__, TransitionError>
        where
            F: Fn(__Aggregate__) -> Result<__Aggregate__, DomainError> + Send + Sync + 'static,
        {
            let item = self.0.clone()?;
            f(item).map_err(TransitionError::Domain)
        }
    }

    fn item() -> __Aggregate__ {
        __Aggregate__ { id: "a-1".to_string(), name: __Aggregate__Name::new("n").unwrap(), status: __Aggregate__Status::Open }
    }

    fn all_errors() -> [(AppError, u16, &'static str); 6] {
        [
            (AppError::invalid("m"), 400, "INVALID_REQUEST"),
            (AppError::unauthorized("m"), 401, "UNAUTHORIZED"),
            (AppError::not_found("m"), 404, "NOT_FOUND"),
            (AppError::conflict("m"), 409, "CONFLICT"),
            (AppError::unprocessable("m"), 422, "UNPROCESSABLE"),
            (AppError::unavailable("m"), 503, "UNAVAILABLE"),
        ]
    }

    #[tokio::test]
    async fn list_ok_and_every_error_kind() {
        let response = handle_list___aggregates__(&List__Aggregate__s::new(Fake(Ok(item())), 10), json!({})).await;
        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({ "ok": true, "items": [{ "id": "a-1", "name": "n", "status": "open" }], "truncated": false })
        );
        for (error, status, code) in all_errors() {
            let response = handle_list___aggregates__(&List__Aggregate__s::new(Fake(Err(error)), 10), json!({})).await;
            assert_eq!((response.status, response.body["error"]["code"].as_str()), (status, Some(code)));
        }
    }

    #[tokio::test]
    async fn list_bad_query_is_validation_failed_with_details() {
        let response = handle_list___aggregates__(&List__Aggregate__s::new(Fake(Ok(item())), 10), json!({ "status": "done" })).await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["error"]["code"], "VALIDATION_FAILED");
        assert_eq!(response.body["error"]["details"], json!(["status"]));
    }

    #[tokio::test]
    async fn create_is_201_and_every_error_kind() {
        let create = |r| Create__Aggregate__::new(Fake(r), || "a-1".to_string());
        let response = handle_create___aggregate__(&create(Ok(item())), json!({ "name": "n" })).await;
        assert_eq!(response.status, 201);
        assert_eq!(response.body["item"]["status"], "open");
        for (error, status, code) in all_errors() {
            let response = handle_create___aggregate__(&create(Err(error)), json!({ "name": "n" })).await;
            assert_eq!((response.status, response.body["error"]["code"].as_str()), (status, Some(code)));
        }
    }

    #[tokio::test]
    async fn create_bad_body_is_validation_failed() {
        let create = Create__Aggregate__::new(Fake(Ok(item())), || "a-1".to_string());
        let response = handle_create___aggregate__(&create, json!({ "name": 1 })).await;
        assert_eq!(response.body["error"]["details"], json!(["name"]));
        let response = handle_create___aggregate__(&create, Value::Null).await;
        assert_eq!(response.body["error"]["details"], json!(["(root)"]));
    }

    #[tokio::test]
    async fn create_semantic_error_is_invalid_request_without_details() {
        let create = Create__Aggregate__::new(Fake(Ok(item())), || "a-1".to_string());
        let response = handle_create___aggregate__(&create, json!({ "name": "  " })).await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["error"]["code"], "INVALID_REQUEST");
        assert!(response.body["error"].get("details").is_none());
    }

    #[tokio::test]
    async fn close_ok_conflict_and_empty_id() {
        let response = handle_close___aggregate__(&Close__Aggregate__::new(Fake(Ok(item()))), "a-1").await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["item"]["status"], "closed");

        let closed = __Aggregate__ { status: __Aggregate__Status::Closed, ..item() };
        let response = handle_close___aggregate__(&Close__Aggregate__::new(Fake(Ok(closed))), "a-1").await;
        assert_eq!((response.status, response.body["error"]["code"].as_str()), (409, Some("CONFLICT")));

        let response = handle_close___aggregate__(&Close__Aggregate__::new(Fake(Ok(item()))), "").await;
        assert_eq!(response.body["error"]["details"], json!(["id"]));
    }

    #[tokio::test]
    async fn close_store_errors_use_the_kind_table() {
        for (error, status, code) in all_errors() {
            let response = handle_close___aggregate__(&Close__Aggregate__::new(Fake(Err(error))), "a-1").await;
            assert_eq!((response.status, response.body["error"]["code"].as_str()), (status, Some(code)));
        }
    }
}
