// 起動に必須の環境変数の検査。無い・空なら起動で落とす (値を仮定しない)。
// module ごとの設定は、その module の mod.rs が読む。ここは require_env だけ。

use std::fmt;

#[derive(Debug, PartialEq, Eq)]
pub struct MissingEnv(pub String);

impl fmt::Display for MissingEnv {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "missing required env var: {}", self.0)
    }
}

impl std::error::Error for MissingEnv {}

pub fn require_env(key: &str) -> Result<String, MissingEnv> {
    require_env_from(key, |k| std::env::var(k).ok())
}

/// 読み出し元を差し替えられる版 (テストは環境変数を書き換えずにこちらを使う)。
pub fn require_env_from(key: &str, lookup: impl Fn(&str) -> Option<String>) -> Result<String, MissingEnv> {
    match lookup(key) {
        Some(value) if !value.is_empty() => Ok(value),
        _ => Err(MissingEnv(key.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_empty_and_present() {
        assert_eq!(require_env_from("K", |_| None), Err(MissingEnv("K".to_string())));
        assert_eq!(require_env_from("K", |_| Some(String::new())), Err(MissingEnv("K".to_string())));
        assert_eq!(require_env_from("K", |_| Some("v".to_string())), Ok("v".to_string()));
    }

    #[test]
    fn message_names_the_key() {
        assert_eq!(MissingEnv("GCP_PROJECT".to_string()).to_string(), "missing required env var: GCP_PROJECT");
    }
}
