#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{IWorldDispatcherTrait, WorldStorage, WorldStorageTrait, world};
    use dojo_cairo_test::{
        ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
        spawn_test_world,
    };
    use stakewars::models::{
        CONFIG_ID, Challenge, ChallengeParticipant, GameConfig, MAINNET_CHALLENGE_PERIOD_SECONDS,
        MAINNET_MINIMUM_STAKE, OperatorState, SEPOLIA_CHALLENGE_PERIOD_SECONDS,
        SEPOLIA_MINIMUM_STAKE, m_Challenge, m_ChallengeCounter, m_ChallengeParticipant,
        m_ControlPoint, m_GameConfig, m_OperatorState,
    };
    use stakewars::systems::admin::{IAdminDispatcher, IAdminDispatcherTrait, admin};
    use stakewars::systems::control::{
        CaptureRequest, IControlDispatcher, IControlDispatcherTrait, ReinforcementRequest, control,
    };
    use stakewars::tests::mock_staking_pool::{
        IMockStakingPoolDispatcher, IMockStakingPoolDispatcherTrait, mock_staking_pool,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{ContractAddress, SyscallResultTrait, testing};

    const MINIMUM_STAKE: u128 = 100;
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

    fn player_four() -> ContractAddress {
        0x444.try_into().unwrap()
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
                TestResource::Event(admin::e_AdminTransferred::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointCaptured::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointReinforced::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointReleased::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengeInitiated::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengeEscalated::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointSacrificed::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengeSettled::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengePositionResolved::TEST_CLASS_HASH),
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
            resource_selector(@"StakingPoolChanged"), resource_selector(@"AdminTransferred"),
        ]
            .span()
    }

    fn control_writer_selectors() -> Span<felt252> {
        [
            resource_selector(@"OperatorState"), resource_selector(@"ControlPoint"),
            resource_selector(@"ChallengeCounter"), resource_selector(@"Challenge"),
            resource_selector(@"ChallengeParticipant"), resource_selector(@"ControlPointCaptured"),
            resource_selector(@"ControlPointReinforced"),
            resource_selector(@"ControlPointReleased"), resource_selector(@"ChallengeInitiated"),
            resource_selector(@"ChallengeEscalated"), resource_selector(@"ControlPointSacrificed"),
            resource_selector(@"ChallengeSettled"), resource_selector(@"ChallengePositionResolved"),
            resource_selector(@"OperatorDisqualified"), resource_selector(@"OperatorRetired"),
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
                    staking_pool: pool_address,
                    minimum_stake: MINIMUM_STAKE,
                    challenge_period_seconds: CHALLENGE_PERIOD,
                    control_point_limit: POINT_LIMIT,
                    paused: false,
                },
            );
        let (control_address, _) = world.dns(@"control").unwrap();
        (world, IControlDispatcher { contract_address: control_address }, pool)
    }

    fn setup_uninitialized() -> (WorldStorage, IAdminDispatcher, IMockStakingPoolDispatcher) {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
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
    fn world_owner_initializes_open_challenge_rules() {
        let (world, admin, pool) = setup_uninitialized();
        let owner = player_one();
        world.dispatcher.grant_owner(dojo::utils::bytearray_hash(@"stakewars"), owner);
        testing::set_contract_address(owner);
        admin.initialize(pool.contract_address, MINIMUM_STAKE, CHALLENGE_PERIOD, POINT_LIMIT);
        let config: GameConfig = world.read_model(CONFIG_ID);
        assert_eq!(config.challenge_period_seconds, CHALLENGE_PERIOD);
        assert_eq!(config.minimum_stake, MINIMUM_STAKE);
    }

    #[test]
    fn network_rule_presets_match_expected_values() {
        assert_eq!(SEPOLIA_MINIMUM_STAKE, 100_000_000_000_000_000);
        assert_eq!(MAINNET_MINIMUM_STAKE, 100_000_000_000_000_000_000);
        assert_eq!(SEPOLIA_CHALLENGE_PERIOD_SECONDS, 180);
        assert_eq!(MAINNET_CHALLENGE_PERIOD_SECONDS, 10_800);
    }

    #[test]
    #[available_gas(500000000)]
    fn capture_and_reinforcement_commit_selected_force() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(42, 400);
        control.reinforce(42, 150);
        let point = control.get_control_point_status(42);
        let operator = control.get_operator_status(player);
        assert_eq!(point.capture_force, 550);
        assert_eq!(operator.point_force, 550);
        assert_eq!(operator.available_force, 450);
    }

    #[test]
    #[available_gas(500000000)]
    fn allocations_can_back_multiple_points_without_duplication() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 300);
        control.capture(2, 400);
        let operator = control.get_operator_status(player);
        assert_eq!(operator.point_force, 700);
        assert_eq!(operator.available_force, 300);
        assert_eq!(operator.controlled_point_count, 2);
    }

    #[test]
    #[available_gas(700000000)]
    fn captures_and_reinforces_multiple_points_atomically() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        testing::set_block_timestamp(2_000);

        control
            .capture_many(
                [
                    CaptureRequest { control_point_id: 10, allocation: 200 },
                    CaptureRequest { control_point_id: 11, allocation: 300 },
                ]
                    .span(),
            );

        let first = control.get_control_point_status(10);
        let second = control.get_control_point_status(11);
        let captured_operator = control.get_operator_status(player);
        assert_eq!(first.controller, player);
        assert_eq!(first.capture_force, 200);
        assert_eq!(first.controlled_since, 2_000);
        assert_eq!(second.controller, player);
        assert_eq!(second.capture_force, 300);
        assert_eq!(second.controlled_since, 2_000);
        assert_eq!(captured_operator.point_force, 500);
        assert_eq!(captured_operator.controlled_point_count, 2);
        assert_eq!(captured_operator.available_force, 500);

        control
            .reinforce_many(
                [
                    ReinforcementRequest { control_point_id: 10, additional_allocation: 100 },
                    ReinforcementRequest { control_point_id: 11, additional_allocation: 150 },
                ]
                    .span(),
            );

        let reinforced_first = control.get_control_point_status(10);
        let reinforced_second = control.get_control_point_status(11);
        let reinforced_operator = control.get_operator_status(player);
        assert_eq!(reinforced_first.capture_force, 300);
        assert_eq!(reinforced_second.capture_force, 450);
        assert_eq!(reinforced_operator.point_force, 750);
        assert_eq!(reinforced_operator.controlled_point_count, 2);
        assert_eq!(reinforced_operator.available_force, 250);
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('empty capture batch', 'ENTRYPOINT_FAILED'))]
    fn rejects_empty_capture_batch() {
        let (_, control, _) = setup();
        control.capture_many([].span());
    }

    #[test]
    #[available_gas(300000000)]
    #[should_panic(expected: ('capture batch too large', 'ENTRYPOINT_FAILED'))]
    fn rejects_oversized_capture_batch() {
        let (_, control, _) = setup();
        let mut captures = array![];
        let mut id: u32 = 0;
        while id < 201 {
            captures.append(CaptureRequest { control_point_id: id, allocation: MINIMUM_STAKE });
            id += 1;
        }
        control.capture_many(captures.span());
    }

    #[test]
    #[available_gas(400000000)]
    #[should_panic(expected: ('insufficient available force', 'ENTRYPOINT_FAILED'))]
    fn committed_force_cannot_back_another_capture() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 500);
        testing::set_contract_address(player);
        control.capture(1, 400);
        control.capture(2, 200);
    }

    #[test]
    #[available_gas(800000000)]
    fn opening_challenge_keeps_defense_at_risk_and_locks_visible_lead() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(7, 400);
        testing::set_contract_address(challenger);
        testing::set_block_timestamp(2_000);
        control.challenge(7, 500);

        let challenge: Challenge = world.read_model(1_u64);
        let defender = control.get_operator_status(incumbent);
        let attacker = control.get_operator_status(challenger);
        assert_eq!(challenge.leader, challenger);
        assert_eq!(challenge.leading_force, 500);
        assert_eq!(challenge.last_loser, incumbent);
        assert_eq!(challenge.last_losing_force, 400);
        assert_eq!(challenge.deadline, 2_000 + CHALLENGE_PERIOD);
        assert_eq!(defender.point_force, 400);
        assert_eq!(defender.spent_force, 0);
        assert_eq!(defender.active_challenge_count, 1);
        assert_eq!(defender.available_force, 600);
        assert_eq!(attacker.challenge_force, 500);
        assert_eq!(attacker.available_force, 500);
        assert_eq!(control.get_control_point_status(7).required_stake, 550);
    }

    #[test]
    #[available_gas(700000000)]
    fn minimum_raise_is_ten_percent_rounded_up() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        pool.set_amount(incumbent, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 100);
        control.capture(2, 101);

        assert_eq!(control.get_control_point_status(1).required_stake, 110);
        assert_eq!(control.get_control_point_status(2).required_stake, 112);
    }

    #[test]
    #[available_gas(1300000000)]
    fn any_operator_can_take_lead_and_each_raise_resets_the_window() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let first = player_two();
        let second = player_three();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(first, 1_000);
        pool.set_amount(second, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(9, 400);
        testing::set_contract_address(first);
        testing::set_block_timestamp(100);
        control.challenge(9, 500);
        testing::set_contract_address(second);
        testing::set_block_timestamp(1_000);
        control.challenge(9, 550);

        let challenge: Challenge = world.read_model(1_u64);
        let displaced = control.get_operator_status(first);
        let leader = control.get_operator_status(second);
        assert_eq!(challenge.leader, second);
        assert_eq!(challenge.leading_force, 550);
        assert_eq!(challenge.lead_change_count, 2);
        assert_eq!(challenge.deadline, 1_000 + CHALLENGE_PERIOD);
        assert_eq!(challenge.participant_count, 3);
        assert_eq!(displaced.challenge_force, 500);
        assert_eq!(displaced.spent_force, 0);
        assert_eq!(displaced.active_challenge_count, 1);
        assert_eq!(leader.challenge_force, 550);
        assert_eq!(leader.active_challenge_count, 1);
    }

    #[test]
    #[available_gas(1600000000)]
    fn displaced_operator_reenters_by_locking_only_the_increment() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let first = player_two();
        let second = player_three();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(first, 700);
        pool.set_amount(second, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(9, 400);
        testing::set_contract_address(first);
        control.challenge(9, 500);
        testing::set_contract_address(second);
        control.challenge(9, 600);
        testing::set_contract_address(first);
        control.challenge(9, 700);

        let challenge: Challenge = world.read_model(1_u64);
        let returned = control.get_operator_status(first);
        let displaced = control.get_operator_status(second);
        assert_eq!(challenge.leader, first);
        assert_eq!(challenge.leading_force, 700);
        let position: ChallengeParticipant = world.read_model((1_u64, first));
        assert_eq!(position.committed_force, 700);
        assert_eq!(returned.spent_force, 0);
        assert_eq!(returned.challenge_force, 700);
        assert_eq!(returned.available_force, 0);
        assert_eq!(displaced.challenge_force, 600);
        assert_eq!(displaced.spent_force, 0);
    }

    #[test]
    #[available_gas(800000000)]
    #[should_panic(expected: ('already leading', 'ENTRYPOINT_FAILED'))]
    fn current_leader_cannot_extend_its_own_clock() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 400);
        testing::set_contract_address(challenger);
        control.challenge(1, 500);
        control.challenge(1, 600);
    }

    #[test]
    #[available_gas(900000000)]
    #[should_panic(expected: ('challenge too weak', 'ENTRYPOINT_FAILED'))]
    fn opening_challenge_must_raise_the_garrison_by_ten_percent() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 100);
        testing::set_contract_address(challenger);
        control.challenge(1, 109);
    }

    #[test]
    #[available_gas(900000000)]
    #[should_panic(expected: ('challenge too weak', 'ENTRYPOINT_FAILED'))]
    fn interested_operator_must_raise_the_public_lead_by_ten_percent() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let leader = player_two();
        let interested = player_three();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(leader, 1_000);
        pool.set_amount(interested, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 400);
        testing::set_contract_address(leader);
        control.challenge(1, 500);
        testing::set_contract_address(interested);
        control.challenge(1, 549);
    }

    #[test]
    #[available_gas(900000000)]
    fn permissionless_settlement_allocates_the_winning_force() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        let settler = player_four();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(7, 400);
        testing::set_contract_address(challenger);
        testing::set_block_timestamp(100);
        control.challenge(7, 500);
        testing::set_contract_address(settler);
        testing::set_block_timestamp(100 + CHALLENGE_PERIOD);
        control.settle_challenge(7);

        let point = control.get_control_point_status(7);
        let winner = control.get_operator_status(challenger);
        let loser = control.get_operator_status(incumbent);
        assert_eq!(point.controller, challenger);
        assert_eq!(point.capture_force, 500);
        assert_eq!(winner.point_force, 500);
        assert_eq!(winner.challenge_force, 0);
        assert_eq!(winner.active_challenge_count, 0);
        assert_eq!(loser.spent_force, 400);
        assert_eq!(loser.available_force, 600);
    }

    #[test]
    #[available_gas(1600000000)]
    fn alternating_challengers_add_only_increments_and_loser_spends_final_commitment() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(7, 400);
        testing::set_contract_address(challenger);
        control.challenge(7, 500);
        testing::set_contract_address(incumbent);
        control.challenge(7, 700);
        let incumbent_mid = control.get_operator_status(incumbent);
        assert_eq!(incumbent_mid.point_force, 400);
        assert_eq!(incumbent_mid.challenge_force, 300);
        assert_eq!(incumbent_mid.spent_force, 0);
        testing::set_contract_address(challenger);
        control.challenge(7, 800);
        let challenger_mid = control.get_operator_status(challenger);
        assert_eq!(challenger_mid.challenge_force, 800);
        assert_eq!(challenger_mid.spent_force, 0);

        testing::set_block_timestamp(CHALLENGE_PERIOD);
        control.settle_challenge(7);
        let point = control.get_control_point_status(7);
        let winner = control.get_operator_status(challenger);
        let loser = control.get_operator_status(incumbent);
        assert_eq!(point.controller, challenger);
        assert_eq!(point.capture_force, 800);
        assert_eq!(winner.point_force, 800);
        assert_eq!(winner.challenge_force, 0);
        assert_eq!(loser.point_force, 0);
        assert_eq!(loser.challenge_force, 0);
        assert_eq!(loser.spent_force, 700);
    }

    #[test]
    #[available_gas(2200000000)]
    fn additional_losers_resolve_permissionlessly_after_settlement() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let first = player_two();
        let runner_up = player_three();
        let winner = player_four();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(first, 1_000);
        pool.set_amount(runner_up, 1_000);
        pool.set_amount(winner, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(8, 400);
        testing::set_contract_address(first);
        control.challenge(8, 500);
        testing::set_contract_address(runner_up);
        control.challenge(8, 600);
        testing::set_contract_address(winner);
        control.challenge(8, 700);
        testing::set_block_timestamp(CHALLENGE_PERIOD);
        control.settle_challenge(8);

        let incumbent_result = control.get_operator_status(incumbent);
        let runner_up_result = control.get_operator_status(runner_up);
        let unresolved = control.get_operator_status(first);
        assert_eq!(incumbent_result.spent_force, 400);
        assert_eq!(runner_up_result.challenge_force, 0);
        assert_eq!(runner_up_result.spent_force, 600);
        assert_eq!(unresolved.challenge_force, 500);
        assert_eq!(unresolved.spent_force, 0);
        control.resolve_challenge_position(1, first);
        let resolved = control.get_operator_status(first);
        assert_eq!(resolved.challenge_force, 0);
        assert_eq!(resolved.spent_force, 500);
    }

    #[test]
    #[available_gas(700000000)]
    #[should_panic(expected: ('challenge active', 'ENTRYPOINT_FAILED'))]
    fn challenge_cannot_settle_before_response_window_ends() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 400);
        testing::set_contract_address(challenger);
        control.challenge(1, 500);
        control.settle_challenge(1);
    }

    #[test]
    #[available_gas(800000000)]
    #[should_panic(expected: ('challenge ended', 'ENTRYPOINT_FAILED'))]
    fn expired_challenge_rejects_a_late_force_commitment() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        let late = player_three();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        pool.set_amount(late, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 400);
        testing::set_contract_address(challenger);
        control.challenge(1, 500);
        testing::set_block_timestamp(CHALLENGE_PERIOD);
        testing::set_contract_address(late);
        control.challenge(1, 600);
    }

    #[test]
    #[available_gas(1200000000)]
    fn defender_can_sacrifice_another_point_to_retake_the_lead() {
        let (_, control, pool) = setup();
        let defender = player_one();
        let attacker = player_two();
        pool.set_amount(defender, 1_000);
        pool.set_amount(attacker, 1_000);
        testing::set_contract_address(defender);
        control.capture(10, 400);
        control.capture(11, 300);
        testing::set_contract_address(attacker);
        control.challenge(10, 900);
        testing::set_contract_address(defender);
        control.challenge_with_sacrifice(10, 11, 1_000);

        let source = control.get_control_point_status(11);
        let status = control.get_operator_status(defender);
        assert_eq!(source.capture_force, 0);
        assert_eq!(status.point_force, 400);
        assert_eq!(status.challenge_force, 600);
        assert_eq!(status.spent_force, 0);
        assert_eq!(status.available_force, 0);
    }

    #[test]
    #[available_gas(1800000000)]
    fn operator_can_lead_multiple_contests_and_manage_other_points() {
        let (_, control, pool) = setup();
        let first_incumbent = player_one();
        let operator = player_two();
        let second_incumbent = player_three();
        pool.set_amount(first_incumbent, 100);
        pool.set_amount(operator, 3_000);
        pool.set_amount(second_incumbent, 100);
        testing::set_contract_address(first_incumbent);
        control.capture(1, 100);
        testing::set_contract_address(second_incumbent);
        control.capture(2, 100);
        testing::set_contract_address(operator);
        control.challenge(1, 110);
        control.challenge(2, 110);
        control.capture(3, 100);
        control.reinforce(3, 100);

        let active = control.get_operator_status(operator);
        assert_eq!(active.active_challenge_count, 2);
        assert_eq!(active.challenge_force, 220);
        assert_eq!(active.point_force, 200);

        testing::set_block_timestamp(CHALLENGE_PERIOD);
        control.settle_challenge(1);
        control.settle_challenge(2);
        let settled = control.get_operator_status(operator);
        assert_eq!(settled.active_challenge_count, 0);
        assert_eq!(settled.challenge_force, 0);
        assert_eq!(settled.point_force, 420);
        assert_eq!(settled.controlled_point_count, 3);
    }

    #[test]
    #[available_gas(500000000)]
    fn release_returns_commitment_to_available_force() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(4, 400);
        control.release(4);
        assert_eq!(control.get_operator_status(player).available_force, 1_000);
        assert_eq!(control.get_control_point_status(4).capture_force, 0);
    }

    #[test]
    #[available_gas(600000000)]
    fn force_reduction_retires_operator_and_invalidates_points() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 600);
        pool.set_amount(player, 599);
        control.sync_operator(player);
        let status = control.get_operator_status(player);
        assert(status.retired, 'operator not retired');
        assert_eq!(status.available_force, 0);
        assert_eq!(control.get_control_point_status(1).capture_force, 0);
    }

    #[test]
    #[available_gas(500000000)]
    fn official_unpool_intent_permanently_retires_address() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 400);
        pool.set_unpool(player, 1, 100);
        control.sync_operator(player);
        assert(control.get_operator_status(player).retired, 'operator not retired');
    }

    #[test]
    #[available_gas(500000000)]
    #[should_panic(expected: ('operator retired', 'ENTRYPOINT_FAILED'))]
    fn retired_address_cannot_play_again_after_restaking() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.retire();
        pool.set_amount(player, 2_000);
        control.capture(1, 100);
    }

    #[test]
    #[available_gas(500000000)]
    fn explicit_retirement_is_idempotent_while_paused() {
        let (mut world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 400);
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.paused = true;
        world.write_model_test(@config);
        control.retire();
        control.retire();
        let state: OperatorState = world.read_model(player);
        assert(state.retired, 'operator not retired');
        assert_eq!(state.point_force, 0);
        assert_eq!(state.spent_force, 0);
    }

    #[test]
    #[available_gas(400000000)]
    #[should_panic(expected: ('sync batch too large', 'ENTRYPOINT_FAILED'))]
    fn rejects_oversized_sync_batch() {
        let (_, control, _) = setup();
        let mut operators = array![];
        let mut index: u32 = 1;
        loop {
            if index > 51 {
                break;
            }
            let address_value: felt252 = index.into();
            operators.append(address_value.try_into().unwrap());
            index += 1;
        }
        control.sync_operators(operators.span());
    }
}
