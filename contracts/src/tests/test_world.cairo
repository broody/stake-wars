#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{IWorldDispatcherTrait, WorldStorage, WorldStorageTrait, world};
    use dojo_cairo_test::{
        ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
        spawn_test_world,
    };
    use openzeppelin_access::accesscontrol::DEFAULT_ADMIN_ROLE;
    use stakewars::models::{
        CONFIG_ID, GameConfig, MAINNET_CHALLENGE_PERIOD_SECONDS, MAINNET_MINIMUM_STAKE,
        OperatorState, SEPOLIA_CHALLENGE_PERIOD_SECONDS, SEPOLIA_MINIMUM_STAKE, Sector,
        m_GameConfig, m_OperatorState, m_Sector, m_SupplyDrop, m_SupplyDropCounter,
        m_SupplyDropHold, m_SupplyDropOperatorSnapshot, m_SupplyDropSectorSnapshot,
        m_SupplyDropStakingPolicy,
    };
    use stakewars::systems::admin::{
        IAdminDispatcher, IAdminDispatcherTrait, IRolesDispatcher, IRolesDispatcherTrait, admin,
    };
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
    const SECTOR_LIMIT: u32 = 2_000;

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
                TestResource::Model(m_SupplyDropHold::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDropStakingPolicy::TEST_CLASS_HASH),
                TestResource::Event(control::e_SupplyDropHoldCleared::TEST_CLASS_HASH),
                TestResource::Model(m_Sector::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDropCounter::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDrop::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDropSectorSnapshot::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDropOperatorSnapshot::TEST_CLASS_HASH),
                TestResource::Event(admin::e_ConfigInitialized::TEST_CLASS_HASH),
                TestResource::Event(admin::e_PauseChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_RulesChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_StakingPoolChanged::TEST_CLASS_HASH),
                TestResource::Event(admin::e_AdminTransferred::TEST_CLASS_HASH),
                TestResource::Event(control::e_SectorCaptured::TEST_CLASS_HASH),
                TestResource::Event(control::e_SectorTakenOver::TEST_CLASS_HASH),
                TestResource::Event(control::e_SectorReinforced::TEST_CLASS_HASH),
                TestResource::Event(control::e_SectorReleased::TEST_CLASS_HASH),
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
            resource_selector(@"SupplyDropHold"), resource_selector(@"SupplyDropHoldCleared"),
            resource_selector(@"OperatorState"), resource_selector(@"Sector"),
            resource_selector(@"SectorCaptured"), resource_selector(@"SectorTakenOver"),
            resource_selector(@"SupplyDropSectorSnapshot"),
            resource_selector(@"SupplyDropOperatorSnapshot"),
            resource_selector(@"SectorReinforced"), resource_selector(@"SectorReleased"),
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
                    sector_limit: SECTOR_LIMIT,
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
    fn world_owner_initializes_rules() {
        let (world, admin, pool) = setup_uninitialized();
        let owner = player_one();
        world.dispatcher.grant_owner(dojo::utils::bytearray_hash(@"stakewars"), owner);
        testing::set_contract_address(owner);
        admin.initialize(pool.contract_address, MINIMUM_STAKE, CHALLENGE_PERIOD, SECTOR_LIMIT);
        let config: GameConfig = world.read_model(CONFIG_ID);
        assert_eq!(config.minimum_stake, MINIMUM_STAKE);
        assert_eq!(config.sector_limit, SECTOR_LIMIT);
    }

    #[test]
    #[available_gas(400000000)]
    fn game_admin_transfer_moves_access_control_admin_role() {
        let (world, admin, pool) = setup_uninitialized();
        let first_admin = player_one();
        let next_admin = player_two();
        world.dispatcher.grant_owner(dojo::utils::bytearray_hash(@"stakewars"), first_admin);
        testing::set_contract_address(first_admin);
        admin.initialize(pool.contract_address, MINIMUM_STAKE, CHALLENGE_PERIOD, SECTOR_LIMIT);
        let roles = IRolesDispatcher { contract_address: admin.contract_address };
        assert!(roles.has_role(DEFAULT_ADMIN_ROLE, first_admin));

        admin.transfer_admin(next_admin);

        assert!(!roles.has_role(DEFAULT_ADMIN_ROLE, first_admin));
        assert!(roles.has_role(DEFAULT_ADMIN_ROLE, next_admin));
        testing::set_contract_address(next_admin);
        roles.grant_role(123, player_three());
        assert!(roles.has_role(123, player_three()));
    }

    #[test]
    #[should_panic(expected: ('default admin managed', 'ENTRYPOINT_FAILED'))]
    #[available_gas(400000000)]
    fn default_admin_role_cannot_be_granted_directly() {
        let (world, admin, pool) = setup_uninitialized();
        let game_admin = player_one();
        world.dispatcher.grant_owner(dojo::utils::bytearray_hash(@"stakewars"), game_admin);
        testing::set_contract_address(game_admin);
        admin.initialize(pool.contract_address, MINIMUM_STAKE, CHALLENGE_PERIOD, SECTOR_LIMIT);

        IRolesDispatcher { contract_address: admin.contract_address }
            .grant_role(DEFAULT_ADMIN_ROLE, player_two());
    }

    #[test]
    #[should_panic(expected: ('default admin managed', 'ENTRYPOINT_FAILED'))]
    #[available_gas(400000000)]
    fn default_admin_role_cannot_be_renounced_directly() {
        let (world, admin, pool) = setup_uninitialized();
        let game_admin = player_one();
        world.dispatcher.grant_owner(dojo::utils::bytearray_hash(@"stakewars"), game_admin);
        testing::set_contract_address(game_admin);
        admin.initialize(pool.contract_address, MINIMUM_STAKE, CHALLENGE_PERIOD, SECTOR_LIMIT);

        IRolesDispatcher { contract_address: admin.contract_address }
            .renounce_role(DEFAULT_ADMIN_ROLE, game_admin);
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
        let sector = control.get_sector_status(42);
        let operator = control.get_operator_status(player);
        assert_eq!(sector.capture_force, 550);
        assert_eq!(operator.sector_force, 550);
        assert_eq!(operator.available_force, 450);
    }

    #[test]
    #[available_gas(500000000)]
    fn allocations_can_back_multiple_sectors_without_duplication() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 300);
        control.capture(2, 400);
        let operator = control.get_operator_status(player);
        assert_eq!(operator.sector_force, 700);
        assert_eq!(operator.available_force, 300);
        assert_eq!(operator.controlled_sector_count, 2);
    }

    #[test]
    #[available_gas(700000000)]
    fn captures_and_reinforces_multiple_sectors_atomically() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        testing::set_block_timestamp(2_000);

        control
            .capture_many(
                [
                    CaptureRequest { sector_id: 10, allocation: 200 },
                    CaptureRequest { sector_id: 11, allocation: 300 },
                ]
                    .span(),
            );

        let first = control.get_sector_status(10);
        let second = control.get_sector_status(11);
        let captured_operator = control.get_operator_status(player);
        assert_eq!(first.controller, player);
        assert_eq!(first.capture_force, 200);
        assert_eq!(first.controlled_since, 2_000);
        assert_eq!(second.controller, player);
        assert_eq!(second.capture_force, 300);
        assert_eq!(second.controlled_since, 2_000);
        assert_eq!(captured_operator.sector_force, 500);
        assert_eq!(captured_operator.controlled_sector_count, 2);
        assert_eq!(captured_operator.available_force, 500);

        control
            .reinforce_many(
                [
                    ReinforcementRequest { sector_id: 10, additional_allocation: 100 },
                    ReinforcementRequest { sector_id: 11, additional_allocation: 150 },
                ]
                    .span(),
            );

        let reinforced_first = control.get_sector_status(10);
        let reinforced_second = control.get_sector_status(11);
        let reinforced_operator = control.get_operator_status(player);
        assert_eq!(reinforced_first.capture_force, 300);
        assert_eq!(reinforced_second.capture_force, 450);
        assert_eq!(reinforced_operator.sector_force, 750);
        assert_eq!(reinforced_operator.controlled_sector_count, 2);
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
            captures.append(CaptureRequest { sector_id: id, allocation: MINIMUM_STAKE });
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
    #[available_gas(700000000)]
    fn minimum_takeover_is_ten_percent_rounded_up() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        pool.set_amount(incumbent, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 100);
        control.capture(2, 101);

        assert_eq!(control.get_sector_status(1).required_stake, 110);
        assert_eq!(control.get_sector_status(2).required_stake, 112);
        assert_eq!(control.required_stake(3), MINIMUM_STAKE);
    }

    #[test]
    #[available_gas(900000000)]
    fn takeover_transfers_the_sector_and_returns_the_displaced_force() {
        let (world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        testing::set_block_timestamp(1_000);
        control.capture(7, 400);
        let captured: Sector = world.read_model(7_u32);

        testing::set_contract_address(challenger);
        testing::set_block_timestamp(2_000);
        control.capture(7, 440);

        let sector = control.get_sector_status(7);
        let displaced = control.get_operator_status(incumbent);
        let taker = control.get_operator_status(challenger);
        assert_eq!(sector.controller, challenger);
        assert_eq!(sector.capture_force, 440);
        assert_eq!(sector.controlled_since, 2_000);
        assert_eq!(sector.ownership_generation, captured.ownership_generation + 1);
        assert_eq!(sector.required_stake, 484);
        assert_eq!(displaced.sector_force, 0);
        assert_eq!(displaced.controlled_sector_count, 0);
        assert_eq!(displaced.available_force, 1_000);
        assert!(!displaced.retired);
        assert_eq!(taker.sector_force, 440);
        assert_eq!(taker.controlled_sector_count, 1);
        assert_eq!(taker.available_force, 560);
    }

    #[test]
    #[available_gas(1600000000)]
    fn contested_sector_changes_hands_as_each_takeover_raises_the_price() {
        let (_, control, pool) = setup();
        let first = player_one();
        let second = player_two();
        pool.set_amount(first, 1_000);
        pool.set_amount(second, 1_000);
        testing::set_contract_address(first);
        control.capture(9, 400);
        testing::set_contract_address(second);
        control.capture(9, 440);
        testing::set_contract_address(first);
        control.capture(9, 484);

        let retaken = control.get_sector_status(9);
        assert_eq!(retaken.controller, first);
        assert_eq!(retaken.required_stake, 533);
        assert_eq!(control.get_operator_status(first).available_force, 516);
        assert_eq!(control.get_operator_status(second).available_force, 1_000);

        testing::set_contract_address(second);
        control.capture(9, 533);
        assert_eq!(control.get_sector_status(9).controller, second);
        assert_eq!(control.get_operator_status(first).available_force, 1_000);
        assert_eq!(control.get_operator_status(second).sector_force, 533);
    }

    #[test]
    #[available_gas(900000000)]
    #[should_panic(expected: ('takeover too weak', 'ENTRYPOINT_FAILED'))]
    fn takeover_must_raise_the_defense_by_ten_percent() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 100);
        testing::set_contract_address(challenger);
        control.capture(1, 109);
    }

    #[test]
    #[available_gas(900000000)]
    fn takeover_price_never_drops_below_the_minimum_stake() {
        let (mut world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 100);
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.minimum_stake = 200;
        world.write_model_test(@config);

        assert_eq!(control.get_sector_status(1).required_stake, 200);
        testing::set_contract_address(challenger);
        control.capture(1, 200);
        assert_eq!(control.get_sector_status(1).controller, challenger);
    }

    #[test]
    #[available_gas(900000000)]
    #[should_panic(expected: ('takeover too weak', 'ENTRYPOINT_FAILED'))]
    fn takeover_below_a_raised_minimum_stake_is_rejected() {
        let (mut world, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 100);
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.minimum_stake = 200;
        world.write_model_test(@config);
        testing::set_contract_address(challenger);
        control.capture(1, 199);
    }

    #[test]
    #[available_gas(700000000)]
    #[should_panic(expected: ('already controller', 'ENTRYPOINT_FAILED'))]
    fn controller_cannot_take_over_its_own_sector() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 100);
        control.capture(1, 200);
    }

    #[test]
    #[available_gas(900000000)]
    #[should_panic(expected: ('insufficient available force', 'ENTRYPOINT_FAILED'))]
    fn takeover_is_limited_by_available_force() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 500);
        testing::set_contract_address(incumbent);
        control.capture(1, 500);
        testing::set_contract_address(challenger);
        control.capture(1, 550);
    }

    #[test]
    #[available_gas(900000000)]
    fn sector_of_an_invalid_controller_is_captured_at_the_minimum_stake() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 600);
        pool.set_amount(incumbent, 599);

        let stale = control.get_sector_status(1);
        assert!(stale.stale);
        assert_eq!(stale.required_stake, MINIMUM_STAKE);
        testing::set_contract_address(challenger);
        control.capture(1, MINIMUM_STAKE);

        assert_eq!(control.get_sector_status(1).controller, challenger);
        assert!(control.get_operator_status(incumbent).retired);
        assert_eq!(control.get_operator_status(challenger).sector_force, MINIMUM_STAKE);
    }

    #[test]
    #[available_gas(1400000000)]
    fn batch_capture_takes_over_occupied_sectors_and_captures_neutral_ones() {
        let (_, control, pool) = setup();
        let incumbent = player_one();
        let challenger = player_two();
        pool.set_amount(incumbent, 1_000);
        pool.set_amount(challenger, 1_000);
        testing::set_contract_address(incumbent);
        control.capture(1, 100);
        control.capture(2, 200);
        testing::set_contract_address(challenger);
        control
            .capture_many(
                [
                    CaptureRequest { sector_id: 1, allocation: 110 },
                    CaptureRequest { sector_id: 2, allocation: 220 },
                    CaptureRequest { sector_id: 3, allocation: 100 },
                ]
                    .span(),
            );

        let displaced = control.get_operator_status(incumbent);
        let taker = control.get_operator_status(challenger);
        assert_eq!(control.get_sector_status(1).controller, challenger);
        assert_eq!(control.get_sector_status(2).controller, challenger);
        assert_eq!(control.get_sector_status(3).controller, challenger);
        assert_eq!(displaced.sector_force, 0);
        assert_eq!(displaced.controlled_sector_count, 0);
        assert_eq!(displaced.available_force, 1_000);
        assert_eq!(taker.sector_force, 430);
        assert_eq!(taker.controlled_sector_count, 3);
    }

    #[test]
    #[available_gas(700000000)]
    fn reinforcement_raises_the_takeover_price() {
        let (_, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 100);
        control.reinforce(1, 100);
        assert_eq!(control.get_sector_status(1).required_stake, 220);
    }

    #[test]
    #[available_gas(900000000)]
    fn legacy_challenge_and_spent_force_are_forgiven() {
        let (mut world, control, pool) = setup();
        let player = player_one();
        pool.set_amount(player, 1_000);
        testing::set_contract_address(player);
        control.capture(1, 400);
        let mut state: OperatorState = world.read_model(player);
        state.challenge_force = 250;
        state.spent_force = 700;
        state.active_challenge_count = 1;
        world.write_model_test(@state);

        control.sync_operator(player);
        let status = control.get_operator_status(player);
        assert!(!status.retired);
        assert!(!status.needs_sync);
        assert_eq!(status.available_force, 600);
        control.capture(2, 600);
        assert_eq!(control.get_operator_status(player).available_force, 0);
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
        assert_eq!(control.get_sector_status(4).capture_force, 0);
    }

    #[test]
    #[available_gas(600000000)]
    fn force_reduction_retires_operator_and_invalidates_sectors() {
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
        assert_eq!(control.get_sector_status(1).capture_force, 0);
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
        assert_eq!(state.sector_force, 0);
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
