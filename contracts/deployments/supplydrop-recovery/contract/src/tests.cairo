use dojo::model::{ModelStorage, ModelStorageTest};
use dojo::world::{WorldStorage, WorldStorageTrait, world};
use dojo_cairo_test::{
    ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait, spawn_test_world,
};
use stakewars_recovery::models::{
    GameConfig, Jackpot, JackpotCounter, m_GameConfig, m_Jackpot, m_JackpotCounter,
};
use stakewars_recovery::{
    IERC20Dispatcher, IERC20DispatcherTrait, IRecoveryDispatcher, IRecoveryDispatcherTrait, jackpot,
};
use starknet::{ContractAddress, SyscallResultTrait, testing};
const AMOUNT: u256 = 10_000_000_000_000_000_000_000;
fn admin() -> ContractAddress {
    0x111.try_into().unwrap()
}
fn sponsor() -> ContractAddress {
    0x222.try_into().unwrap()
}
fn setup() -> (WorldStorage, IRecoveryDispatcher, IERC20Dispatcher) {
    let mut w = spawn_test_world(
        world::TEST_CLASS_HASH,
        [
            NamespaceDef {
                namespace: "stakewars",
                resources: [
                    TestResource::Model(m_GameConfig::TEST_CLASS_HASH),
                    TestResource::Model(m_Jackpot::TEST_CLASS_HASH),
                    TestResource::Model(m_JackpotCounter::TEST_CLASS_HASH),
                    TestResource::Contract(jackpot::TEST_CLASS_HASH),
                ]
                    .span(),
            }
        ]
            .span(),
    );
    w
        .sync_perms_and_inits(
            [
                ContractDefTrait::new(@"stakewars", @"jackpot")
                    .with_writer_of(
                        [
                            dojo::utils::selector_from_names(@"stakewars", @"Jackpot"),
                            dojo::utils::selector_from_names(@"stakewars", @"JackpotCounter"),
                        ]
                            .span(),
                    )
            ]
                .span(),
        );
    let (address, _) = w.dns(@"jackpot").unwrap();
    let (token, _) = starknet::syscalls::deploy_syscall(
        asset::TEST_CLASS_HASH.try_into().unwrap(), 0, [address.into()].span(), false,
    )
        .unwrap_syscall();
    w
        .write_model_test(
            @GameConfig {
                id: 0,
                initialized: true,
                admin: admin(),
                staking_pool: token,
                minimum_stake: 100,
                challenge_period_seconds: 100,
                sector_limit: 2000,
                paused: false,
            },
        );
    w.write_model_test(@JackpotCounter { id: 0, next_id: 1, active_id: 1 });
    w
        .write_model_test(
            @Jackpot {
                id: 1,
                status: 2,
                sponsor: sponsor(),
                prize_kind: 1,
                token,
                token_id: 0,
                amount: AMOUNT,
                staking_pool_snapshot: token,
                sector_limit_snapshot: 2000,
                duration_seconds: 1000,
                started_at: 0,
                ends_at: 1000,
                randomness_block: 0,
                last_randomness: 123,
                last_drawn_sector_id: 602,
                draw_count: 2,
                winner: 0.try_into().unwrap(),
                settled_at: 0,
                claimed: false,
                claimed_by: 0.try_into().unwrap(),
                claimed_at: 0,
            },
        );
    testing::set_block_timestamp(100);
    testing::set_contract_address(admin());
    (
        w,
        IRecoveryDispatcher { contract_address: address },
        IERC20Dispatcher { contract_address: token },
    )
}
#[test]
#[available_gas(900000000)]
fn refunds_only_sponsor_and_retires_round_preserving_history() {
    let (w, r, token) = setup();
    r.cancel_and_refund_initial_jackpot();
    assert_eq!(token.balance_of(sponsor()), AMOUNT);
    assert_eq!(token.balance_of(admin()), 0);
    assert_eq!(token.balance_of(r.contract_address), 0);
    let row = r.get_jackpot(1);
    assert_eq!(row.status, 5);
    assert_eq!(row.draw_count, 2);
    assert_eq!(row.last_randomness, 123);
    assert!(!row.claimed);
    let counter: JackpotCounter = w.read_model(0_u8);
    assert_eq!(counter.active_id, 0);
    assert_eq!(counter.next_id, 1);
}
#[test]
#[should_panic(expected: ('not admin', 'ENTRYPOINT_FAILED'))]
#[available_gas(900000000)]
fn sponsor_cannot_refund_without_admin() {
    let (_, r, _) = setup();
    testing::set_contract_address(sponsor());
    r.cancel_and_refund_initial_jackpot();
}
#[test]
#[should_panic(expected: ('recovery unavailable', 'ENTRYPOINT_FAILED'))]
#[available_gas(900000000)]
fn refund_cannot_be_replayed() {
    let (_, r, _) = setup();
    r.cancel_and_refund_initial_jackpot();
    r.cancel_and_refund_initial_jackpot();
}
#[test]
#[should_panic(expected: ('jackpot expired', 'ENTRYPOINT_FAILED'))]
#[available_gas(900000000)]
fn expired_round_cannot_be_cancelled() {
    let (_, r, _) = setup();
    testing::set_block_timestamp(1000);
    r.cancel_and_refund_initial_jackpot();
}
#[test]
#[should_panic(expected: ('jackpot not active', 'ENTRYPOINT_FAILED'))]
#[available_gas(900000000)]
fn drawing_round_cannot_be_cancelled() {
    let (mut w, r, _) = setup();
    let mut row = r.get_jackpot(1);
    row.status = 3;
    w.write_model_test(@row);
    r.cancel_and_refund_initial_jackpot();
}
#[test]
#[should_panic(expected: ('winner already recorded', 'ENTRYPOINT_FAILED'))]
#[available_gas(900000000)]
fn recorded_winner_cannot_be_refunded() {
    let (mut w, r, _) = setup();
    let mut row = r.get_jackpot(1);
    row.winner = sponsor();
    w.write_model_test(@row);
    r.cancel_and_refund_initial_jackpot();
}
#[test]
#[should_panic(expected: ('unexpected recovery amount', 'ENTRYPOINT_FAILED'))]
#[available_gas(900000000)]
fn changed_amount_cannot_be_refunded() {
    let (mut w, r, _) = setup();
    let mut row = r.get_jackpot(1);
    row.amount = 1;
    w.write_model_test(@row);
    r.cancel_and_refund_initial_jackpot();
}
#[test]
#[should_panic(expected: ('recovery unavailable', 'ENTRYPOINT_FAILED'))]
#[available_gas(900000000)]
fn another_round_cannot_be_refunded() {
    let (mut w, r, _) = setup();
    w.write_model_test(@JackpotCounter { id: 0, next_id: 2, active_id: 2 });
    r.cancel_and_refund_initial_jackpot();
}
#[starknet::contract]
pub mod asset {
    use stakewars_recovery::{IERC20, IStakingPool, PoolInfo};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
    }
    #[constructor]
    fn constructor(ref self: ContractState, escrow: ContractAddress) {
        self.balances.write(escrow, 10_000_000_000_000_000_000_000);
    }
    #[abi(embed_v0)]
    impl Token of IERC20<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            self.balances.write(sender, self.balances.read(sender) - amount);
            self.balances.write(recipient, self.balances.read(recipient) + amount);
            true
        }
    }
    #[abi(embed_v0)]
    impl Pool of IStakingPool<ContractState> {
        fn contract_parameters_v1(self: @ContractState) -> PoolInfo {
            PoolInfo {
                staker_address: get_contract_address(),
                staker_removed: false,
                staking_contract: get_contract_address(),
                token_address: get_contract_address(),
                commission: 0,
            }
        }
    }
}
