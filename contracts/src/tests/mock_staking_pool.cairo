use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockStakingPool<TContractState> {
    fn set_token(ref self: TContractState, token: ContractAddress);
    fn add_to_delegation_pool(
        ref self: TContractState, pool_member: ContractAddress, amount: u128,
    ) -> u128;
    fn set_amount(ref self: TContractState, member: ContractAddress, amount: u128);
    fn set_unpool(
        ref self: TContractState, member: ContractAddress, amount: u128, unlock_time: u64,
    );
}

#[starknet::contract]
pub mod mock_staking_pool {
    use stakewars::assets::{IERC20AssetDispatcher, IERC20AssetDispatcherTrait};
    use stakewars::staking::{IStakingPool, PoolContractInfoV1, PoolMemberInfoV1};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use super::IMockStakingPool;

    #[storage]
    struct Storage {
        token: ContractAddress,
        amounts: Map<ContractAddress, u128>,
        unpool_amounts: Map<ContractAddress, u128>,
        unpool_times: Map<ContractAddress, u64>,
    }

    #[abi(embed_v0)]
    impl MockImpl of IMockStakingPool<ContractState> {
        fn set_token(ref self: ContractState, token: ContractAddress) {
            self.token.write(token);
        }
        fn add_to_delegation_pool(
            ref self: ContractState, pool_member: ContractAddress, amount: u128,
        ) -> u128 {
            assert(get_caller_address() == pool_member, 'not pool member');
            assert(amount > 0, 'zero stake');
            assert(self.amounts.entry(pool_member).read() > 0, 'not registered');
            let token = IERC20AssetDispatcher { contract_address: self.token.read() };
            assert(
                token.transfer_from(pool_member, get_contract_address(), amount.into()),
                'stake transfer failed',
            );
            let balance = self.amounts.entry(pool_member).read() + amount;
            self.amounts.entry(pool_member).write(balance);
            balance
        }
        fn set_amount(ref self: ContractState, member: ContractAddress, amount: u128) {
            self.amounts.entry(member).write(amount);
        }

        fn set_unpool(
            ref self: ContractState, member: ContractAddress, amount: u128, unlock_time: u64,
        ) {
            self.unpool_amounts.entry(member).write(amount);
            self.unpool_times.entry(member).write(unlock_time);
        }
    }

    #[abi(embed_v0)]
    impl StakingPoolImpl of IStakingPool<ContractState> {
        fn contract_parameters_v1(self: @ContractState) -> PoolContractInfoV1 {
            PoolContractInfoV1 {
                staker_address: get_contract_address(),
                staker_removed: false,
                staking_contract: get_contract_address(),
                token_address: self.token.read(),
                commission: 0,
            }
        }
        fn get_pool_member_info_v1(
            self: @ContractState, pool_member: ContractAddress,
        ) -> Option<PoolMemberInfoV1> {
            let amount = self.amounts.entry(pool_member).read();
            let unpool_amount = self.unpool_amounts.entry(pool_member).read();
            let unpool_time = self.unpool_times.entry(pool_member).read();
            if amount == 0 && unpool_amount == 0 {
                return Option::None;
            }

            Option::Some(
                PoolMemberInfoV1 {
                    reward_address: pool_member,
                    amount,
                    unclaimed_rewards: 0,
                    commission: 0,
                    unpool_amount,
                    unpool_time: if unpool_time == 0 {
                        Option::None
                    } else {
                        Option::Some(unpool_time)
                    },
                },
            )
        }
    }
}
