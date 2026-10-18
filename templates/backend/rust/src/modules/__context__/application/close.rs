// usecase の雛形 (閉じる)。1 usecase = 1 Tx: 読み → 遷移 → 書きは repository の `transition` が同じ Tx で行う。
// 遷移の規則 (閉じ済みは閉じられない) は domain の `close()` が持つ。ここは失敗を AppError にするだけ。

use super::create::{__Aggregate__View, invalid_from};
use crate::modules::__context__::domain::{DomainError, __Aggregate__Repository, TransitionError};
use crate::shared::domain::app_error::AppError;
use crate::shared::domain::doc_id::is_valid_doc_id_segment;
use crate::shared::domain::result::AppResult;

pub struct Close__Aggregate__<R> {
    repository: R,
}

impl<R: __Aggregate__Repository> Close__Aggregate__<R> {
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn execute(&self, id: &str) -> AppResult<__Aggregate__View> {
        // id の形は、Tx に入る前に確かめる。
        if !is_valid_doc_id_segment(id) {
            return Err(AppError::invalid("id has an invalid format"));
        }
        match self.repository.transition(id, |item| item.close()).await {
            Ok(closed) => Ok(closed.into()),
            Err(TransitionError::NotFound) => Err(AppError::not_found(format!("__aggregate__ not found: {id}"))),
            Err(TransitionError::Domain(error @ DomainError::AlreadyClosed { .. })) => Err(AppError::conflict(error.to_string())),
            Err(TransitionError::Domain(error)) => Err(invalid_from(error)),
            Err(TransitionError::Store(error)) => Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::__context__::domain::{__Aggregate__, __Aggregate__Name, __Aggregate__Status};
    use crate::shared::domain::app_error::AppErrorKind;
    use std::sync::Mutex;

    struct Memory(Mutex<Vec<__Aggregate__>>);

    impl __Aggregate__Repository for Memory {
        async fn find_by_id(&self, _id: &str) -> AppResult<Option<__Aggregate__>> {
            Ok(None)
        }
        async fn list(&self, _status: Option<__Aggregate__Status>, _limit: usize) -> AppResult<Vec<__Aggregate__>> {
            Ok(Vec::new())
        }
        async fn save(&self, _item: &__Aggregate__) -> AppResult<()> {
            Ok(())
        }
        async fn transition<F>(&self, id: &str, f: F) -> Result<__Aggregate__, TransitionError>
        where
            F: Fn(__Aggregate__) -> Result<__Aggregate__, DomainError> + Send + Sync + 'static,
        {
            let mut rows = self.0.lock().unwrap();
            let row = rows.iter_mut().find(|r| r.id == id).ok_or(TransitionError::NotFound)?;
            let next = f(row.clone()).map_err(TransitionError::Domain)?;
            *row = next.clone();
            Ok(next)
        }
    }

    fn memory(status: __Aggregate__Status) -> Memory {
        Memory(Mutex::new(vec![__Aggregate__ { id: "a-1".to_string(), name: __Aggregate__Name::new("n").unwrap(), status }]))
    }

    #[tokio::test]
    async fn closes_an_open_item() {
        let close = Close__Aggregate__::new(memory(__Aggregate__Status::Open));
        let view = close.execute("a-1").await.unwrap();
        assert_eq!(view.status, __Aggregate__Status::Closed);
    }

    #[tokio::test]
    async fn missing_is_not_found() {
        let close = Close__Aggregate__::new(memory(__Aggregate__Status::Open));
        assert_eq!(close.execute("nope").await.unwrap_err().kind, AppErrorKind::NotFound);
    }

    #[tokio::test]
    async fn already_closed_is_conflict() {
        let close = Close__Aggregate__::new(memory(__Aggregate__Status::Closed));
        assert_eq!(close.execute("a-1").await.unwrap_err().kind, AppErrorKind::Conflict);
    }

    #[tokio::test]
    async fn bad_id_is_invalid_before_the_repository() {
        let close = Close__Aggregate__::new(memory(__Aggregate__Status::Open));
        assert_eq!(close.execute("a/b").await.unwrap_err().kind, AppErrorKind::Invalid);
    }

    #[tokio::test]
    async fn store_failure_passes_through() {
        struct Broken;
        impl __Aggregate__Repository for Broken {
            async fn find_by_id(&self, _id: &str) -> AppResult<Option<__Aggregate__>> {
                Ok(None)
            }
            async fn list(&self, _s: Option<__Aggregate__Status>, _l: usize) -> AppResult<Vec<__Aggregate__>> {
                Ok(Vec::new())
            }
            async fn save(&self, _item: &__Aggregate__) -> AppResult<()> {
                Ok(())
            }
            async fn transition<F>(&self, _id: &str, _f: F) -> Result<__Aggregate__, TransitionError>
            where
                F: Fn(__Aggregate__) -> Result<__Aggregate__, DomainError> + Send + Sync + 'static,
            {
                Err(AppError::unavailable("down").into())
            }
        }
        let error = Close__Aggregate__::new(Broken).execute("a-1").await.unwrap_err();
        assert_eq!(error.kind, AppErrorKind::Unavailable);
    }
}
