// usecase の雛形 (一覧)。上限つき: 上限を超える分は返さず、超えたことを truncated で伝える (黙って切り捨てない)。

use super::create::__Aggregate__View;
use crate::modules::__context__::domain::{__Aggregate__Repository, __Aggregate__Status};
use crate::shared::domain::result::AppResult;

/// 一覧で返す件数の上限。環境変数にはしない (変えるときはコードと一緒に変える)。
pub const LIST_LIMIT: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct List__Aggregate__sInput {
    /// 省くと全部の状態。
    pub status: Option<__Aggregate__Status>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct List__Aggregate__sOutput {
    pub items: Vec<__Aggregate__View>,
    /// 上限を超える分が残っているとき true。
    pub truncated: bool,
}

pub struct List__Aggregate__s<R> {
    repository: R,
    limit: usize,
}

impl<R: __Aggregate__Repository> List__Aggregate__s<R> {
    /// limit は 1 以上。組み立て (mod.rs) が LIST_LIMIT を渡す。
    pub fn new(repository: R, limit: usize) -> Self {
        Self { repository, limit }
    }

    pub async fn execute(&self, input: List__Aggregate__sInput) -> AppResult<List__Aggregate__sOutput> {
        // 1 件多く読み、上限を超えたかどうかだけを見る。
        let rows = self.repository.list(input.status, self.limit + 1).await?;
        let truncated = rows.len() > self.limit;
        let items = rows.into_iter().take(self.limit).map(__Aggregate__View::from).collect();
        Ok(List__Aggregate__sOutput { items, truncated })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::__context__::domain::{DomainError, TransitionError, __Aggregate__, __Aggregate__Name};
    use crate::shared::domain::app_error::AppError;
    use crate::shared::domain::result::AppResult;

    struct Memory(Vec<__Aggregate__>);

    fn item(id: &str, status: __Aggregate__Status) -> __Aggregate__ {
        __Aggregate__ { id: id.to_string(), name: __Aggregate__Name::new("n").unwrap(), status }
    }

    impl __Aggregate__Repository for Memory {
        async fn find_by_id(&self, _id: &str) -> AppResult<Option<__Aggregate__>> {
            Ok(None)
        }
        async fn list(&self, status: Option<__Aggregate__Status>, limit: usize) -> AppResult<Vec<__Aggregate__>> {
            Ok(self.0.iter().filter(|i| status.is_none_or(|s| s == i.status)).take(limit).cloned().collect())
        }
        async fn save(&self, _item: &__Aggregate__) -> AppResult<()> {
            Ok(())
        }
        async fn transition<F>(&self, _id: &str, _f: F) -> Result<__Aggregate__, TransitionError>
        where
            F: Fn(__Aggregate__) -> Result<__Aggregate__, DomainError> + Send + Sync + 'static,
        {
            Err(TransitionError::Store(AppError::unavailable("unused")))
        }
    }

    fn rows() -> Vec<__Aggregate__> {
        vec![
            item("a-1", __Aggregate__Status::Open),
            item("a-2", __Aggregate__Status::Closed),
            item("a-3", __Aggregate__Status::Open),
        ]
    }

    #[tokio::test]
    async fn filters_by_status() {
        let list = List__Aggregate__s::new(Memory(rows()), 10);
        let output = list.execute(List__Aggregate__sInput { status: Some(__Aggregate__Status::Open) }).await.unwrap();
        assert_eq!(output.items.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(), ["a-1", "a-3"]);
        assert!(!output.truncated);
    }

    #[tokio::test]
    async fn cuts_at_the_limit_and_says_so() {
        let list = List__Aggregate__s::new(Memory(rows()), 2);
        let output = list.execute(List__Aggregate__sInput { status: None }).await.unwrap();
        assert_eq!(output.items.len(), 2);
        assert!(output.truncated);
    }

    #[tokio::test]
    async fn exactly_the_limit_is_not_truncated() {
        let list = List__Aggregate__s::new(Memory(rows()), 3);
        let output = list.execute(List__Aggregate__sInput { status: None }).await.unwrap();
        assert_eq!(output.items.len(), 3);
        assert!(!output.truncated);
    }
}
