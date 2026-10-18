mod close;
mod create;
mod list;

pub use self::close::Close__Aggregate__;
pub use self::create::{Create__Aggregate__, __Aggregate__View};
pub use self::list::{LIST_LIMIT, List__Aggregate__s, List__Aggregate__sInput, List__Aggregate__sOutput};

// presentation が domain を直接触らないための再 export (application の語彙として公開する)。
pub use crate::modules::__context__::domain::{__Aggregate__Repository, __Aggregate__Status};
