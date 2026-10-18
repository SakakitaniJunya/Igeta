// repository を本物の Firestore エミュレータに当てる。保存・絞り込み・読み戻し・Tx での遷移。
// エミュレータが無い (FIRESTORE_EMULATOR_HOST が無い) ときは理由を出して即 return する。

#[path = "../src/shared/test_support/emulator.rs"]
mod emulator;

use backend::modules::__context__::domain::{
    DomainError, TransitionError, __Aggregate__, __Aggregate__Name, __Aggregate__Repository, __Aggregate__Status,
};
use backend::modules::__context__::infrastructure::Firestore__Aggregate__Repository;
use backend::shared::infrastructure::firestore::create_firestore;
use emulator::{EMULATOR_PROJECT, emulator_available, unique_id};

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
