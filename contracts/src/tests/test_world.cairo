#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{IWorldDispatcherTrait, WorldStorage, WorldStorageTrait, world};
    use dojo_cairo_test::{
        ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
        spawn_test_world,
    };
    use stakewars::models::{
        CONFIG_ID, Challenge, ChallengeParticipant, ControlPoint, GameConfig, OperatorState,
        m_Challenge, m_ChallengeCounter, m_ChallengeParticipant, m_ControlPoint, m_GameConfig,
        m_OperatorState,
    };
    use stakewars::systems::admin::{IAdminDispatcher, IAdminDispatcherTrait, admin};
    use stakewars::systems::control::{IControlDispatcher, IControlDispatcherTrait, control};
    use stakewars::tests::mock_staking_pool::{
        IMockStakingPoolDispatcher, IMockStakingPoolDispatcherTrait, mock_staking_pool,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{ContractAddress, SyscallResultTrait, testing};

    const MINIMUM_STAKE: u128 = 100;
    const PREMIUM_BPS: u16 = 1_000;
    const CHALLENGE_PERIOD: u64 = 10_800;
    const POINT_LIMIT: u32 = 2_000;

    fn player_one() -> ContractAddress {
        0x111.try_into().unwrap()
    }

    fn player_two() -> ContractAddress {
        0x222.try_into().unwrap()
    }

    fn player_three() -> ContractAddress {
        0x333.try_into().unwrap()
    }

    fn settlement_authority() -> ContractAddress {
        0x999.try_into().unwrap()
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "stakewars",
            resources: [
                TestResource::Model(m_GameConfig::TEST_CLASS_HASH),
                TestResource::Model(m_OperatorState::TEST_CLASS_HASH),
                TestResource::Model(m_ControlPoint::TEST_CLASS_HASH),
                TestResource::Model(m_ChallengeCounter::TEST_CLASS_HASH),
                TestResource::Model(m_Challenge::TEST_CLASS_HASH),
                TestResource::Model(m_ChallengeParticipant::TEST_CLASS_HASH),
                TestResource::Event(admin::e_ConfigInitialized::TEST_CLASS_HASH),
                TestResource::Event(admin::e_PauseChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_RulesChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_StakingPoolChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_SettlementAuthorityChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_AdminTransferred::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointCaptured::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointReinforced::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointReleased::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengeStarted::TEST_CLASS_HASH),
                TestResource::Event(control::e_SealedBidSubmitted::TEST_CLASS_HASH),
                TestResource::Event(control::e_CollateralSacrificed::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengeSettled::TEST_CLASS_HASH),
                TestResource::Event(control::e_OperatorDisqualified::TEST_CLASS_HASH),
                TestResource::Event(control::e_OperatorRetired::TEST_CLASS_HASH),
                TestResource::Contract(admin::TEST_CLASS_HASH),
                TestResource::Contract(control::TEST_CLASS_HASH),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"stakewars", @"admin").with_writer_of(admin_writer_selectors()),
            ContractDefTrait::new(@"stakewars", @"control")
                .with_writer_of(control_writer_selectors()),
        ]
            .span()
    }

    fn admin_writer_selectors() -> Span<felt252> {
        [
            resource_selector(@"GameConfig"), resource_selector(@"ConfigInitialized"),
            resource_selector(@"PauseChanged"), resource_selector(@"RulesChanged"),
            resource_selector(@"StakingPoolChanged"),
            resource_selector(@"SettlementAuthorityChanged"),
            resource_selector(@"AdminTransferred"),
        ]
            .span()
    }

    fn control_writer_selectors() -> Span<felt252> {
        [
            resource_selector(@"OperatorState"), resource_selector(@"ControlPoint"),
            resource_selector(@"ChallengeCounter"), resource_selector(@"Challenge"),
            resource_selector(@"ChallengeParticipant"), resource_selector(@"ControlPointCaptured"),
            resource_selector(@"ControlPointReinforced"),
            resource_selector(@"ControlPointReleased"), resource_selector(@"ChallengeStarted"),
            resource_selector(@"SealedBidSubmitted"), resource_selector(@"CollateralSacrificed"),
            resource_selector(@"ChallengeSettled"), resource_selector(@"OperatorDisqualified"),
            resource_selector(@"OperatorRetired"),
        ]
            .span()
    }

    fn resource_selector(name: @ByteArray) -> felt252 {
        dojo::utils::selector_from_names(@"stakewars", name)
    }

    fn setup() -> (WorldStorage, IControlDispatcher, IMockStakingPoolDispatcher) {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
        world.sync_perms_and_inits(contract_defs());
        let (pool_address, _) = deploy_syscall(
            mock_staking_pool::TEST_CLASS_HASH.try_into().unwrap(), 0, [].span(), false,
        )
            .unwrap_syscall();
        let pool = IMockStakingPoolDispatcher { contract_address: pool_address };
        world
            .write_model_test(
                @GameConfig {
                    id: CONFIG_ID,
                    initialized: true,
                    admin: player_one(),
                    settlement_authority: settlement_authority(),
                    staking_pool: pool_address,
                    minimum_stake: MINIMUM_STAKE,
                    challenge_premium_bps: PREMIUM_BPS,
                    challenge_period_seconds: CHALLENGE_PERIOD,
                    control_point_limit: POINT_LIMIT,
                    paused: false,
                },
            );
        let (control_address, _) = world.dns(@"control").unwrap();
        (world, IControlDispatcher { contract_address: control_address }, pool)
    }

    fn setup_uninitialized() -> (WorldStorage, IAdminDispatcher, IMockStakingPoolDispatcher) {
        let world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
        world.sync_perms_and_inits(contract_defs());
        let (pool_address, _) = deploy_syscall(
            mock_staking_pool::TEST_CLASS_HASH.try_into().unwrap(), 0, [].span(), false,
        )
            .unwrap_syscall();
        let pool = IMockStakingPoolDispatcher { contract_address: pool_address };
        let (admin_address, _) = world.dns(@"admin").unwrap();
        (world, IAdminDispatcher { contract_address: admin_address }, pool)
    }

    #[test]
    #[available_gas(300000000)]
    fn world_owner_initializes_challenge_rules() {
        let (world, admin, pool) = setup_uninitialized();
        let owner = player_one();
        world.dispatcher.grant_owner(dojo::utils::bytearray_hash(@"stakewars"), owner);
        testing::set_contract_address(owner);
        admin
            .initialize(
                pool.contract_address,
                settlement_authority(),
                MINIMUM_STAKE,
                PREMIUM_BPS,
                CHALLENGE_PERIOD,
                POINT_LIMIT,
            );
        let config: GameConfig = world.read_model(CONFIG_ID);
        assert_eq!(config.challenge_period_seconds, CHALLENGE_PERIOD);
        assert_eq!(config.challenge_premium_bps, PREMIUM_BPS);
    }

    #[test]
    #[available_gas(800000000)]
    fn admin_period_changes_apply_only_to_new_challenges() {
        let (world, control, pool) = setup();
        let first_incumbent = player_one();
        let first_challenger = player_two();
        let second_incumbent = player_three();
        let second_challenger: ContractAddress = 0x444.try_into().unwrap();
        pool.set_amount(first_incumbent, 1_000);
        pool.set_amount(first_challenger, 1_100);
        pool.set_amount(second_incumbent, 1_000);
        pool.set_amount(second_challenger, 1_100);

        testing::set_contract_address(first_incumbent);
        control.capture(1, 1_000);
        testing::set_contract_address(second_incumbent);
        control.capture(2, 1_000);

        testing::set_contract_address(first_challenger);
        testing::set_block_timestamp(100);
        control.submit_sealed_bid(1, 0xaaa);
        let first: Challenge = world.read_model(1_u64);
        assert_eq!(first.deadline, 100 + CHALLENGE_PERIOD);

        let (admin_address, _) = world.dns(@"admin").unwrap();
        let admin = IAdminDispatcher { contract_address: admin_address };
        testing::set_contract_address(first_incumbent);
        admin.set_rules(MINIMUM_STAKE, PREMIUM_BPS, 7_200, POINT_LIMIT);

        testing::set_contract_address(second_challenger);
        testing::set_block_timestamp(200);
        control.submit_sealed_bid(2, 0xbbb);
        let unchanged: Challenge = world.read_model(1_u64);
        let second: Challenge = world.read_model(2_u64);
        assert_eq!(unchanged.deadline, 100 + CHALLENGE_PERIOD);
        assert_eq!(second.deadline, 200 + 7_200);
    }

    #[test]
    #[available_gas(300000000)]
    fn capture_commits_selected_power_and_leaves_remainder() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        testing::set_block_timestamp(1_000);
        control.capture(42, 400);

        let point: ControlPoint = world.read_model(42_u32);
        let operator = control.get_operator_status(player);
        assert_eq!(point.capture_power, 400);
        assert_eq!(point.controlled_since, 1_000);
        assert_eq!(operator.point_power, 400);
        assert_eq!(operator.available_power, 600);
    }

    #[test]
    #[available_gas(400000000)]
    fn selected_allocations_can_back_multiple_points_without_duplication() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(40, 700);
        pool.set_amount(player, 1_200);
        control.capture(41, 500);

        let first: ControlPoint = world.read_model(40_u32);
        let second: ControlPoint = world.read_model(41_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(first.capture_power, 700);
        assert_eq!(second.capture_power, 500);
        assert_eq!(operator.point_power, 1_200);
        assert_eq!(operator.controlled_point_count, 2);
    }

    #[test]
    #[available_gas(300000000)]
    #[should_panic(expected: ('insufficient available power', 'ENTRYPOINT_FAILED'))]
    fn existing_commitment_cannot_back_another_capture() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 1_000);
        control.capture(2, 100);
    }

    #[test]
    #[available_gas(350000000)]
    fn reinforcement_adds_only_the_selected_power() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        testing::set_block_timestamp(1_000);
        control.capture(1, 1_000);
        pool.set_amount(player, 1_500);
        testing::set_block_timestamp(2_000);
        control.reinforce(1, 300);

        let point: ControlPoint = world.read_model(1_u32);
        assert_eq!(point.capture_power, 1_300);
        assert_eq!(point.controlled_since, 1_000);
        assert_eq!(control.get_operator_status(player).available_power, 200);
    }

    #[test]
    #[available_gas(500000000)]
    fn sealed_challenge_locks_available_power_without_revealing_bid() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_500);
        testing::set_contract_address(incumbent);
        control.capture(7, 1_000);
        testing::set_contract_address(challenger);
        testing::set_block_timestamp(2_000);
        control.submit_sealed_bid(7, 0xabc);

        let point: ControlPoint = world.read_model(7_u32);
        let challenge: Challenge = world.read_model(1_u64);
        let participant: ChallengeParticipant = world.read_model((1_u64, challenger));
        assert_eq!(point.controller, incumbent);
        assert_eq!(point.active_challenge_id, 1);
        assert_eq!(challenge.deadline, 2_000 + CHALLENGE_PERIOD);
        assert_eq!(participant.locked_power, 1_500);
        assert_eq!(participant.bid_commitment, 0xabc);
        assert_eq!(control.get_operator_status(challenger).available_power, 0);
    }

    #[test]
    #[available_gas(1000000000)]
    fn vickrey_settlement_charges_clearing_power_and_unlocks_excess() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 2_200);
        pool.set_amount(challenger, 2_000);
        testing::set_contract_address(incumbent);
        control.capture(7, 1_000);

        testing::set_contract_address(challenger);
        testing::set_block_timestamp(100);
        control.submit_sealed_bid(7, 0xaaa);
        testing::set_contract_address(incumbent);
        testing::set_block_timestamp(200);
        control.submit_sealed_bid(7, 0xbbb);

        testing::set_contract_address(settlement_authority());
        testing::set_block_timestamp(100 + CHALLENGE_PERIOD);
        control.settle_challenge(7, challenger, 1_800, 1_800);
        let point: ControlPoint = world.read_model(7_u32);
        let loser: OperatorState = world.read_model(incumbent);
        let winner: OperatorState = world.read_model(challenger);
        assert_eq!(point.controller, challenger);
        assert_eq!(point.capture_power, 1_800);
        assert_eq!(loser.point_power, 0);
        assert_eq!(control.get_operator_status(incumbent).available_power, 2_200);
        assert_eq!(winner.point_power, 1_800);
        assert_eq!(winner.challenge_power, 0);
        assert_eq!(control.get_operator_status(challenger).available_power, 200);
    }

    #[test]
    #[available_gas(900000000)]
    fn third_party_can_bid_and_loser_resolves_lazily() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        let third = player_three();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_100);
        pool.set_amount(third, 1_210);
        testing::set_contract_address(incumbent);
        control.capture(9, 1_000);
        testing::set_contract_address(challenger);
        control.submit_sealed_bid(9, 0xaaa);
        testing::set_contract_address(third);
        control.submit_sealed_bid(9, 0xbbb);

        testing::set_contract_address(settlement_authority());
        testing::set_block_timestamp(CHALLENGE_PERIOD);
        control.settle_challenge(9, third, 1_100, 1_100);
        let unresolved: OperatorState = world.read_model(challenger);
        assert_eq!(unresolved.challenge_power, 1_100);
        control.sync_operator(challenger);
        let resolved: OperatorState = world.read_model(challenger);
        assert_eq!(resolved.challenge_power, 0);
        assert_eq!(control.get_operator_status(challenger).available_power, 1_100);
        assert_eq!(resolved.active_challenge_id, 0);
        testing::set_contract_address(challenger);
        control.capture(12, 1_100);
        assert_eq!(control.get_control_point_status(12).controller, challenger);
    }

    #[test]
    #[available_gas(700000000)]
    fn collateral_moves_point_power_into_sealed_bid_without_duplication() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 500);
        testing::set_contract_address(incumbent);
        control.capture(10, 1_000);
        testing::set_contract_address(challenger);
        control.capture(11, 500);
        pool.set_amount(challenger, 1_100);
        control.submit_sealed_bid_with_collateral(10, 11, 0xabc);

        let source: ControlPoint = world.read_model(11_u32);
        let participant: ChallengeParticipant = world.read_model((1_u64, challenger));
        let operator: OperatorState = world.read_model(challenger);
        assert_eq!(source.controller, 0.try_into().unwrap());
        assert_eq!(participant.locked_power, 1_100);
        assert_eq!(operator.point_power, 0);
        assert_eq!(operator.challenge_power, 1_100);
        assert_eq!(operator.controlled_point_count, 0);
    }

    #[test]
    #[available_gas(650000000)]
    fn collateral_can_supply_the_entire_bid_lock() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 400);
        pool.set_amount(challenger, 500);
        testing::set_contract_address(incumbent);
        control.capture(10, 400);
        testing::set_contract_address(challenger);
        control.capture(11, 500);
        control.submit_sealed_bid_with_collateral(10, 11, 0xabc);

        let participant: ChallengeParticipant = world.read_model((1_u64, challenger));
        let operator = control.get_operator_status(challenger);
        assert_eq!(participant.locked_power, 500);
        assert_eq!(operator.available_power, 0);
    }

    #[test]
    #[available_gas(700000000)]
    #[should_panic(expected: ('active challenge', 'ENTRYPOINT_FAILED'))]
    fn operator_cannot_participate_in_two_challenges() {
        let (_, control, pool) = setup();
        let a = player_one();
        let b = player_two();
        let c = player_three();
        pool.set_amount(a, 1_000);
        pool.set_amount(b, 2_200);
        pool.set_amount(c, 1_000);
        testing::set_contract_address(a);
        control.capture(1, 1_000);
        testing::set_contract_address(c);
        control.capture(2, 1_000);
        testing::set_contract_address(b);
        control.submit_sealed_bid(1, 0xaaa);
        control.submit_sealed_bid(2, 0xbbb);
    }

    #[test]
    #[available_gas(400000000)]
    fn release_returns_commitment_to_available_power() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 400);
        control.release(1);
        let operator = control.get_operator_status(player);
        assert_eq!(operator.point_power, 0);
        assert_eq!(operator.available_power, 1_000);
    }

    #[test]
    #[available_gas(450000000)]
    fn external_power_reduction_retires_operator_and_invalidates_points() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 1_000);
        pool.set_amount(player, 999);
        assert(control.get_operator_status(player).needs_sync, 'sync not detected');
        control.sync_operator(player);
        let operator: OperatorState = world.read_model(player);
        let point = control.get_control_point_status(1);
        assert(operator.retired, 'operator not retired');
        assert_eq!(operator.point_power, 0);
        assert_eq!(control.get_operator_status(player).available_power, 0);
        assert(point.stale, 'point not invalidated');
    }

    #[test]
    #[available_gas(500000000)]
    fn official_unpool_intent_permanently_retires_address() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 1_000);
        pool.set_unpool(player, 1_000, 99_999);
        control.sync_operator(player);
        let operator: OperatorState = world.read_model(player);
        assert(operator.retired, 'operator not retired');
        assert_eq!(control.get_operator_status(player).available_power, 0);
        assert(control.get_control_point_status(1).stale, 'point not invalidated');
    }

    #[test]
    #[available_gas(450000000)]
    #[should_panic(expected: ('operator retired', 'ENTRYPOINT_FAILED'))]
    fn retired_address_cannot_play_again_after_restaking() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.retire();
        pool.set_amount(player, 10_000);
        control.capture(1, 1_000);
    }

    #[test]
    #[available_gas(400000000)]
    fn explicit_retirement_is_idempotent_while_paused() {
        let (mut world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 1_000);
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.paused = true;
        world.write_model_test(@config);
        control.relinquish_all();
        control.relinquish_all();
        let operator: OperatorState = world.read_model(player);
        assert(operator.retired, 'operator not retired');
    }

    #[test]
    #[available_gas(300000000)]
    #[should_panic(expected: ('challenge active', 'ENTRYPOINT_FAILED'))]
    fn challenge_cannot_settle_before_deadline() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_100);
        testing::set_contract_address(incumbent);
        control.capture(1, 1_000);
        testing::set_contract_address(challenger);
        control.submit_sealed_bid(1, 0xabc);
        testing::set_contract_address(settlement_authority());
        control.settle_challenge(1, challenger, 1_000, 1_100);
    }

    #[test]
    #[available_gas(400000000)]
    #[should_panic(expected: ('not settle authority', 'ENTRYPOINT_FAILED'))]
    fn player_cannot_publish_sealed_settlement() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_100);
        testing::set_contract_address(incumbent);
        control.capture(1, 1_000);
        testing::set_contract_address(challenger);
        control.submit_sealed_bid(1, 0xabc);
        testing::set_block_timestamp(CHALLENGE_PERIOD);
        control.settle_challenge(1, challenger, 1_000, 1_100);
    }

    #[test]
    #[available_gas(300000000)]
    #[should_panic(expected: ('bid already submitted', 'ENTRYPOINT_FAILED'))]
    fn operator_cannot_replace_sealed_bid() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_200);
        testing::set_contract_address(incumbent);
        control.capture(1, 1_000);
        testing::set_contract_address(challenger);
        control.submit_sealed_bid(1, 0xabc);
        pool.set_amount(challenger, 1_300);
        control.submit_sealed_bid(1, 0xdef);
    }

    #[test]
    #[available_gas(300000000)]
    #[should_panic(expected: ('sync batch too large', 'ENTRYPOINT_FAILED'))]
    fn rejects_oversized_sync_batch() {
        let (_, control, _) = setup();
        let mut operators = array![];
        while operators.len() <= 50 {
            let address: felt252 = (operators.len() + 1).into();
            operators.append(address.try_into().unwrap());
        }
        control.sync_operators(operators.span());
    }
}
