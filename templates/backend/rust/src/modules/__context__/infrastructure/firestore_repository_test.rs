// repository を本物の Firestore エミュレータに当てる。保存・絞り込み・読み戻し・Tx での遷移。
// エミュレータが無い (FIRESTORE_EMULATOR_HOST が無い) ときは理由を出して即 return する。

use std::sync::Mutex;

use serde_json::{Value, json};

use super::Firestore__Aggregate__Repository;
use crate::modules::__context__::domain::{
    DomainError, TransitionError, __Aggregate__, __Aggregate__Name, __Aggregate__Repository, __Aggregate__Status,
};
use crate::shared::domain::app_error::AppErrorKind;
use crate::shared::infrastructure::firestore::create_firestore;
use crate::shared::test_support::emulator::{EMULATOR_PROJECT, emulator_available, unique_id};

/// 壊れた doc を置く間は、status を絞らない list を走らせるテストと同時に走らせない (同じ emulator を共有するため)。
static UNFILTERED_LIST: Mutex<()> = Mutex::new(());

async fn repository() -> Firestore__Aggregate__Repository {
    Firestore__Aggregate__Repository::new(create_firestore(EMULATOR_PROJECT).await.unwrap())
}

fn item(id: &str, status: __Aggregate__Status) -> __Aggregate__ {
    __Aggregate__ { id: id.to_string(), name: __Aggregate__Name::new("名前").unwrap(), status }
}

#[tokio::test]
async fn save_then_find_returns_the_same_item() {
    if !emulator_available("save_then_find") {
        return;
    }
    let repository = repository().await;
    let saved = item(&unique_id("item"), __Aggregate__Status::Open);
    repository.save(&saved).await.unwrap();
    assert_eq!(repository.find_by_id(&saved.id).await.unwrap(), Some(saved));
}

#[tokio::test]
async fn find_missing_or_malformed_id_is_none() {
    if !emulator_available("find_missing") {
        return;
    }
    let repository = repository().await;
    assert_eq!(repository.find_by_id(&unique_id("missing")).await.unwrap(), None);
    assert_eq!(repository.find_by_id("a/b").await.unwrap(), None);
}

#[tokio::test]
async fn list_filters_by_status_and_respects_the_limit() {
    if !emulator_available("list_filters") {
        return;
    }
    let _guard = UNFILTERED_LIST.lock().unwrap_or_else(|e| e.into_inner());
    let repository = repository().await;
    let open = item(&unique_id("open"), __Aggregate__Status::Open);
    let closed = item(&unique_id("closed"), __Aggregate__Status::Closed);
    repository.save(&open).await.unwrap();
    repository.save(&closed).await.unwrap();

    let opens = repository.list(Some(__Aggregate__Status::Open), 1000).await.unwrap();
    assert!(opens.contains(&open));
    assert!(!opens.contains(&closed));
    assert!(opens.iter().all(|i| i.status == __Aggregate__Status::Open));

    let all = repository.list(None, 1000).await.unwrap();
    assert!(all.contains(&open) && all.contains(&closed));

    assert_eq!(repository.list(None, 1).await.unwrap().len(), 1);
}

#[tokio::test]
async fn transition_writes_the_new_state() {
    if !emulator_available("transition_writes") {
        return;
    }
    let repository = repository().await;
    let saved = item(&unique_id("item"), __Aggregate__Status::Open);
    repository.save(&saved).await.unwrap();

    let closed = repository.transition(&saved.id, |i| i.close()).await.unwrap();
    assert_eq!(closed.status, __Aggregate__Status::Closed);
    assert_eq!(repository.find_by_id(&saved.id).await.unwrap().unwrap().status, __Aggregate__Status::Closed);
}

#[tokio::test]
async fn transition_rejected_by_the_domain_changes_nothing() {
    if !emulator_available("transition_rejected") {
        return;
    }
    let repository = repository().await;
    let saved = item(&unique_id("item"), __Aggregate__Status::Closed);
    repository.save(&saved).await.unwrap();

    let result = repository.transition(&saved.id, |i| i.close()).await;
    assert_eq!(result, Err(TransitionError::Domain(DomainError::AlreadyClosed { id: saved.id.clone() })));
    assert_eq!(repository.find_by_id(&saved.id).await.unwrap(), Some(saved));
}

#[tokio::test]
async fn transition_on_a_missing_item_is_not_found() {
    if !emulator_available("transition_missing") {
        return;
    }
    let repository = repository().await;
    let result = repository.transition(&unique_id("missing"), |i| i.close()).await;
    assert_eq!(result, Err(TransitionError::NotFound));
}

const COLLECTION: &str = "__aggregates__";

/// repository を通さず、規則外の値をそのまま置く。
async fn put_raw(id: &str, doc: Value) {
    let db = create_firestore(EMULATOR_PROJECT).await.unwrap();
    db.fluent().update().in_col(COLLECTION).document_id(id).object(&doc).execute::<()>().await.unwrap();
}

async fn delete_raw(id: &str) {
    let db = create_firestore(EMULATOR_PROJECT).await.unwrap();
    db.fluent().delete().from(COLLECTION).document_id(id).execute().await.unwrap();
}

#[tokio::test]
async fn malformed_stored_docs_are_422_with_the_id_and_do_not_hide_the_good_ones() {
    if !emulator_available("malformed_stored") {
        return;
    }
    let _guard = UNFILTERED_LIST.lock().unwrap_or_else(|e| e.into_inner());
    let repository = repository().await;
    let good = item(&unique_id("good"), __Aggregate__Status::Open);
    repository.save(&good).await.unwrap();
    let long_name = unique_id("long-name");
    let bad_status = unique_id("bad-status");
    let bad_type = unique_id("bad-type");
    put_raw(&long_name, json!({ "name": "a".repeat(41), "status": "closed" })).await;
    put_raw(&bad_status, json!({ "name": "n", "status": "archived" })).await;
    put_raw(&bad_type, json!({ "name": 1, "status": "closed" })).await;

    for id in [&long_name, &bad_status, &bad_type] {
        let error = repository.find_by_id(id).await.unwrap_err();
        assert_eq!(error.kind, AppErrorKind::Unprocessable, "find {id}");
        assert_eq!(error.message, "stored __aggregate__ is malformed");
        assert_eq!(error.detail, Some(vec![id.clone()]));

        let result = repository.transition(id, |i| i.close()).await;
        assert_eq!(result.unwrap_err(), TransitionError::Store(error), "transition {id}");
    }
    // 1 件の壊れた doc で list 全体が 503 になるのではなく、422 で返る。
    assert_eq!(repository.list(None, 1000).await.unwrap_err().kind, AppErrorKind::Unprocessable);

    for id in [&long_name, &bad_status, &bad_type] {
        delete_raw(id).await;
    }
    assert_eq!(repository.find_by_id(&good.id).await.unwrap(), Some(good));
}
