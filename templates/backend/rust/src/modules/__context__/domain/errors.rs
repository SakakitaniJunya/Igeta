// 不変条件違反のドメインエラー。usecase が AppError (invalid / conflict) にする。

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DomainError {
    /// 名前の長さが範囲外。
    InvalidName { length: usize },
    /// 閉じ済みの集約を閉じようとした。
    AlreadyClosed { id: String },
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidName { length } => write!(f, "invalid __aggregate__ name length: {length}"),
            Self::AlreadyClosed { .. } => write!(f, "__aggregate__ already closed"),
        }
    }
}

impl std::error::Error for DomainError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages() {
        assert_eq!(DomainError::InvalidName { length: 0 }.to_string(), "invalid __aggregate__ name length: 0");
        assert_eq!(DomainError::AlreadyClosed { id: "a".to_string() }.to_string(), "__aggregate__ already closed");
    }
}
