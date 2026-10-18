// repository の port (型だけ)。ドメインの言葉のメソッドだけを出し、Firestore の型は出さない。
// async はジェネリクスで受ける (静的ディスパッチ)。usecase は `R: __Aggregate__Repository` として使う。

use std::future::Future;

use super::__aggregate__::{__Aggregate__, __Aggregate__Status};
use super::errors::DomainError;
use crate::shared::domain::app_error::AppError;
use crate::shared::domain::result::AppResult;

/// `transition` の失敗。どれが起きたかを usecase が見分けて AppError にする。
#[derive(Debug, PartialEq, Eq)]
pub enum TransitionError {
    /// 対象が無い。
    NotFound,
    /// domain の遷移が拒んだ (不変条件違反)。
    Domain(DomainError),
    /// 保存先の失敗。
    Store(AppError),
}

impl From<AppError> for TransitionError {
    fn from(error: AppError) -> Self {
        Self::Store(error)
    }
}

pub trait __Aggregate__Repository: Send + Sync {
    /// 無ければ None。形の悪い id も「見つからない」として扱う。
    fn find_by_id(&self, id: &str) -> impl Future<Output = AppResult<Option<__Aggregate__>>> + Send;

    /// status を省くと全部の状態。limit 件までを id の昇順で返す。
    fn list(&self, status: Option<__Aggregate__Status>, limit: usize) -> impl Future<Output = AppResult<Vec<__Aggregate__>>> + Send;

    fn save(&self, item: &__Aggregate__) -> impl Future<Output = AppResult<()>> + Send;

    /// 1 usecase = 1 Tx。読み → `transition` を適用 → 書く、を同じ Tx の中で行う。
    /// 遷移の規則は domain (`f`) が持ち、実装は規則を知らない。Tx が衝突すると `f` は読み直して再実行されるため、
    /// `f` は副作用を持たない関数にする。Tx の再実行で何度も呼ばれるので `'static` (所有する値だけを捕まえる)。
    fn transition<F>(&self, id: &str, f: F) -> impl Future<Output = Result<__Aggregate__, TransitionError>> + Send
    where
        F: Fn(__Aggregate__) -> Result<__Aggregate__, DomainError> + Send + Sync + 'static;
}
