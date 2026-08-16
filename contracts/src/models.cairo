use starknet::ContractAddress;

pub const CONFIG_ID: u8 = 0;
pub const CHALLENGE_COUNTER_ID: u8 = 0;
pub const MAX_CONTROL_POINTS: u32 = 2_000;
pub const SEPOLIA_MINIMUM_STAKE: u128 = 100_000_000_000_000_000; // 0.1 STRK
pub const MAINNET_MINIMUM_STAKE: u128 = 100_000_000_000_000_000_000; // 100 STRK

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct GameConfig {
    #[key]
    pub id: u8,
    pub initialized: bool,
    pub admin: ContractAddress,
    pub staking_pool: ContractAddress,
    pub minimum_stake: u128,
    pub challenge_period_seconds: u64,
    pub control_point_limit: u32,
    pub paused: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct OperatorState {
    #[key]
    pub operator: ContractAddress,
    pub generation: u64,
    pub point_power: u128,
    pub challenge_power: u128,
    pub spent_power: u128,
    pub controlled_point_count: u32,
    pub active_challenge_count: u32,
    pub retired: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ControlPoint {
    #[key]
    pub id: u32,
    pub controller: ContractAddress,
    pub controller_generation: u64,
    pub capture_power: u128,
    pub ownership_generation: u64,
    pub controlled_since: u64,
    pub active_challenge_id: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ChallengeCounter {
    #[key]
    pub id: u8,
    pub next_id: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Challenge {
    #[key]
    pub id: u64,
    pub control_point_id: u32,
    pub incumbent: ContractAddress,
    pub leader: ContractAddress,
    pub leader_generation: u64,
    pub leading_bid: u128,
    pub last_loser: ContractAddress,
    pub last_losing_bid: u128,
    pub deadline: u64,
    pub bid_count: u32,
    pub participant_count: u32,
    pub settled: bool,
    pub winner: ContractAddress,
    pub winning_power: u128,
    pub losing_power: u128,
    pub settled_at: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ChallengeParticipant {
    #[key]
    pub challenge_id: u64,
    #[key]
    pub operator: ContractAddress,
    pub bid_power: u128,
    pub point_power_included: u128,
    pub operator_generation: u64,
    pub joined: bool,
    pub resolved: bool,
    pub won: bool,
}
