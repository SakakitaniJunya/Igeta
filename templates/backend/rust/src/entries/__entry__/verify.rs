// 入口の検証の雛形。検証に通らなければ、配下の経路を呼ばずに 401 を返す。
// 通ったら、検証済みの値 (Claims) を request の extensions に載せる。経路は Extension<Claims> で読む。
// 検証にはヘッダと URL だけを渡す。本文は渡さない (ここで読むと、経路が本文を読めなくなる)。
// 本文の HMAC が要る入口 (webhook など) は、本文を先に一度だけ読んでから確かめる形に差し替える。

use std::future::Future;
use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::{HeaderMap, Uri};
use axum::middleware::Next;
use axum::response::Response;

use crate::entries::http::to_response::to_response;
use crate::shared::domain::result::AppResult;
use crate::shared::presentation::api_response::api_error;

/// 検証済みの値。必要な項目だけを持つ。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Claims {
    pub subject: String,
}

pub struct VerifyRequest<'a> {
    pub headers: &'a HeaderMap,
    pub url: &'a Uri,
}

/// 署名・トークンの検証。実体は利用 repo の main.rs が作って routes に渡す。
pub trait Verifier: Send + Sync + 'static {
    fn verify(&self, request: VerifyRequest<'_>) -> impl Future<Output = AppResult<Claims>> + Send;
}

pub async fn verify_layer<V: Verifier>(State(verifier): State<Arc<V>>, mut request: Request, next: Next) -> Response {
    let verified = verifier
        .verify(VerifyRequest { headers: request.headers(), url: request.uri() })
        .await;
    match verified {
        Ok(claims) => {
            request.extensions_mut().insert(claims);
            next.run(request).await
        }
        Err(error) => to_response(api_error(401, "UNAUTHORIZED", &error.message, None)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::domain::app_error::AppError;
    use axum::Router;
    use axum::extract::Extension;
    use axum::middleware::from_fn_with_state;
    use axum::routing::get;
    use axum::body::Body;
    use tower::ServiceExt;

    struct Fake;

    impl Verifier for Fake {
        async fn verify(&self, request: VerifyRequest<'_>) -> AppResult<Claims> {
            match request.headers.get("authorization").and_then(|v| v.to_str().ok()) {
                Some("ok") => Ok(Claims { subject: request.url.path().to_string() }),
                _ => Err(AppError::unauthorized("bad token")),
            }
        }
    }

    fn app() -> Router {
        Router::new()
            .route("/me", get(|Extension(claims): Extension<Claims>| async move { claims.subject }))
            .layer(from_fn_with_state(Arc::new(Fake), verify_layer::<Fake>))
    }

    fn get_request(auth: Option<&str>) -> Request {
        let mut builder = Request::builder().uri("/me");
        if let Some(value) = auth {
            builder = builder.header("authorization", value);
        }
        builder.body(Body::empty()).unwrap()
    }

    #[tokio::test]
    async fn passes_claims_to_the_route() {
        let response = app().oneshot(get_request(Some("ok"))).await.unwrap();
        assert_eq!(response.status(), 200);
    }

    #[tokio::test]
    async fn fails_with_401_and_does_not_call_the_route() {
        let response = app().oneshot(get_request(Some("ng"))).await.unwrap();
        assert_eq!(response.status(), 401);
        let response = app().oneshot(get_request(None)).await.unwrap();
        assert_eq!(response.status(), 401);
    }
}
