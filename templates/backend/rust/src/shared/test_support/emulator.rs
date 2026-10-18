// Firestore エミュレータを使うテスト (module の `*_test.rs`) の共通部品。テストは持たない。
// crate 内のテストから `crate::shared::test_support::emulator` で使う (`#[cfg(test)]` なので本番には入らない)。
// エミュレータが無いときは飛ばす。REQUIRE_EMULATOR=1 のときは飛ばさず落とす (CI で「飛ばして緑」にならないように)。
// 同じエミュレータを全部のテストが共有し、消さない。id は unique_id() でユニークにしてテスト同士を分ける。

/// エミュレータ専用の project 名 (demo- で始まる名前は実 project に繋がらない)。
pub const EMULATOR_PROJECT: &str = "demo-igeta";

/// エミュレータがあれば true。無ければ理由を出して false (呼び出し側は即 return する)。
pub fn emulator_available(test_name: &str) -> bool {
    if std::env::var("FIRESTORE_EMULATOR_HOST").is_ok_and(|v| !v.is_empty()) {
        return true;
    }
    if std::env::var("REQUIRE_EMULATOR").as_deref() == Ok("1") {
        panic!("Firestore エミュレータが必要 (REQUIRE_EMULATOR=1): FIRESTORE_EMULATOR_HOST が無い");
    }
    eprintln!("[skip] {test_name}: FIRESTORE_EMULATOR_HOST が無い。emulator 付きで走らせる");
    false
}

pub fn unique_id(prefix: &str) -> String {
    format!("{prefix}-{}", uuid::Uuid::new_v4())
}
