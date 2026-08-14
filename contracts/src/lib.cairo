pub mod math;
pub mod models;
pub mod staking;

pub mod systems {
    pub mod admin;
    pub mod control;
}

#[cfg(test)]
pub mod tests {
    mod mock_staking_pool;
    mod test_math;
    mod test_world;
}
