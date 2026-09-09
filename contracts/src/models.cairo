use starknet::ContractAddress;

pub const CONFIG_ID: u8 = 0;
pub const CHALLENGE_COUNTER_ID: u8 = 0;
pub const SUPPLY_DROP_COUNTER_ID: u8 = 0;
pub const MAX_SECTORS: u32 = 2_000;
pub const SEPOLIA_MINIMUM_STAKE: u128 = 100_000_000_000_000_000; // 0.1 STRK
pub const MAINNET_MINIMUM_STAKE: u128 = 100_000_000_000_000_000_000; // 100 STRK
pub const SEPOLIA_CHALLENGE_PERIOD_SECONDS: u64 = 180; // 3 minutes
pub const MAINNET_CHALLENGE_PERIOD_SECONDS: u64 = 10_800; // 3 hours

pub const SUPPLY_DROP_PRIZE_ERC20: u8 = 1;
pub const SUPPLY_DROP_PRIZE_ERC721: u8 = 2;
pub const SUPPLY_DROP_PRIZE_ERC1155: u8 = 3;

pub const SUPPLY_DROP_STATUS_FUNDING: u8 = 1;
pub const SUPPLY_DROP_STATUS_ACTIVE: u8 = 2;
pub const SUPPLY_DROP_STATUS_DRAWING: u8 = 3;
pub const SUPPLY_DROP_STATUS_SETTLED: u8 = 4;

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
    pub sector_limit: u32,
    pub paused: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct OperatorState {
    #[key]
    pub operator: ContractAddress,
    pub generation: u64,
    pub sector_force: u128,
    pub challenge_force: u128,
    pub spent_force: u128,
    pub controlled_sector_count: u32,
    pub active_challenge_count: u32,
    pub retired: bool,
}

/// Separate from FORCE obligations: a claim hold must never disqualify an Operator.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct SupplyDropHold {
    #[key]
    pub operator: ContractAddress,
    pub staking_pool: ContractAddress,
    pub required_stake: u128,
}

/// Required for every Supply Drop. A missing policy is invalid.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct SupplyDropStakingPolicy {
    #[key]
    pub supply_drop_id: u64,
    pub staking_pool: ContractAddress,
    pub staking_required: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Sector {
    #[key]
    pub id: u32,
    pub controller: ContractAddress,
    pub controller_generation: u64,
    pub capture_force: u128,
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
    pub sector_id: u32,
    pub incumbent: ContractAddress,
    pub leader: ContractAddress,
    pub leader_generation: u64,
    pub leading_force: u128,
    pub last_loser: ContractAddress,
    pub last_losing_force: u128,
    pub deadline: u64,
    pub lead_change_count: u32,
    pub participant_count: u32,
    pub settled: bool,
    pub winner: ContractAddress,
    pub winning_force: u128,
    pub losing_force: u128,
    pub settled_at: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ChallengeParticipant {
    #[key]
    pub challenge_id: u64,
    #[key]
    pub operator: ContractAddress,
    pub committed_force: u128,
    pub sector_force_included: u128,
    pub operator_generation: u64,
    pub joined: bool,
    pub resolved: bool,
    pub won: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct SupplyDropCounter {
    #[key]
    pub id: u8,
    pub next_id: u64,
    pub active_id: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct SupplyDrop {
    #[key]
    pub id: u64,
    pub status: u8,
    pub sponsor: ContractAddress,
    pub prize_kind: u8,
    pub token: ContractAddress,
    pub token_id: u256,
    pub amount: u256,
    pub staking_pool_snapshot: ContractAddress,
    pub sector_limit_snapshot: u32,
    pub duration_seconds: u64,
    pub started_at: u64,
    pub ends_at: u64,
    pub randomness_block: u64,
    pub last_randomness: felt252,
    pub last_drawn_sector_id: u32,
    pub draw_count: u32,
    pub winner: ContractAddress,
    pub settled_at: u64,
    pub claimed: bool,
    pub claimed_by: ContractAddress,
    pub claimed_at: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct SupplyDropSectorSnapshot {
    #[key]
    pub supply_drop_id: u64,
    #[key]
    pub draw_count: u32,
    #[key]
    pub sector_id: u32,
    pub initialized: bool,
    pub controller: ContractAddress,
    pub controller_generation: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct SupplyDropOperatorSnapshot {
    #[key]
    pub supply_drop_id: u64,
    #[key]
    pub draw_count: u32,
    #[key]
    pub operator: ContractAddress,
    pub initialized: bool,
    pub generation: u64,
    pub retired: bool,
}
