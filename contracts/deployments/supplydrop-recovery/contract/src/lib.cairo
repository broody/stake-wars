pub mod models;
use stakewars_recovery::models::Jackpot;
use starknet::ContractAddress;
#[starknet::interface]
pub trait IRecovery<T> {
    fn cancel_and_refund_initial_jackpot(ref self: T);
    fn get_jackpot(self: @T, id: u64) -> Jackpot;
}
#[starknet::interface]
pub trait IERC20<T> {
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    fn transfer(ref self: T, recipient: ContractAddress, amount: u256) -> bool;
}
#[derive(Drop, Serde)]
pub struct PoolInfo {
    pub staker_address: ContractAddress,
    pub staker_removed: bool,
    pub staking_contract: ContractAddress,
    pub token_address: ContractAddress,
    pub commission: u16,
}
#[starknet::interface]
pub trait IStakingPool<T> {
    fn contract_parameters_v1(self: @T) -> PoolInfo;
}
#[dojo::contract]
pub mod jackpot {
    use core::num::traits::Zero;
    use dojo::model::ModelStorage;
    use stakewars_recovery::models::{
        CONFIG_ID, GameConfig, JACKPOT_COUNTER_ID, JACKPOT_PRIZE_ERC20, JACKPOT_STATUS_ACTIVE,
        Jackpot, JackpotCounter,
    };
    use stakewars_recovery::{
        IERC20Dispatcher as IERC20AssetDispatcher, IERC20DispatcherTrait, IRecovery,
        IStakingPoolDispatcher, IStakingPoolDispatcherTrait,
    };
    use starknet::{get_block_timestamp, get_caller_address, get_contract_address};
    #[abi(embed_v0)]
    impl RecoveryImpl of IRecovery<ContractState> {
        fn cancel_and_refund_initial_jackpot(ref self: ContractState) {
            let mut world = self.world_default();
            let config: GameConfig = world.read_model(CONFIG_ID);
            assert(config.initialized, 'not initialized');
            assert(get_caller_address() == config.admin, 'not admin');
            let mut counter: JackpotCounter = world.read_model(JACKPOT_COUNTER_ID);
            assert(counter.next_id == 1 && counter.active_id == 1, 'recovery unavailable');
            let mut current: Jackpot = world.read_model(1_u64);
            assert(current.id == 1, 'jackpot not found');
            assert(current.status == JACKPOT_STATUS_ACTIVE, 'jackpot not active');
            assert(get_block_timestamp() < current.ends_at, 'jackpot expired');
            assert(current.randomness_block == 0, 'draw already committed');
            assert(current.winner.is_zero() && !current.claimed, 'winner already recorded');
            assert(current.prize_kind == JACKPOT_PRIZE_ERC20, 'recovery requires erc20');
            assert(current.amount == 10_000_000_000_000_000_000_000, 'unexpected recovery amount');
            assert(!current.sponsor.is_zero(), 'zero sponsor');
            let pool = IStakingPoolDispatcher { contract_address: current.staking_pool_snapshot };
            assert(
                current.token == pool.contract_parameters_v1().token_address,
                'unexpected recovery token',
            );
            let token = IERC20AssetDispatcher { contract_address: current.token };
            let escrow = get_contract_address();
            assert(token.balance_of(escrow) == current.amount, 'unexpected escrow balance');
            let sponsor_balance = token.balance_of(current.sponsor);

            // Effects precede the external call. Any failed transfer or balance
            // check reverts both cancellation and the refund atomically.
            current.status = 5;
            counter.active_id = 0;
            world.write_model(@current);
            world.write_model(@counter);
            assert(token.transfer(current.sponsor, current.amount), 'refund transfer failed');
            assert(token.balance_of(escrow) == 0, 'escrow not empty');
            assert(
                token.balance_of(current.sponsor) == sponsor_balance + current.amount,
                'refund amount mismatch',
            );
        }


        fn get_jackpot(self: @ContractState, id: u64) -> Jackpot {
            self.world_default().read_model(id)
        }
    }
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"stakewars")
        }
    }
}
#[cfg(test)]
mod tests;
