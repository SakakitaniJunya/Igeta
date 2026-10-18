// アプリ全体で共通の失敗の形。kind から HTTP の status と code への対応は shared/presentation/api_response.rs だけが持つ。

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppErrorKind {
    Unauthorized,
    NotFound,
    Conflict,
    Invalid,
    Unprocessable,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppError {
    pub kind: AppErrorKind,
    pub message: String,
    /// 付随値。形の検証の失敗では落ちた項目名の配列。
    pub detail: Option<Vec<String>>,
}

impl AppError {
    pub fn new(kind: AppErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into(), detail: None }
    }

    pub fn with_detail(mut self, detail: Vec<String>) -> Self {
        self.detail = Some(detail);
        self
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::Unauthorized, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::NotFound, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::Conflict, message)
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::Invalid, message)
    }

    pub fn unprocessable(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::Unprocessable, message)
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::Unavailable, message)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for AppError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructors_set_kind_and_message() {
        let table: [(AppError, AppErrorKind); 6] = [
            (AppError::unauthorized("m"), AppErrorKind::Unauthorized),
            (AppError::not_found("m"), AppErrorKind::NotFound),
            (AppError::conflict("m"), AppErrorKind::Conflict),
            (AppError::invalid("m"), AppErrorKind::Invalid),
            (AppError::unprocessable("m"), AppErrorKind::Unprocessable),
            (AppError::unavailable("m"), AppErrorKind::Unavailable),
        ];
        for (error, kind) in table {
            assert_eq!(error.kind, kind);
            assert_eq!(error.message, "m");
            assert_eq!(error.detail, None);
        }
    }

    #[test]
    fn with_detail_keeps_the_names() {
        let error = AppError::invalid("m").with_detail(vec!["name".to_string()]);
        assert_eq!(error.detail, Some(vec!["name".to_string()]));
    }

    #[test]
    fn display_shows_kind_and_message() {
        assert_eq!(AppError::conflict("taken").to_string(), "Conflict: taken");
    }
}
