// 値オブジェクトの雛形。作るときに意味 (長さ 1〜40) を確かめ、作った後は変えない。

use super::errors::DomainError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct __Aggregate__Name(String);

impl __Aggregate__Name {
    pub const MAX_LENGTH: usize = 40;

    /// 前後の空白を落として長さ (文字数) を確かめる。外れていれば InvalidName。
    /// 入力の形 (文字列か、項目が揃っているか) は presentation が先に見る。意味はここで見る。
    pub fn new(value: &str) -> Result<Self, DomainError> {
        let trimmed = value.trim();
        let length = trimmed.chars().count();
        if length == 0 || length > Self::MAX_LENGTH {
            return Err(DomainError::InvalidName { length });
        }
        Ok(Self(trimmed.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boundaries() {
        assert_eq!(__Aggregate__Name::new("a").unwrap().as_str(), "a");
        assert!(__Aggregate__Name::new(&"a".repeat(40)).is_ok());
        assert_eq!(__Aggregate__Name::new(&"a".repeat(41)), Err(DomainError::InvalidName { length: 41 }));
        assert_eq!(__Aggregate__Name::new(""), Err(DomainError::InvalidName { length: 0 }));
    }

    #[test]
    fn trims_and_counts_characters() {
        assert_eq!(__Aggregate__Name::new("  名前  ").unwrap().as_str(), "名前");
        assert_eq!(__Aggregate__Name::new("   "), Err(DomainError::InvalidName { length: 0 }));
        assert!(__Aggregate__Name::new(&"あ".repeat(40)).is_ok());
    }
}
