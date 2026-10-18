// 形の検証 (serde)。serde を使ってよいのは module の presentation と infrastructure だけ (tests/architecture.rs の serde-only-in-presentation-and-infrastructure)。
// ここが見るのは型・必須・余計な項目 (本文と id だけ。query は未知の項目を捨てる)・query の形まで。意味 (名前の長さなど) は domain の値オブジェクトが見る。
// 入口 (entries/) は本文と id と query を Value のまま渡してくるので、controller がここで `parse` する。

use serde::de::{DeserializeOwned, Error as _};
use serde::{Deserialize, Deserializer};
use serde_json::Value;

use crate::modules::__context__::application::__Aggregate__Status;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Create__Aggregate__Body {
    pub name: String,
}

/// id は path の値。落ちたときに項目名 `id` を出すため、オブジェクトに包んで検査する。
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Close__Aggregate__Params {
    #[serde(deserialize_with = "non_empty")]
    pub id: String,
}

/// query は未知の項目を黙って捨てる (verify が使う `shop`・`signature` などが付くため)。本文と id は strict。
#[derive(Debug, Deserialize)]
pub struct List__Aggregate__sQuery {
    pub status: Option<StatusParam>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StatusParam {
    Open,
    Closed,
}

impl From<StatusParam> for __Aggregate__Status {
    fn from(param: StatusParam) -> Self {
        match param {
            StatusParam::Open => Self::Open,
            StatusParam::Closed => Self::Closed,
        }
    }
}

fn non_empty<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if value.is_empty() {
        return Err(D::Error::custom("must not be empty"));
    }
    Ok(value)
}

const ROOT: &str = "(root)";

/// Value を型に落とす。落ちたら、落ちた項目名の配列 (details)。
/// 余計な項目はその名前、必須欠けはその名前、本文全体の型違い (本文なし・オブジェクトでない) は `(root)`。
/// serde は最初の 1 件で止まるので、複数の項目が悪くても返るのは 1 つ。
pub fn parse<T: DeserializeOwned>(value: Value) -> Result<T, Vec<String>> {
    serde_path_to_error::deserialize(value).map_err(|error| {
        let path = error.path().to_string();
        if path != "." {
            return vec![path];
        }
        // 必須欠けは path が根のまま、message に項目名が入る。
        vec![missing_field(&error.inner().to_string()).unwrap_or_else(|| ROOT.to_string())]
    })
}

fn missing_field(message: &str) -> Option<String> {
    let rest = message.strip_prefix("missing field `")?;
    Some(rest.strip_suffix('`')?.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn details<T: DeserializeOwned>(value: Value) -> Option<Vec<String>> {
        parse::<T>(value).err()
    }

    fn names(list: &[&str]) -> Option<Vec<String>> {
        Some(list.iter().map(|s| s.to_string()).collect())
    }

    #[test]
    fn create_body_accepts_any_string_name() {
        assert!(parse::<Create__Aggregate__Body>(json!({ "name": "" })).is_ok());
    }

    #[test]
    fn create_body_wrong_type_missing_and_extra_name_the_field() {
        assert_eq!(details::<Create__Aggregate__Body>(json!({ "name": 1 })), names(&["name"]));
        assert_eq!(details::<Create__Aggregate__Body>(json!({})), names(&["name"]));
        assert_eq!(details::<Create__Aggregate__Body>(json!({ "name": "a", "extra": true })), names(&["extra"]));
    }

    #[test]
    fn create_body_non_object_is_root() {
        assert_eq!(details::<Create__Aggregate__Body>(Value::Null), names(&["(root)"]));
        assert_eq!(details::<Create__Aggregate__Body>(json!("text")), names(&["(root)"]));
    }

    #[test]
    fn close_params_reject_empty_and_wrong_type() {
        assert!(parse::<Close__Aggregate__Params>(json!({ "id": "a-1" })).is_ok());
        assert_eq!(details::<Close__Aggregate__Params>(json!({ "id": "" })), names(&["id"]));
        assert_eq!(details::<Close__Aggregate__Params>(json!({ "id": 1 })), names(&["id"]));
    }

    #[test]
    fn list_query_accepts_open_closed_or_nothing() {
        for query in [json!({}), json!({ "status": "open" }), json!({ "status": "closed" })] {
            assert!(parse::<List__Aggregate__sQuery>(query).is_ok());
        }
    }

    #[test]
    fn list_query_rejects_other_status() {
        assert_eq!(details::<List__Aggregate__sQuery>(json!({ "status": "done" })), names(&["status"]));
        assert_eq!(details::<List__Aggregate__sQuery>(json!({ "status": "" })), names(&["status"]));
    }

    #[test]
    fn list_query_ignores_unknown_keys() {
        assert!(parse::<List__Aggregate__sQuery>(json!({ "shop": "a", "signature": "s", "host": "h" })).is_ok());
        assert!(parse::<List__Aggregate__sQuery>(json!({ "limit": "5", "status": "open" })).is_ok());
    }

    #[test]
    fn status_param_maps_to_the_domain_status() {
        assert_eq!(__Aggregate__Status::from(StatusParam::Open), __Aggregate__Status::Open);
        assert_eq!(__Aggregate__Status::from(StatusParam::Closed), __Aggregate__Status::Closed);
    }
}
