use starknet::ContractAddress;

/// ABI-compatible subset of `starknet-staking`'s `PoolMemberInfoV1`.
///
/// Source reference:
/// `vendor/starknet-staking/src/pool/interface.cairo`.
#[derive(Copy, Drop, Serde, Debug)]
pub struct PoolMemberInfoV1 {
    pub reward_address: ContractAddress,
    pub amount: u128,
    pub unclaimed_rewards: u128,
    pub commission: u16,
    pub unpool_amount: u128,
    pub unpool_time: Option<u64>,
}

#[starknet::interface]
pub trait IStakingPool<TContractState> {
    fn get_pool_member_info_v1(
        self: @TContractState, pool_member: ContractAddress,
    ) -> Option<PoolMemberInfoV1>;
}

pub fn delegated_amount(staking_pool: ContractAddress, operator: ContractAddress) -> u128 {
    let dispatcher = IStakingPoolDispatcher { contract_address: staking_pool };
    match dispatcher.get_pool_member_info_v1(operator) {
        Option::Some(info) => info.amount,
        Option::None => 0,
    }
}
