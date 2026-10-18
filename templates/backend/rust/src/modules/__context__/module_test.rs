// 公開面 (create_module) の配線のテスト。本物の部品を組み立て、エミュレータ越しに
// 「公開面の関数 → controller → usecase → Firestore」が 1 本につながっていることを確かめる。
// エミュレータが無いときは理由を出して即 return する。

use super::{__Context__Module, create_module};
use crate::shared::infrastructure::firestore::create_firestore;
use crate::shared::test_support::emulator::{EMULATOR_PROJECT, emulator_available, unique_id};
use serde_json::{Value, json};

async fn module() -> impl __Context__Module {
    create_module(create_firestore(EMULATOR_PROJECT).await.unwrap())
}

#[tokio::test]
async fn create_list_close_are_connected_through_firestore() {
    if !emulator_available("create_list_close") {
        return;
    }
    let module = module().await;

    let created = module.create___aggregate__(json!({ "name": "名前" })).await;
    assert_eq!(created.status, 201);
    let item = created.body["item"].clone();
    assert_eq!((item["name"].as_str(), item["status"].as_str()), (Some("名前"), Some("open")));
    let id = item["id"].as_str().unwrap().to_string();

    let listed = module.list___aggregates__(json!({ "status": "open" })).await;
    assert_eq!(listed.status, 200);
    let ids: Vec<&str> = listed.body["items"].as_array().unwrap().iter().filter_map(|i| i["id"].as_str()).collect();
    assert!(ids.contains(&id.as_str()));

    let closed = module.close___aggregate__(&id).await;
    assert_eq!(closed.status, 200);
    assert_eq!(closed.body["item"]["status"], "closed");

    assert_eq!(module.close___aggregate__(&id).await.status, 409);
}

#[tokio::test]
async fn closing_a_missing_id_is_404() {
    if !emulator_available("close_missing") {
        return;
    }
    assert_eq!(module().await.close___aggregate__(&unique_id("missing")).await.status, 404);
}

#[tokio::test]
async fn a_bad_body_is_400_validation_failed() {
    if !emulator_available("bad_body") {
        return;
    }
    let response = module().await.create___aggregate__(json!({ "name": 1 })).await;
    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"]["code"], "VALIDATION_FAILED");
    assert_eq!(response.body["error"]["details"], Value::from(vec!["name"]));
}
