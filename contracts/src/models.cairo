use starknet::ContractAddress;

pub const CONFIG_ID: u8 = 0;
pub const MAX_CONTROL_POINTS: u32 = 2_000;

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct GameConfig {
    #[key]
    pub id: u8,
    pub initialized: bool,
    pub admin: ContractAddress,
    pub staking_pool: ContractAddress,
    pub minimum_stake: u128,
    pub challenge_premium_bps: u16,
    pub control_point_limit: u32,
    pub paused: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct OperatorState {
    #[key]
    pub operator: ContractAddress,
    pub generation: u64,
    pub total_allocated: u128,
    pub controlled_point_count: u32,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ControlPoint {
    #[key]
    pub id: u32,
    pub controller: ContractAddress,
    pub controller_generation: u64,
    pub allocated_stake: u128,
    pub ownership_generation: u64,
}
