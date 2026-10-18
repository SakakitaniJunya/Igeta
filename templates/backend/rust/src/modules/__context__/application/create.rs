// usecase の雛形 (作る)。application は domain と shared/domain だけに依存する (application-is-framework-free)。
// 意味の検証 (名前の長さ) は domain の値オブジェクトに任せ、外れたら invalid で返す。HTTP も Firestore も知らない。

use crate::modules::__context__::domain::{DomainError, __Aggregate__, __Aggregate__Name, __Aggregate__Repository, __Aggregate__Status};
use crate::shared::domain::app_error::AppError;
use crate::shared::domain::result::AppResult;

/// 外へ返す形。集約そのものは外に出さない。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct __Aggregate__View {
    pub id: String,
    pub name: String,
    pub status: __Aggregate__Status,
}

impl From<__Aggregate__> for __Aggregate__View {
    fn from(item: __Aggregate__) -> Self {
        Self { id: item.id, name: item.name.as_str().to_string(), status: item.status }
    }
}

pub(super) fn invalid_from(error: DomainError) -> AppError {
    AppError::invalid(error.to_string())
}

pub struct Create__Aggregate__<R, G> {
    repository: R,
    /// id の作り方は組み立て (mod.rs) が決めて注入する。
    new_id: G,
}

impl<R: __Aggregate__Repository, G: Fn() -> String + Send + Sync> Create__Aggregate__<R, G> {
    pub fn new(repository: R, new_id: G) -> Self {
        Self { repository, new_id }
    }

    pub async fn execute(&self, name: &str) -> AppResult<__Aggregate__View> {
        let name = __Aggregate__Name::new(name).map_err(invalid_from)?;
        let item = __Aggregate__ { id: (self.new_id)(), name, status: __Aggregate__Status::Open };
        self.repository.save(&item).await?;
        Ok(item.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Memory {
        saved: Mutex<Vec<__Aggregate__>>,
    }

    impl __Aggregate__Repository for Memory {
        async fn find_by_id(&self, _id: &str) -> AppResult<Option<__Aggregate__>> {
            Ok(None)
        }
        async fn list(&self, _status: Option<__Aggregate__Status>, _limit: usize) -> AppResult<Vec<__Aggregate__>> {
            Ok(Vec::new())
        }
        async fn save(&self, item: &__Aggregate__) -> AppResult<()> {
            self.saved.lock().unwrap().push(item.clone());
            Ok(())
        }
        async fn transition<F>(&self, _id: &str, _f: F) -> Result<__Aggregate__, crate::modules::__context__::domain::TransitionError>
        where
            F: Fn(__Aggregate__) -> Result<__Aggregate__, DomainError> + Send + Sync + 'static,
        {
            unreachable!("create は transition を呼ばない")
        }
    }

    #[tokio::test]
    async fn saves_an_open_item_with_the_generated_id() {
        let repository = Memory::default();
        let create = Create__Aggregate__::new(repository, || "a-1".to_string());
        let view = create.execute(" 名前 ").await.unwrap();
        assert_eq!(view, __Aggregate__View { id: "a-1".to_string(), name: "名前".to_string(), status: __Aggregate__Status::Open });
        assert_eq!(create.repository.saved.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn invalid_name_is_invalid_and_not_saved() {
        let create = Create__Aggregate__::new(Memory::default(), || "a-1".to_string());
        let error = create.execute("   ").await.unwrap_err();
        assert_eq!(error.kind, crate::shared::domain::app_error::AppErrorKind::Invalid);
        assert!(create.repository.saved.lock().unwrap().is_empty());
    }
}
