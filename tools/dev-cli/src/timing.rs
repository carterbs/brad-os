use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct Stopwatch {
    started_at: Instant,
}

impl Stopwatch {
    pub fn start() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }

    pub fn elapsed_seconds(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }

    pub fn elapsed(&self) -> Duration {
        self.started_at.elapsed()
    }
}
