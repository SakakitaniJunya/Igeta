// Firestore の doc ID (の一部) に埋め込む前に必ず通す allow-list 検証。
// `/` を含む値を許すと意図しない祖先パスへ読み書きする (パス注入)。
// 英数字・`_`・`-` の 1〜64 文字だけを通すので、`.` や `..` (doc ID に使えない値) も落ちる。

use super::app_error::AppError;
use super::result::AppResult;

pub fn is_valid_doc_id_segment(value: &str) -> bool {
    (1..=64).contains(&value.len()) && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// 不正なら invalid を返す。生の値はメッセージに残さない (値そのものが攻撃対象や個人情報を含みうるため)。
pub fn assert_valid_doc_id_segment(value: &str) -> AppResult<()> {
    if is_valid_doc_id_segment(value) {
        Ok(())
    } else {
        Err(AppError::invalid("invalid doc id segment"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_and_rejects_by_table() {
        let long = "a".repeat(65);
        let max = "a".repeat(64);
        let table: [(&str, bool); 10] = [
            ("a-1", true),
            ("A_b-9", true),
            (max.as_str(), true),
            (long.as_str(), false),
            ("", false),
            ("a/b", false),
            (".", false),
            ("..", false),
            ("a b", false),
            ("あ", false),
        ];
        for (value, expected) in table {
            assert_eq!(is_valid_doc_id_segment(value), expected, "{value}");
        }
    }

    #[test]
    fn assert_returns_invalid_without_the_raw_value() {
        let error = assert_valid_doc_id_segment("a/b").unwrap_err();
        assert!(!error.message.contains("a/b"));
        assert!(assert_valid_doc_id_segment("ok").is_ok());
    }
}
