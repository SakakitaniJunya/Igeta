// 1 usecase = 1 Tx。`run_transaction` の中で「読む → domain の遷移を適用 → 書く」を行う。
// 遷移の規則は domain が持つ。ここは規則を知らず、渡された関数を適用するだけ。

use std::sync::Arc;

use firestore::FirestoreDb;
use firestore::errors::FirestoreError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::modules::__context__::domain::{DomainError, TransitionError, __Aggregate__, __Aggregate__Name, __Aggregate__Status};
use crate::shared::domain::app_error::AppError;

// doc の型 (serde)。domain へは変換してから渡す。
pub(super) const COLLECTION: &str = "__aggregates__";

/// 書き込み用の doc (serde。firestore の `object()` が Deserialize も要求する)。読み出しは `Stored__Aggregate__Doc` が受ける。
#[derive(Debug, Serialize, Deserialize)]
pub(super) struct __Aggregate__Doc {
    pub(super) name: String,
    pub(super) status: String,
}

impl __Aggregate__Doc {
    pub(super) fn from_domain(item: &__Aggregate__) -> Self {
        Self { name: item.name.as_str().to_string(), status: item.status.as_str().to_string() }
    }
}

/// 読み出し用の doc。型や値が規則外のものも落とさず Value で受け、`into_domain` が自前で判定する
/// (deserialize の失敗を通信失敗 503 と混ぜない。壊れた 1 件で list 全体を落とさない)。
#[derive(Debug, Deserialize)]
pub(super) struct Stored__Aggregate__Doc {
    pub(super) name: Value,
    pub(super) status: Value,
}

impl Stored__Aggregate__Doc {
    /// 保存済みデータが規則外 (name の型・長さ、status の値) なら 422 + doc id。
    pub(super) fn into_domain(self, id: &str) -> Result<__Aggregate__, AppError> {
        let malformed = || AppError::unprocessable("stored __aggregate__ is malformed").with_detail(vec![id.to_string()]);
        let status = match self.status.as_str() {
            Some("open") => __Aggregate__Status::Open,
            Some("closed") => __Aggregate__Status::Closed,
            _ => return Err(malformed()),
        };
        let name = self.name.as_str().and_then(|name| __Aggregate__Name::new(name).ok()).ok_or_else(malformed)?;
        Ok(__Aggregate__ { id: id.to_string(), name, status })
    }
}

/// list 用: 読み出しのときだけ doc id を `_firestore_id` として受ける。
#[derive(Debug, Deserialize)]
pub(super) struct Listed__Aggregate__Doc {
    #[serde(rename = "_firestore_id")]
    pub(super) id: String,
    pub(super) name: Value,
    pub(super) status: Value,
}

/// Tx の中で起きた結果。Ok として返し (= 書かずに Tx を閉じ)、外で TransitionError にする。
enum Outcome {
    NotFound,
    Rejected(DomainError),
    Malformed(AppError),
    Done(__Aggregate__),
}

pub(super) async fn transition_in_tx<F>(db: &FirestoreDb, id: &str, f: F) -> Result<__Aggregate__, TransitionError>
where
    F: Fn(__Aggregate__) -> Result<__Aggregate__, DomainError> + Send + Sync + 'static,
{
    // run_transaction は衝突のたびに closure を最初から呼び直す。所有権を持たせた共有物を毎回 clone して渡す。
    let f = Arc::new(f);
    let id: Arc<str> = Arc::from(id);
    let outcome = db
        .run_transaction(move |db, transaction| {
            let f = Arc::clone(&f);
            let id = Arc::clone(&id);
            Box::pin(async move {
                let doc: Option<Stored__Aggregate__Doc> = db.fluent().select().by_id_in(COLLECTION).obj().one(&*id).await?;
                let Some(doc) = doc else { return Ok(Outcome::NotFound) };
                let current = match doc.into_domain(&id) {
                    Ok(current) => current,
                    Err(error) => return Ok(Outcome::Malformed(error)),
                };
                match f(current) {
                    Ok(next) => {
                        db.fluent()
                            .update()
                            .in_col(COLLECTION)
                            .document_id(&*id)
                            .object(&__Aggregate__Doc::from_domain(&next))
                            .add_to_transaction(transaction)?;
                        Ok(Outcome::Done(next))
                    }
                    Err(error) => Ok(Outcome::Rejected(error)),
                }
            })
        })
        .await
        .map_err(store_error)?;
    match outcome {
        Outcome::NotFound => Err(TransitionError::NotFound),
        Outcome::Rejected(error) => Err(TransitionError::Domain(error)),
        Outcome::Malformed(error) => Err(TransitionError::Store(error)),
        Outcome::Done(next) => Ok(next),
    }
}

/// 保存先の失敗は内容を応答に出さない (ログにだけ残す)。
pub(super) fn store_error(error: FirestoreError) -> AppError {
    eprintln!("firestore error: {error}");
    AppError::unavailable("storage is unavailable")
}
