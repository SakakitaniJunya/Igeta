mod __aggregate__;
mod errors;
mod name;
mod ports;

pub use self::__aggregate__::{__Aggregate__, __Aggregate__Status};
pub use self::errors::DomainError;
pub use self::name::__Aggregate__Name;
pub use self::ports::{__Aggregate__Repository, TransitionError};
