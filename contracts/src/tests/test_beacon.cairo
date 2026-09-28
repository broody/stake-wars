#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorage, WorldStorageTrait, world};
    use dojo_cairo_test::{
        ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
        spawn_test_world,
    };
    use stakewars::assets::{IERC20AssetDispatcher, IERC20AssetDispatcherTrait};
    use stakewars::models::{
        BEACON_STATUS_BIDDING, BEACON_STATUS_PENDING, BEACON_STATUS_SETTLED, CONFIG_ID, GameConfig,
        m_BeaconAuction, m_BeaconConfig, m_BeaconCounter, m_GameConfig,
    };
    use stakewars::systems::beacon::{IBeaconDispatcher, IBeaconDispatcherTrait, beacon};
    use stakewars::tests::mock_tokens::{
        IMockERC20ControlDispatcher, IMockERC20ControlDispatcherTrait, mock_erc20,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{ContractAddress, SyscallResultTrait, testing};

    const RESERVE: u128 = 100;
    const RAISE_BPS: u16 = 1_000;
    const DURATION: u64 = 259_200;
    const EXTENSION: u64 = 300;
    const FIRST_ROUND: u64 = 7;
    const STARTED_AT: u64 = 1_000_000;
    const FUNDS: u256 = 1_000_000;

    fn admin() -> ContractAddress {
        0x111.try_into().unwrap()
    }

    fn treasury() -> ContractAddress {
        0x999.try_into().unwrap()
    }

    fn alice() -> ContractAddress {
        0x222.try_into().unwrap()
    }

    fn bob() -> ContractAddress {
        0x333.try_into().unwrap()
    }

    fn carol() -> ContractAddress {
        0x444.try_into().unwrap()
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "stakewars",
            resources: [
                TestResource::Model(m_GameConfig::TEST_CLASS_HASH),
                TestResource::Model(m_BeaconConfig::TEST_CLASS_HASH),
                TestResource::Model(m_BeaconCounter::TEST_CLASS_HASH),
                TestResource::Model(m_BeaconAuction::TEST_CLASS_HASH),
                TestResource::Event(beacon::e_BeaconRulesChanged::TEST_CLASS_HASH),
                TestResource::Event(beacon::e_BeaconAuctionOpened::TEST_CLASS_HASH),
                TestResource::Event(beacon::e_BeaconBidPlaced::TEST_CLASS_HASH),
                TestResource::Event(beacon::e_BeaconAuctionSettled::TEST_CLASS_HASH),
                TestResource::Contract(beacon::TEST_CLASS_HASH),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"stakewars", @"beacon")
                .with_writer_of(
                    [
                        resource_selector(@"BeaconConfig"), resource_selector(@"BeaconCounter"),
                        resource_selector(@"BeaconAuction"),
                        resource_selector(@"BeaconRulesChanged"),
                        resource_selector(@"BeaconAuctionOpened"),
                        resource_selector(@"BeaconBidPlaced"),
                        resource_selector(@"BeaconAuctionSettled"),
                    ]
                        .span(),
                ),
        ]
            .span()
    }

    fn resource_selector(name: @ByteArray) -> felt252 {
        dojo::utils::selector_from_names(@"stakewars", name)
    }

    fn setup_uninitialized() -> (WorldStorage, IBeaconDispatcher, ContractAddress) {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
        world
            .write_model_test(
                @GameConfig {
                    id: CONFIG_ID,
                    initialized: true,
                    admin: admin(),
                    staking_pool: 0x777.try_into().unwrap(),
                    minimum_stake: 100,
                    challenge_period_seconds: 10_800,
                    sector_limit: 1,
                    paused: false,
                },
            );
        world.sync_perms_and_inits(contract_defs());
        let (beacon_address, _) = world.dns(@"beacon").unwrap();
        testing::set_block_timestamp(STARTED_AT);

        let token = deploy_erc20(admin(), FUNDS * 3);
        testing::set_contract_address(admin());
        let erc20 = IERC20AssetDispatcher { contract_address: token };
        erc20.transfer(alice(), FUNDS);
        erc20.transfer(bob(), FUNDS);
        erc20.transfer(carol(), FUNDS);
        for bidder in [alice(), bob(), carol()].span() {
            testing::set_contract_address(*bidder);
            IMockERC20ControlDispatcher { contract_address: token }.approve(beacon_address, FUNDS);
        }
        (world, IBeaconDispatcher { contract_address: beacon_address }, token)
    }

    fn setup() -> (WorldStorage, IBeaconDispatcher, IERC20AssetDispatcher) {
        let (world, beacon, token) = setup_uninitialized();
        testing::set_contract_address(admin());
        beacon
            .initialize_beacon(
                token, treasury(), RESERVE, RAISE_BPS, DURATION, EXTENSION, FIRST_ROUND,
            );
        (world, beacon, IERC20AssetDispatcher { contract_address: token })
    }

    fn deploy_erc20(owner: ContractAddress, supply: u256) -> ContractAddress {
        let calldata = [owner.into(), supply.low.into(), supply.high.into()];
        let (address, _) = deploy_syscall(
            mock_erc20::TEST_CLASS_HASH.try_into().unwrap(), 201, calldata.span(), false,
        )
            .unwrap_syscall();
        address
    }

    fn bid(beacon: IBeaconDispatcher, bidder: ContractAddress, round_id: u64, amount: u128) {
        testing::set_contract_address(bidder);
        beacon.place_beacon_bid(round_id, amount);
    }

    #[test]
    #[available_gas(900000000)]
    fn uninitialized_status_reports_no_round() {
        let (_, beacon, _) = setup_uninitialized();
        let status = beacon.get_beacon_status();
        assert!(!status.initialized);
        assert_eq!(status.auction.round_id, 0);
        assert_eq!(status.minimum_bid, 0);
    }

    #[test]
    #[available_gas(900000000)]
    fn initialization_opens_a_pending_round_that_starts_on_bid() {
        let (_, beacon, token) = setup();
        let status = beacon.get_beacon_status();
        assert!(status.initialized);
        assert_eq!(status.first_round_id, FIRST_ROUND);
        assert_eq!(status.minimum_bid, RESERVE);
        let auction = status.auction;
        assert_eq!(auction.round_id, FIRST_ROUND);
        assert_eq!(auction.status, BEACON_STATUS_PENDING);
        assert_eq!(auction.payment_token, token.contract_address);
        assert_eq!(auction.proceeds_recipient, treasury());
        assert_eq!(auction.reserve_price, RESERVE);
        assert_eq!(auction.min_raise_bps, RAISE_BPS);
        assert_eq!(auction.bidding_duration_seconds, DURATION);
        assert_eq!(auction.extension_seconds, EXTENSION);
        assert_eq!(auction.started_at, 0);
        assert_eq!(auction.ends_at, 0);
        assert_eq!(auction.bid_count, 0);
    }

    #[test]
    #[should_panic(expected: ('not admin', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn only_the_game_admin_can_initialize() {
        let (_, beacon, token) = setup_uninitialized();
        testing::set_contract_address(alice());
        beacon.initialize_beacon(token, treasury(), RESERVE, RAISE_BPS, DURATION, EXTENSION, 1);
    }

    #[test]
    #[should_panic(expected: ('beacon already initialized', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn initialization_happens_once() {
        let (_, beacon, token) = setup();
        testing::set_contract_address(admin());
        beacon
            .initialize_beacon(
                token.contract_address, treasury(), RESERVE, RAISE_BPS, DURATION, EXTENSION, 1,
            );
    }

    #[test]
    #[should_panic(expected: ('extension exceeds duration', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn extension_cannot_exceed_the_bidding_window() {
        let (_, beacon, token) = setup_uninitialized();
        testing::set_contract_address(admin());
        beacon.initialize_beacon(token, treasury(), RESERVE, RAISE_BPS, 60, 61, 1);
    }

    #[test]
    #[should_panic(expected: ('zero reserve price', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn reserve_must_be_positive() {
        let (_, beacon, token) = setup_uninitialized();
        testing::set_contract_address(admin());
        beacon.initialize_beacon(token, treasury(), 0, RAISE_BPS, DURATION, EXTENSION, 1);
    }

    #[test]
    #[should_panic(expected: ('bid too low', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn first_bid_must_meet_the_reserve() {
        let (_, beacon, _) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE - 1);
    }

    #[test]
    #[available_gas(900000000)]
    fn first_bid_starts_the_clock_and_escrows_the_lead() {
        let (_, beacon, token) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);

        let status = beacon.get_beacon_status();
        let auction = status.auction;
        assert_eq!(auction.status, BEACON_STATUS_BIDDING);
        assert_eq!(auction.started_at, STARTED_AT);
        assert_eq!(auction.ends_at, STARTED_AT + DURATION);
        assert_eq!(auction.leader, alice());
        assert_eq!(auction.leading_bid, RESERVE);
        assert_eq!(auction.bid_count, 1);
        assert_eq!(status.minimum_bid, 110);
        assert_eq!(token.balance_of(beacon.contract_address), RESERVE.into());
        assert_eq!(token.balance_of(alice()), FUNDS - RESERVE.into());
    }

    #[test]
    #[available_gas(900000000)]
    fn outbid_leader_is_refunded_in_the_same_transaction() {
        let (_, beacon, token) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        testing::set_block_timestamp(STARTED_AT + 3_600);
        bid(beacon, bob(), FIRST_ROUND, 110);

        let auction = beacon.get_beacon_status().auction;
        assert_eq!(auction.leader, bob());
        assert_eq!(auction.leading_bid, 110);
        assert_eq!(auction.bid_count, 2);
        assert_eq!(auction.ends_at, STARTED_AT + DURATION);
        assert_eq!(token.balance_of(alice()), FUNDS);
        assert_eq!(token.balance_of(bob()), FUNDS - 110);
        assert_eq!(token.balance_of(beacon.contract_address), 110);
    }

    #[test]
    #[available_gas(900000000)]
    fn minimum_raise_is_ten_percent_rounded_up() {
        let (_, beacon, _) = setup();
        bid(beacon, alice(), FIRST_ROUND, 101);
        assert_eq!(beacon.get_beacon_status().minimum_bid, 112);
        bid(beacon, bob(), FIRST_ROUND, 112);
        assert_eq!(beacon.get_beacon_status().minimum_bid, 124);
    }

    #[test]
    #[should_panic(expected: ('bid too low', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn raise_below_ten_percent_is_rejected() {
        let (_, beacon, _) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        bid(beacon, bob(), FIRST_ROUND, 109);
    }

    #[test]
    #[should_panic(expected: ('already leading', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn leader_cannot_raise_its_own_bid() {
        let (_, beacon, _) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        bid(beacon, alice(), FIRST_ROUND, 200);
    }

    #[test]
    #[available_gas(900000000)]
    fn late_bid_extends_the_deadline_by_the_response_window() {
        let (_, beacon, _) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        let ends_at = STARTED_AT + DURATION;

        // Bids outside the final window leave the deadline alone.
        testing::set_block_timestamp(ends_at - EXTENSION - 1);
        bid(beacon, bob(), FIRST_ROUND, 110);
        assert_eq!(beacon.get_beacon_status().auction.ends_at, ends_at);

        testing::set_block_timestamp(ends_at - 10);
        bid(beacon, carol(), FIRST_ROUND, 121);
        assert_eq!(beacon.get_beacon_status().auction.ends_at, ends_at - 10 + EXTENSION);

        testing::set_block_timestamp(ends_at + EXTENSION - 11);
        bid(beacon, alice(), FIRST_ROUND, 134);
        assert_eq!(beacon.get_beacon_status().auction.ends_at, ends_at + 2 * EXTENSION - 11);
    }

    #[test]
    #[should_panic(expected: ('auction ended', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn bids_after_the_deadline_are_rejected() {
        let (_, beacon, _) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        testing::set_block_timestamp(STARTED_AT + DURATION);
        bid(beacon, bob(), FIRST_ROUND, 110);
    }

    #[test]
    #[should_panic(expected: ('auction active', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn settlement_waits_for_the_deadline() {
        let (_, beacon, _) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        testing::set_block_timestamp(STARTED_AT + DURATION - 1);
        beacon.settle_beacon_auction(FIRST_ROUND);
    }

    #[test]
    #[should_panic(expected: ('auction not started', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn pending_round_without_bids_cannot_settle() {
        let (_, beacon, _) = setup();
        testing::set_block_timestamp(STARTED_AT + DURATION * 10);
        beacon.settle_beacon_auction(FIRST_ROUND);
    }

    #[test]
    #[available_gas(900000000)]
    fn permissionless_settlement_pays_proceeds_and_opens_the_next_round() {
        let (_, beacon, token) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        bid(beacon, bob(), FIRST_ROUND, 150);
        let settled_at = STARTED_AT + DURATION + 42;
        testing::set_block_timestamp(settled_at);
        testing::set_contract_address(carol());
        beacon.settle_beacon_auction(FIRST_ROUND);

        let settled = beacon.get_beacon_auction(FIRST_ROUND);
        assert_eq!(settled.status, BEACON_STATUS_SETTLED);
        assert_eq!(settled.leader, bob());
        assert_eq!(settled.leading_bid, 150);
        assert_eq!(settled.bid_count, 2);
        assert_eq!(settled.settled_at, settled_at);
        assert_eq!(token.balance_of(treasury()), 150);
        assert_eq!(token.balance_of(beacon.contract_address), 0);
        assert_eq!(token.balance_of(alice()), FUNDS);

        let next = beacon.get_beacon_status();
        assert_eq!(next.auction.round_id, FIRST_ROUND + 1);
        assert_eq!(next.auction.status, BEACON_STATUS_PENDING);
        assert_eq!(next.minimum_bid, RESERVE);
    }

    #[test]
    #[should_panic(expected: ('not current beacon round', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn settled_round_rejects_bids() {
        let (_, beacon, _) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        testing::set_block_timestamp(STARTED_AT + DURATION);
        beacon.settle_beacon_auction(FIRST_ROUND);
        bid(beacon, bob(), FIRST_ROUND, 1_000);
    }

    #[test]
    #[available_gas(900000000)]
    fn rule_changes_apply_to_a_pending_round_but_not_a_live_one() {
        let (_, beacon, _) = setup();
        testing::set_contract_address(admin());
        beacon.set_beacon_rules(treasury(), 500, 500, 600, 60);
        let pending = beacon.get_beacon_status();
        assert_eq!(pending.minimum_bid, 500);
        assert_eq!(pending.auction.min_raise_bps, 500);
        assert_eq!(pending.auction.bidding_duration_seconds, 600);
        assert_eq!(pending.auction.extension_seconds, 60);

        bid(beacon, alice(), FIRST_ROUND, 500);
        testing::set_contract_address(admin());
        beacon.set_beacon_rules(alice(), 900, RAISE_BPS, DURATION, EXTENSION);
        let live = beacon.get_beacon_status();
        assert_eq!(live.auction.proceeds_recipient, treasury());
        assert_eq!(live.auction.ends_at, STARTED_AT + 600);
        assert_eq!(live.minimum_bid, 525);

        testing::set_block_timestamp(STARTED_AT + 600);
        beacon.settle_beacon_auction(FIRST_ROUND);
        let next = beacon.get_beacon_status().auction;
        assert_eq!(next.proceeds_recipient, alice());
        assert_eq!(next.reserve_price, 900);
        assert_eq!(next.bidding_duration_seconds, DURATION);
    }

    #[test]
    #[should_panic(expected: ('not admin', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn only_the_game_admin_can_change_rules() {
        let (_, beacon, _) = setup();
        testing::set_contract_address(alice());
        beacon.set_beacon_rules(alice(), 1, 0, 1, 0);
    }

    #[test]
    #[should_panic(expected: ('game paused', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn paused_game_rejects_bids() {
        let (mut world, beacon, _) = setup();
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.paused = true;
        world.write_model_test(@config);
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
    }

    #[test]
    #[available_gas(900000000)]
    fn paused_game_still_settles() {
        let (mut world, beacon, token) = setup();
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.paused = true;
        world.write_model_test(@config);
        testing::set_block_timestamp(STARTED_AT + DURATION);
        beacon.settle_beacon_auction(FIRST_ROUND);
        assert_eq!(token.balance_of(treasury()), RESERVE.into());
    }

    #[test]
    #[should_panic(expected: ('bid amount mismatch', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn fee_on_transfer_payment_is_rejected() {
        let (_, beacon, token) = setup();
        IMockERC20ControlDispatcher { contract_address: token.contract_address }
            .set_transfer_fee(1);
        bid(beacon, alice(), FIRST_ROUND, RESERVE);
    }
}
