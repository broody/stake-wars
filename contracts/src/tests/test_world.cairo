#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{IWorldDispatcherTrait, WorldStorage, WorldStorageTrait, world};
    use dojo_cairo_test::{
        ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
        spawn_test_world,
    };
    use stakewars::models::{
        CONFIG_ID, ControlPoint, GameConfig, OperatorState, m_ControlPoint, m_GameConfig,
        m_OperatorState,
    };
    use stakewars::systems::admin::{IAdminDispatcher, IAdminDispatcherTrait, admin};
    use stakewars::systems::control::{
        CaptureRequest, IControlDispatcher, IControlDispatcherTrait, MAX_CONTROL_ACTION_BATCH,
        ReinforcementRequest, control,
    };
    use stakewars::tests::mock_staking_pool::{
        IMockStakingPoolDispatcher, IMockStakingPoolDispatcherTrait, mock_staking_pool,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{ContractAddress, SyscallResultTrait, testing};

    const MINIMUM_STAKE: u128 = 100;
    const PREMIUM_BPS: u16 = 1_000;
    const POINT_LIMIT: u32 = 2_000;

    fn player_one() -> ContractAddress {
        0x111.try_into().unwrap()
    }

    fn player_two() -> ContractAddress {
        0x222.try_into().unwrap()
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "stakewars",
            resources: [
                TestResource::Model(m_GameConfig::TEST_CLASS_HASH),
                TestResource::Model(m_OperatorState::TEST_CLASS_HASH),
                TestResource::Model(m_ControlPoint::TEST_CLASS_HASH),
                TestResource::Event(admin::e_ConfigInitialized::TEST_CLASS_HASH),
                TestResource::Event(admin::e_PauseChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_RulesChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_StakingPoolChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_AdminTransferred::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointCaptured::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointDisplaced::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointReinforced::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointReleased::TEST_CLASS_HASH),
                TestResource::Event(control::e_ControlPointRedeployed::TEST_CLASS_HASH),
                TestResource::Event(control::e_OperatorDisqualified::TEST_CLASS_HASH),
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
            resource_selector(@"ControlPointCaptured"), resource_selector(@"ControlPointDisplaced"),
            resource_selector(@"ControlPointReinforced"),
            resource_selector(@"ControlPointReleased"),
            resource_selector(@"ControlPointRedeployed"),
            resource_selector(@"OperatorDisqualified"),
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
                    challenge_premium_bps: PREMIUM_BPS,
                    control_point_limit: POINT_LIMIT,
                    paused: false,
                },
            );

        let (control_address, _) = world.dns(@"control").unwrap();
        let control = IControlDispatcher { contract_address: control_address };
        (world, control, pool)
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
        let admin_system = IAdminDispatcher { contract_address: admin_address };
        (world, admin_system, pool)
    }

    #[test]
    #[available_gas(250000000)]
    fn world_owner_initializes_and_pauses_game() {
        let (world, admin_system, pool) = setup_uninitialized();
        let admin_wallet = player_one();
        world.dispatcher.grant_owner(dojo::utils::bytearray_hash(@"stakewars"), admin_wallet);
        testing::set_contract_address(admin_wallet);

        admin_system.initialize(pool.contract_address, MINIMUM_STAKE, PREMIUM_BPS, POINT_LIMIT);
        let initialized: GameConfig = world.read_model(CONFIG_ID);
        assert_eq!(initialized.admin, admin_wallet);
        assert_eq!(initialized.staking_pool, pool.contract_address);
        assert(!initialized.paused, 'unexpected pause');

        admin_system.set_paused(true);
        let paused: GameConfig = world.read_model(CONFIG_ID);
        assert(paused.paused, 'pause not applied');
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('not admin', 'ENTRYPOINT_FAILED'))]
    fn rejects_unauthorized_admin_change() {
        let (world, _, _) = setup();
        let (admin_address, _) = world.dns(@"admin").unwrap();
        let admin_system = IAdminDispatcher { contract_address: admin_address };
        testing::set_contract_address(player_two());
        admin_system.set_paused(true);
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('game paused', 'ENTRYPOINT_FAILED'))]
    fn paused_game_rejects_capture() {
        let (mut world, control, pool) = setup();
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.paused = true;
        world.write_model_test(@config);
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(0, MINIMUM_STAKE);
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('invalid control point', 'ENTRYPOINT_FAILED'))]
    fn rejects_out_of_range_control_point() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(POINT_LIMIT, MINIMUM_STAKE);
    }

    #[test]
    #[available_gas(200000000)]
    fn captures_neutral_point_at_minimum() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        testing::set_block_timestamp(1_000);

        control.capture(42, MINIMUM_STAKE);

        let point: ControlPoint = world.read_model(42_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(point.controller, player);
        assert_eq!(point.allocated_stake, MINIMUM_STAKE);
        assert_eq!(point.ownership_generation, 1);
        assert_eq!(point.controlled_since, 1_000);
        assert_eq!(operator.generation, 1);
        assert_eq!(operator.total_allocated, MINIMUM_STAKE);
        assert_eq!(operator.controlled_point_count, 1);
        assert_eq!(control.required_stake(42), 110);
        assert_eq!(control.available_stake(player), 900);
    }

    #[test]
    #[available_gas(400000000)]
    fn captures_multiple_points_atomically() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);

        control
            .capture_many(
                [
                    CaptureRequest { control_point_id: 40, allocation: 200 },
                    CaptureRequest { control_point_id: 41, allocation: 300 },
                ]
                    .span(),
            );

        let first: ControlPoint = world.read_model(40_u32);
        let second: ControlPoint = world.read_model(41_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(first.controller, player);
        assert_eq!(first.allocated_stake, 200);
        assert_eq!(second.controller, player);
        assert_eq!(second.allocated_stake, 300);
        assert_eq!(operator.total_allocated, 500);
        assert_eq!(operator.controlled_point_count, 2);
    }

    #[test]
    #[available_gas(10000000000)]
    fn captures_exactly_maximum_batch() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, MINIMUM_STAKE * 200);
        testing::set_contract_address(player);
        let mut captures = array![];
        while captures.len() < MAX_CONTROL_ACTION_BATCH {
            let control_point_id: u32 = captures.len().try_into().unwrap();
            captures.append(CaptureRequest { control_point_id, allocation: MINIMUM_STAKE });
        }

        control.capture_many(captures.span());

        let first: ControlPoint = world.read_model(0_u32);
        let last: ControlPoint = world.read_model(199_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(first.controller, player);
        assert_eq!(last.controller, player);
        assert_eq!(operator.total_allocated, MINIMUM_STAKE * 200);
        assert_eq!(operator.controlled_point_count, 200);
    }

    #[test]
    #[available_gas(400000000)]
    fn captures_multiple_points_sequentially() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);

        control.capture(40, 200);
        control.capture(41, 300);

        let first: ControlPoint = world.read_model(40_u32);
        let second: ControlPoint = world.read_model(41_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(first.controller, player);
        assert_eq!(first.allocated_stake, 200);
        assert_eq!(second.controller, player);
        assert_eq!(second.allocated_stake, 300);
        assert_eq!(operator.total_allocated, 500);
        assert_eq!(operator.controlled_point_count, 2);
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('empty capture batch', 'ENTRYPOINT_FAILED'))]
    fn rejects_empty_capture_batch() {
        let (_, control, _) = setup();
        control.capture_many([].span());
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('capture batch too large', 'ENTRYPOINT_FAILED'))]
    fn rejects_oversized_capture_batch() {
        let (_, control, _) = setup();
        let mut captures = array![];
        while captures.len() <= MAX_CONTROL_ACTION_BATCH {
            let control_point_id: u32 = captures.len().try_into().unwrap();
            captures.append(CaptureRequest { control_point_id, allocation: MINIMUM_STAKE });
        }
        control.capture_many(captures.span());
    }

    #[test]
    #[available_gas(300000000)]
    fn exact_high_ground_challenge_displaces_controller() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_100);

        testing::set_contract_address(incumbent);
        testing::set_block_timestamp(1_000);
        control.capture(7, 1_000);
        testing::set_contract_address(challenger);
        testing::set_block_timestamp(2_000);
        control.capture(7, 1_100);

        let point: ControlPoint = world.read_model(7_u32);
        let incumbent_state: OperatorState = world.read_model(incumbent);
        let challenger_state: OperatorState = world.read_model(challenger);
        assert_eq!(point.controller, challenger);
        assert_eq!(point.allocated_stake, 1_100);
        assert_eq!(point.ownership_generation, 2);
        assert_eq!(point.controlled_since, 2_000);
        assert_eq!(incumbent_state.total_allocated, 0);
        assert_eq!(incumbent_state.controlled_point_count, 0);
        assert_eq!(challenger_state.total_allocated, 1_100);
    }

    #[test]
    #[available_gas(300000000)]
    fn reinforce_then_release_returns_floating_power() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        testing::set_block_timestamp(1_000);

        control.capture(1, 200);
        testing::set_block_timestamp(2_000);
        control.reinforce(1, 300);
        let reinforced: ControlPoint = world.read_model(1_u32);
        assert_eq!(reinforced.allocated_stake, 500);
        assert_eq!(reinforced.controlled_since, 1_000);
        assert_eq!(control.available_stake(player), 500);

        testing::set_block_timestamp(3_000);
        control.release(1);
        let released: ControlPoint = world.read_model(1_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(released.allocated_stake, 0);
        assert_eq!(released.ownership_generation, 2);
        assert_eq!(released.controlled_since, 0);
        assert_eq!(operator.total_allocated, 0);
        assert_eq!(operator.controlled_point_count, 0);
        assert_eq!(control.available_stake(player), 1_000);
    }

    #[test]
    #[available_gas(500000000)]
    fn reinforces_multiple_points_atomically() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control
            .capture_many(
                [
                    CaptureRequest { control_point_id: 50, allocation: 100 },
                    CaptureRequest { control_point_id: 51, allocation: 200 },
                ]
                    .span(),
            );

        control
            .reinforce_many(
                [
                    ReinforcementRequest { control_point_id: 50, additional_allocation: 150 },
                    ReinforcementRequest { control_point_id: 51, additional_allocation: 250 },
                ]
                    .span(),
            );

        let first: ControlPoint = world.read_model(50_u32);
        let second: ControlPoint = world.read_model(51_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(first.allocated_stake, 250);
        assert_eq!(second.allocated_stake, 450);
        assert_eq!(operator.total_allocated, 700);
        assert_eq!(operator.controlled_point_count, 2);
    }

    #[test]
    #[available_gas(20000000000)]
    fn reinforces_exactly_maximum_batch() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, (MINIMUM_STAKE + 1) * 200);
        testing::set_contract_address(player);
        let mut captures = array![];
        let mut reinforcements = array![];
        while captures.len() < MAX_CONTROL_ACTION_BATCH {
            let control_point_id: u32 = captures.len().try_into().unwrap();
            captures.append(CaptureRequest { control_point_id, allocation: MINIMUM_STAKE });
            reinforcements
                .append(ReinforcementRequest { control_point_id, additional_allocation: 1 });
        }

        control.capture_many(captures.span());
        control.reinforce_many(reinforcements.span());

        let first: ControlPoint = world.read_model(0_u32);
        let last: ControlPoint = world.read_model(199_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(first.allocated_stake, MINIMUM_STAKE + 1);
        assert_eq!(last.allocated_stake, MINIMUM_STAKE + 1);
        assert_eq!(operator.total_allocated, (MINIMUM_STAKE + 1) * 200);
        assert_eq!(operator.controlled_point_count, 200);
    }

    #[test]
    #[available_gas(500000000)]
    fn reinforces_multiple_points_sequentially() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control
            .capture_many(
                [
                    CaptureRequest { control_point_id: 50, allocation: 100 },
                    CaptureRequest { control_point_id: 51, allocation: 200 },
                ]
                    .span(),
            );

        control.reinforce(50, 150);
        control.reinforce(51, 250);

        let first: ControlPoint = world.read_model(50_u32);
        let second: ControlPoint = world.read_model(51_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(first.allocated_stake, 250);
        assert_eq!(second.allocated_stake, 450);
        assert_eq!(operator.total_allocated, 700);
        assert_eq!(operator.controlled_point_count, 2);
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('empty reinforce batch', 'ENTRYPOINT_FAILED'))]
    fn rejects_empty_reinforce_batch() {
        let (_, control, _) = setup();
        control.reinforce_many([].span());
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('reinforce batch too large', 'ENTRYPOINT_FAILED'))]
    fn rejects_oversized_reinforce_batch() {
        let (_, control, _) = setup();
        let mut reinforcements = array![];
        while reinforcements.len() <= MAX_CONTROL_ACTION_BATCH {
            let control_point_id: u32 = reinforcements.len().try_into().unwrap();
            reinforcements
                .append(
                    ReinforcementRequest { control_point_id, additional_allocation: MINIMUM_STAKE },
                );
        }
        control.reinforce_many(reinforcements.span());
    }

    #[test]
    #[available_gas(400000000)]
    fn redeploy_is_atomic_and_can_use_floating_power() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        testing::set_block_timestamp(1_000);

        control.capture(10, 400);
        testing::set_block_timestamp(2_000);
        control.redeploy(10, 11, 700);

        let source: ControlPoint = world.read_model(10_u32);
        let destination: ControlPoint = world.read_model(11_u32);
        let operator: OperatorState = world.read_model(player);
        assert_eq!(source.allocated_stake, 0);
        assert_eq!(source.ownership_generation, 2);
        assert_eq!(source.controlled_since, 0);
        assert_eq!(destination.controller, player);
        assert_eq!(destination.allocated_stake, 700);
        assert_eq!(destination.ownership_generation, 1);
        assert_eq!(destination.controlled_since, 2_000);
        assert_eq!(operator.total_allocated, 700);
        assert_eq!(operator.controlled_point_count, 1);
    }

    #[test]
    #[available_gas(400000000)]
    fn external_unstake_invalidates_generation_lazily() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 100);
        testing::set_contract_address(incumbent);
        control.capture(99, 700);

        pool.set_amount(incumbent, 600);
        testing::set_contract_address(challenger);
        control.sync_operator(incumbent);

        let stale_point: ControlPoint = world.read_model(99_u32);
        let invalidated: OperatorState = world.read_model(incumbent);
        assert_eq!(stale_point.controller_generation, 1);
        assert_eq!(invalidated.generation, 2);
        assert_eq!(invalidated.total_allocated, 0);
        assert_eq!(invalidated.controlled_point_count, 0);
        assert_eq!(control.required_stake(99), MINIMUM_STAKE);

        control.capture(99, MINIMUM_STAKE);
        let recaptured: ControlPoint = world.read_model(99_u32);
        assert_eq!(recaptured.controller, challenger);
        assert_eq!(recaptured.allocated_stake, MINIMUM_STAKE);
        assert_eq!(recaptured.ownership_generation, 2);
    }

    #[test]
    #[available_gas(350000000)]
    fn status_views_block_stale_image_management() {
        let (world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        testing::set_block_timestamp(1_000);
        control.capture(12, 800);

        let operator = control.get_operator_status(player);
        let point = control.get_control_point_status(12);
        let points = control.get_control_point_statuses([12, 13].span());
        assert_eq!(operator.live_delegated_amount, 1_000);
        assert_eq!(operator.total_allocated, 800);
        assert_eq!(operator.available_stake, 200);
        assert(!operator.needs_sync, 'unexpected sync');
        assert_eq!(point.controller, player);
        assert_eq!(point.allocated_stake, 800);
        assert_eq!(point.controlled_since, 1_000);
        assert_eq!(point.required_stake, 880);
        assert_eq!(points.len(), 2);
        let first = *points.at(0);
        let second = *points.at(1);
        assert_eq!(first.id, 12);
        assert_eq!(first.controller, player);
        assert_eq!(second.id, 13);
        assert_eq!(second.required_stake, MINIMUM_STAKE);
        assert(!point.stale, 'unexpected stale point');
        assert(control.can_manage_image(12, player, 1), 'image permission missing');
        assert(!control.can_manage_image(12, player, 2), 'wrong generation accepted');

        pool.set_amount(player, 700);
        let stale_operator = control.get_operator_status(player);
        let stale_point = control.get_control_point_status(12);
        assert(stale_operator.needs_sync, 'sync not detected');
        assert_eq!(stale_operator.total_allocated, 800);
        assert_eq!(stale_operator.available_stake, 700);
        assert_eq!(stale_point.controller, 0.try_into().unwrap());
        assert_eq!(stale_point.allocated_stake, 0);
        assert_eq!(stale_point.controlled_since, 0);
        assert_eq!(stale_point.required_stake, MINIMUM_STAKE);
        assert(stale_point.stale, 'stale point not detected');
        assert(stale_point.needs_sync, 'point sync not detected');
        assert(!control.can_manage_image(12, player, 1), 'stale image permission');

        control.sync_operator(player);
        let synchronized: OperatorState = world.read_model(player);
        let invalidated_point = control.get_control_point_status(12);
        assert_eq!(synchronized.generation, 2);
        assert(invalidated_point.stale, 'invalidated point not stale');
        assert(!invalidated_point.needs_sync, 'still needs sync');
    }

    #[test]
    #[available_gas(10000000000)]
    fn reads_exactly_maximum_status_batch() {
        let (_, control, _) = setup();
        let mut control_point_ids = array![];
        while control_point_ids.len() < MAX_CONTROL_ACTION_BATCH {
            control_point_ids.append(control_point_ids.len().try_into().unwrap());
        }

        let statuses = control.get_control_point_statuses(control_point_ids.span());

        assert_eq!(statuses.len(), MAX_CONTROL_ACTION_BATCH);
        let last = *statuses.at(MAX_CONTROL_ACTION_BATCH - 1);
        assert_eq!(last.id, 199);
        assert_eq!(last.required_stake, MINIMUM_STAKE);
    }

    #[test]
    #[available_gas(200000000)]
    fn unknown_operator_sync_does_not_initialize_generation() {
        let (world, control, pool) = setup();
        let operator_address = player_one();
        pool.set_amount(operator_address, 1_000);
        testing::set_contract_address(player_two());

        assert_eq!(control.sync_operator(operator_address), 1_000);
        let operator: OperatorState = world.read_model(operator_address);
        assert_eq!(operator.generation, 0);
        assert_eq!(operator.total_allocated, 0);
        assert_eq!(operator.controlled_point_count, 0);
    }

    #[test]
    #[available_gas(500000000)]
    fn batch_sync_only_writes_changed_operators() {
        let (world, control, pool) = setup();
        let undercollateralized = player_one();
        let healthy = player_two();
        pool.set_amount(undercollateralized, 600);
        pool.set_amount(healthy, 500);

        testing::set_contract_address(undercollateralized);
        control.capture(20, 600);
        testing::set_contract_address(healthy);
        control.capture(21, 500);
        pool.set_amount(undercollateralized, 599);

        assert_eq!(control.sync_operators([undercollateralized, healthy].span()), 1);
        let changed: OperatorState = world.read_model(undercollateralized);
        let unchanged: OperatorState = world.read_model(healthy);
        assert_eq!(changed.generation, 2);
        assert_eq!(changed.total_allocated, 0);
        assert_eq!(unchanged.generation, 1);
        assert_eq!(unchanged.total_allocated, 500);
        assert_eq!(control.sync_operators([undercollateralized, healthy].span()), 0);
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('sync batch too large', 'ENTRYPOINT_FAILED'))]
    fn rejects_oversized_sync_batch() {
        let (_, control, _) = setup();
        let mut operators = array![];
        let mut i: u32 = 0;
        while i < 51 {
            operators.append(player_one());
            i += 1;
        }
        control.sync_operators(operators.span());
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('empty sync batch', 'ENTRYPOINT_FAILED'))]
    fn rejects_empty_sync_batch() {
        let (_, control, _) = setup();
        control.sync_operators([].span());
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('below minimum stake', 'ENTRYPOINT_FAILED'))]
    fn rejects_neutral_capture_below_minimum() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(0, MINIMUM_STAKE - 1);
    }

    #[test]
    #[available_gas(300000000)]
    #[should_panic(expected: ('insufficient challenge', 'ENTRYPOINT_FAILED'))]
    fn rejects_tiny_increment_challenge() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_099);
        testing::set_contract_address(incumbent);
        control.capture(3, 1_000);
        testing::set_contract_address(challenger);
        control.capture(3, 1_099);
    }

    #[test]
    #[available_gas(200000000)]
    #[should_panic(expected: ('allocation exceeds stake', 'ENTRYPOINT_FAILED'))]
    fn rejects_over_allocation() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 500);
        testing::set_contract_address(player);
        control.capture(5, 501);
    }
}
