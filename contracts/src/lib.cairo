pub mod assets;
pub mod models;
pub mod staking;

pub mod systems {
    pub mod admin;
    pub mod control;
    pub mod jackpot;
}

#[cfg(test)]
pub mod tests {
    mod mock_staking_pool;
    mod mock_tokens;
    mod test_jackpot;
    mod test_world;
}
