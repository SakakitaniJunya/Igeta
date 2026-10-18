// __context__ module の公開面。入口 (entries) と他の module は、このファイルの公開面だけを通して使う
// (tests/architecture.rs の cross-module-through-mod-only・entries-go-through-module-mod)。
// ここに置いてよいのは、組み立て (create_module)・公開の型だけ。

use std::future::Future;

use firestore::FirestoreDb;
use serde_json::Value;

use self::application::{Close__Aggregate__, Create__Aggregate__, LIST_LIMIT, List__Aggregate__s};
use self::infrastructure::Firestore__Aggregate__Repository;
use self::presentation::{handle_close___aggregate__, handle_create___aggregate__, handle_list___aggregates__};
use crate::shared::presentation::response::HttpResponse;

pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod presentation;

/// 入口 (axum の経路) から呼ぶ関数の表。入口は検証せず、本文・id・query を Value のまま渡す。
/// 形の検証はこの中の controller (serde) が行い、HttpResponse を返す。
pub trait __Context__Module: Send + Sync + 'static {
    fn list___aggregates__(&self, query: Value) -> impl Future<Output = HttpResponse> + Send;
    fn create___aggregate__(&self, body: Value) -> impl Future<Output = HttpResponse> + Send;
    fn close___aggregate__(&self, id: &str) -> impl Future<Output = HttpResponse> + Send;
}

struct Wiring {
    list: List__Aggregate__s<Firestore__Aggregate__Repository>,
    create: Create__Aggregate__<Firestore__Aggregate__Repository, fn() -> String>,
    close: Close__Aggregate__<Firestore__Aggregate__Repository>,
}

impl __Context__Module for Wiring {
    async fn list___aggregates__(&self, query: Value) -> HttpResponse {
        handle_list___aggregates__(&self.list, query).await
    }

    async fn create___aggregate__(&self, body: Value) -> HttpResponse {
        handle_create___aggregate__(&self.create, body).await
    }

    async fn close___aggregate__(&self, id: &str) -> HttpResponse {
        handle_close___aggregate__(&self.close, id).await
    }
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// 依存を組み立てる。呼ぶのは main.rs (組み立ての場所) だけ。
pub fn create_module(db: FirestoreDb) -> impl __Context__Module {
    let repository = Firestore__Aggregate__Repository::new(db);
    Wiring {
        list: List__Aggregate__s::new(repository.clone(), LIST_LIMIT),
        create: Create__Aggregate__::new(repository.clone(), new_id as fn() -> String),
        close: Close__Aggregate__::new(repository),
    }
}
