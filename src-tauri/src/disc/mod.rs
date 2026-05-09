pub mod archiver;
pub mod detector;
pub mod state;

pub use state::DiscState;

use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;

pub type SharedDiscState = Arc<Mutex<DiscState>>;

pub struct DiscCancelFlag(pub Arc<AtomicBool>);
