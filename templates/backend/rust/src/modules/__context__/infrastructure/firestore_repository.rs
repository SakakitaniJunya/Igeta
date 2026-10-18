// Firestore の repository。firestore crate を使ってよいのは infrastructure だけ (firestore-only-in-infrastructure)。
// doc の型は firestore_tx.rs と共有する (repository と Tx が互いを import しないよう、型は Tx 側に置く)。

use firestore::FirestoreDb;

use super::firestore_tx::{COLLECTION, Listed__Aggregate__Doc, Stored__Aggregate__Doc, __Aggregate__Doc, store_error, transition_in_tx};
use crate::modules::__context__::domain::{DomainError, TransitionError, __Aggregate__, __Aggregate__Repository, __Aggregate__Status};
use crate::shared::domain::doc_id::{assert_valid_doc_id_segment, is_valid_doc_id_segment};
use crate::shared::domain::result::AppResult;

#[derive(Clone)]
pub struct Firestore__Aggregate__Repository {
    db: FirestoreDb,
}

impl Firestore__Aggregate__Repository {
    pub fn new(db: FirestoreDb) -> Self {
        Self { db }
    }
}

impl __Aggregate__Repository for Firestore__Aggregate__Repository {
    async fn find_by_id(&self, id: &str) -> AppResult<Option<__Aggregate__>> {
        // `/` などを含む値で祖先のパスへ読みに行かせない。形の悪い id は「見つからない」として扱う。
        if !is_valid_doc_id_segment(id) {
            return Ok(None);
        }
        let doc: Option<Stored__Aggregate__Doc> = self
            .db
            .fluent()
            .select()
            .by_id_in(COLLECTION)
            .obj()
            .one(id)
            .await
            .map_err(store_error)?;
        doc.map(|doc| doc.into_domain(id)).transpose()
    }

    async fn list(&self, status: Option<__Aggregate__Status>, limit: usize) -> AppResult<Vec<__Aggregate__>> {
        // 並びは doc id の昇順 (Firestore の既定)。status の絞り込みは等価条件だけなので、複合 index は要らない。
        let status = status.map(|s| s.as_str());
        let limit = u32::try_from(limit).unwrap_or(u32::MAX);
        let rows: Vec<Listed__Aggregate__Doc> = self
            .db
            .fluent()
            .select()
            .from(COLLECTION)
            .filter(|q| status.and_then(|s| q.field("status").eq(s)))
            .limit(limit)
            .obj()
            .query()
            .await
            .map_err(store_error)?;
        rows.into_iter()
            .map(|row| {
                Stored__Aggregate__Doc { name: row.name, status: row.status }.into_domain(&row.id)
            })
            .collect()
    }

    async fn save(&self, item: &__Aggregate__) -> AppResult<()> {
        assert_valid_doc_id_segment(&item.id)?;
        self.db
            .fluent()
            .update()
            .in_col(COLLECTION)
            .document_id(&item.id)
            .object(&__Aggregate__Doc::from_domain(item))
            .execute::<()>()
            .await
            .map_err(store_error)
    }

    async fn transition<F>(&self, id: &str, f: F) -> Result<__Aggregate__, TransitionError>
    where
        F: Fn(__Aggregate__) -> Result<__Aggregate__, DomainError> + Send + Sync + 'static,
    {
        if !is_valid_doc_id_segment(id) {
            return Err(TransitionError::NotFound);
        }
        transition_in_tx(&self.db, id, f).await
    }
}
