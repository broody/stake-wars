use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockStakingPool<TContractState> {
    fn set_amount(ref self: TContractState, member: ContractAddress, amount: u128);
}

#[starknet::contract]
pub mod mock_staking_pool {
    use stakewars::staking::{IStakingPool, PoolMemberInfoV1};
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use super::IMockStakingPool;

    #[storage]
    struct Storage {
        amounts: Map<ContractAddress, u128>,
    }

    #[abi(embed_v0)]
    impl MockImpl of IMockStakingPool<ContractState> {
        fn set_amount(ref self: ContractState, member: ContractAddress, amount: u128) {
            self.amounts.entry(member).write(amount);
        }
    }

    #[abi(embed_v0)]
    impl StakingPoolImpl of IStakingPool<ContractState> {
        fn get_pool_member_info_v1(
            self: @ContractState, pool_member: ContractAddress,
        ) -> Option<PoolMemberInfoV1> {
            let amount = self.amounts.entry(pool_member).read();
            if amount == 0 {
                return Option::None;
            }

            Option::Some(
                PoolMemberInfoV1 {
                    reward_address: pool_member,
                    amount,
                    unclaimed_rewards: 0,
                    commission: 0,
                    unpool_amount: 0,
                    unpool_time: Option::None,
                },
            )
        }
    }
}
