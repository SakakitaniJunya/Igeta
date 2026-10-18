// 集約の雛形。domain は他の層も std 以外の crate も知らない (domain-is-framework-free)。

use super::errors::DomainError;
use super::name::__Aggregate__Name;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum __Aggregate__Status {
    Open,
    Closed,
}

impl __Aggregate__Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Closed => "closed",
        }
    }
}

/// <この集約が何か・どのコレクションに載るかを 1 行で>。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct __Aggregate__ {
    pub id: String,
    pub name: __Aggregate__Name,
    pub status: __Aggregate__Status,
}

impl __Aggregate__ {
    /// 状態を変える操作は、新しい値を返す (自分を消費する)。不変条件の違反は DomainError。
    pub fn close(self) -> Result<Self, DomainError> {
        if self.status == __Aggregate__Status::Closed {
            return Err(DomainError::AlreadyClosed { id: self.id });
        }
        Ok(Self { status: __Aggregate__Status::Closed, ..self })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open() -> __Aggregate__ {
        __Aggregate__ { id: "a-1".to_string(), name: __Aggregate__Name::new("n").unwrap(), status: __Aggregate__Status::Open }
    }

    #[test]
    fn close_returns_a_closed_copy() {
        let closed = open().close().unwrap();
        assert_eq!(closed.status, __Aggregate__Status::Closed);
        assert_eq!(closed.id, "a-1");
    }

    #[test]
    fn closing_a_closed_one_fails() {
        let closed = open().close().unwrap();
        assert_eq!(closed.close(), Err(DomainError::AlreadyClosed { id: "a-1".to_string() }));
    }

    #[test]
    fn status_strings() {
        assert_eq!(__Aggregate__Status::Open.as_str(), "open");
        assert_eq!(__Aggregate__Status::Closed.as_str(), "closed");
    }
}
