use super::app_error::AppError;

/// 失敗を投げずに値で返すための型。usecase も repository もこれで返す。
pub type AppResult<T> = Result<T, AppError>;
