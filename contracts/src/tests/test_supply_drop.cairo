#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorage, WorldStorageTrait, world};
    use dojo_cairo_test::{
        ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
        spawn_test_world,
    };
    use stakewars::assets::{
        IERC1155AssetDispatcher, IERC1155AssetDispatcherTrait, IERC20AssetDispatcher,
        IERC20AssetDispatcherTrait, IERC721AssetDispatcher, IERC721AssetDispatcherTrait,
    };
    use stakewars::models::{
        CONFIG_ID, GameConfig, SUPPLY_DROP_PRIZE_ERC1155, SUPPLY_DROP_PRIZE_ERC20,
        SUPPLY_DROP_PRIZE_ERC721, SUPPLY_DROP_STATUS_ACTIVE, SUPPLY_DROP_STATUS_SETTLED, SupplyDrop,
        m_Challenge, m_ChallengeCounter, m_ChallengeParticipant, m_GameConfig, m_OperatorState,
        m_Sector, m_SupplyDrop, m_SupplyDropCounter, m_SupplyDropHold, m_SupplyDropOperatorSnapshot,
        m_SupplyDropSectorSnapshot, m_SupplyDropStakingPolicy,
    };
    use stakewars::systems::admin::{IRolesDispatcher, IRolesDispatcherTrait, admin as admin_system};
    use stakewars::systems::control::{IControlDispatcher, IControlDispatcherTrait, control};
    use stakewars::systems::supply_drop::{
        ISupplyDropDispatcher, ISupplyDropDispatcherTrait, SUPPLY_DROP_CREATOR_ROLE, supply_drop,
    };
    use stakewars::tests::mock_account::{
        IMockAccountDispatcher, IMockAccountDispatcherTrait, IMockAccountSafeDispatcher,
        IMockAccountSafeDispatcherTrait,
    };
    use stakewars::tests::mock_staking_pool::{
        IMockStakingPoolDispatcher, IMockStakingPoolDispatcherTrait, mock_staking_pool,
    };
    use stakewars::tests::mock_tokens::{
        IMockERC1155ControlDispatcher, IMockERC1155ControlDispatcherTrait,
        IMockERC20ControlDispatcher, IMockERC20ControlDispatcherTrait, IMockERC721ControlDispatcher,
        IMockERC721ControlDispatcherTrait, mock_erc1155, mock_erc20, mock_erc721,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{ContractAddress, SyscallResultTrait, testing};

    const MINIMUM_STAKE: u128 = 100;
    const DURATION: u64 = 604_800;
    const STARTED_AT: u64 = 1_000_000;
    const LOCK_BLOCK: u64 = 1_000;
    const RANDOMNESS_BLOCK: u64 = 1_010;
    const SETTLEMENT_BLOCK: u64 = 1_020;
    const BLOCK_HASH: felt252 = 0x123456789abcdef;

    fn admin() -> ContractAddress {
        0x111.try_into().unwrap()
    }

    fn operator() -> ContractAddress {
        0x222.try_into().unwrap()
    }

    fn challenger() -> ContractAddress {
        0x333.try_into().unwrap()
    }

    fn creator_one() -> ContractAddress {
        0x444.try_into().unwrap()
    }

    fn creator_two() -> ContractAddress {
        0x555.try_into().unwrap()
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
                TestResource::Model(m_ChallengeCounter::TEST_CLASS_HASH),
                TestResource::Model(m_Challenge::TEST_CLASS_HASH),
                TestResource::Model(m_ChallengeParticipant::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDropCounter::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDrop::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDropSectorSnapshot::TEST_CLASS_HASH),
                TestResource::Model(m_SupplyDropOperatorSnapshot::TEST_CLASS_HASH),
                TestResource::Event(control::e_SectorCaptured::TEST_CLASS_HASH),
                TestResource::Event(control::e_SectorReinforced::TEST_CLASS_HASH),
                TestResource::Event(control::e_SectorReleased::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengeInitiated::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengeEscalated::TEST_CLASS_HASH),
                TestResource::Event(control::e_SectorSacrificed::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengeSettled::TEST_CLASS_HASH),
                TestResource::Event(control::e_ChallengePositionResolved::TEST_CLASS_HASH),
                TestResource::Event(control::e_OperatorDisqualified::TEST_CLASS_HASH),
                TestResource::Event(control::e_OperatorRetired::TEST_CLASS_HASH),
                TestResource::Event(supply_drop::e_SupplyDropCreated::TEST_CLASS_HASH),
                TestResource::Event(supply_drop::e_SupplyDropClaimHoldCreated::TEST_CLASS_HASH),
                TestResource::Event(supply_drop::e_SupplyDropToppedUp::TEST_CLASS_HASH),
                TestResource::Event(supply_drop::e_SupplyDropLocked::TEST_CLASS_HASH),
                TestResource::Event(supply_drop::e_SupplyDropRolledOver::TEST_CLASS_HASH),
                TestResource::Event(supply_drop::e_SupplyDropSettled::TEST_CLASS_HASH),
                TestResource::Event(supply_drop::e_SupplyDropClaimed::TEST_CLASS_HASH),
                TestResource::Contract(admin_system::TEST_CLASS_HASH),
                TestResource::Contract(control::TEST_CLASS_HASH),
                TestResource::Contract(supply_drop::TEST_CLASS_HASH),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"stakewars", @"admin"),
            ContractDefTrait::new(@"stakewars", @"control")
                .with_writer_of(control_writer_selectors()),
            ContractDefTrait::new(@"stakewars", @"supply_drop")
                .with_writer_of(supply_drop_writer_selectors()),
        ]
            .span()
    }

    fn control_writer_selectors() -> Span<felt252> {
        [
            resource_selector(@"SupplyDropHold"), resource_selector(@"SupplyDropHoldCleared"),
            resource_selector(@"OperatorState"), resource_selector(@"Sector"),
            resource_selector(@"ChallengeCounter"), resource_selector(@"Challenge"),
            resource_selector(@"ChallengeParticipant"), resource_selector(@"SectorCaptured"),
            resource_selector(@"SupplyDropSectorSnapshot"),
            resource_selector(@"SupplyDropOperatorSnapshot"),
            resource_selector(@"SectorReinforced"), resource_selector(@"SectorReleased"),
            resource_selector(@"ChallengeInitiated"), resource_selector(@"ChallengeEscalated"),
            resource_selector(@"SectorSacrificed"), resource_selector(@"ChallengeSettled"),
            resource_selector(@"ChallengePositionResolved"),
            resource_selector(@"OperatorDisqualified"), resource_selector(@"OperatorRetired"),
        ]
            .span()
    }

    fn supply_drop_writer_selectors() -> Span<felt252> {
        [
            resource_selector(@"SupplyDropHold"), resource_selector(@"SupplyDropStakingPolicy"),
            resource_selector(@"SupplyDropClaimHoldCreated"),
            resource_selector(@"SupplyDropCounter"), resource_selector(@"SupplyDrop"),
            resource_selector(@"SupplyDropCreated"), resource_selector(@"SupplyDropToppedUp"),
            resource_selector(@"SupplyDropLocked"), resource_selector(@"SupplyDropRolledOver"),
            resource_selector(@"SupplyDropSettled"), resource_selector(@"SupplyDropClaimed"),
        ]
            .span()
    }

    fn resource_selector(name: @ByteArray) -> felt252 {
        dojo::utils::selector_from_names(@"stakewars", name)
    }

    fn setup() -> (
        WorldStorage, IControlDispatcher, ISupplyDropDispatcher, IMockStakingPoolDispatcher,
    ) {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
        let (pool_address, _) = deploy_syscall(
            mock_staking_pool::TEST_CLASS_HASH.try_into().unwrap(), 0, [].span(), false,
        )
            .unwrap_syscall();
        world
            .write_model_test(
                @GameConfig {
                    id: CONFIG_ID,
                    initialized: true,
                    admin: admin(),
                    staking_pool: pool_address,
                    minimum_stake: MINIMUM_STAKE,
                    challenge_period_seconds: 10_800,
                    sector_limit: 1,
                    paused: false,
                },
            );
        world.sync_perms_and_inits(contract_defs());
        let (control_address, _) = world.dns(@"control").unwrap();
        let (supply_drop_address, _) = world.dns(@"supply_drop").unwrap();
        testing::set_block_timestamp(STARTED_AT);
        (
            world,
            IControlDispatcher { contract_address: control_address },
            ISupplyDropDispatcher { contract_address: supply_drop_address },
            IMockStakingPoolDispatcher { contract_address: pool_address },
        )
    }

    fn roles(world: @WorldStorage) -> IRolesDispatcher {
        let (contract_address, _) = world.dns(@"admin").unwrap();
        IRolesDispatcher { contract_address }
    }

    fn capture_only_sector(control: IControlDispatcher, pool: IMockStakingPoolDispatcher) {
        pool.set_amount(operator(), 1_000);
        testing::set_contract_address(operator());
        control.capture(0, MINIMUM_STAKE);
    }

    fn lock_and_make_randomness_ready(supply_drop: ISupplyDropDispatcher, supply_drop_id: u64) {
        testing::set_block_timestamp(STARTED_AT + DURATION);
        testing::set_block_number(LOCK_BLOCK);
        supply_drop.lock_supply_drop(supply_drop_id);
        testing::set_block_hash(RANDOMNESS_BLOCK, BLOCK_HASH);
        testing::set_block_number(SETTLEMENT_BLOCK);
    }

    fn deploy_erc20(owner: ContractAddress, supply: u256) -> ContractAddress {
        let calldata = [owner.into(), supply.low.into(), supply.high.into()];
        let (address, _) = deploy_syscall(
            mock_erc20::TEST_CLASS_HASH.try_into().unwrap(), 101, calldata.span(), false,
        )
            .unwrap_syscall();
        address
    }

    fn deploy_erc721(owner: ContractAddress, token_id: u256) -> ContractAddress {
        let calldata = [owner.into(), token_id.low.into(), token_id.high.into()];
        let (address, _) = deploy_syscall(
            mock_erc721::TEST_CLASS_HASH.try_into().unwrap(), 102, calldata.span(), false,
        )
            .unwrap_syscall();
        address
    }

    fn deploy_erc1155(owner: ContractAddress, token_id: u256, amount: u256) -> ContractAddress {
        let calldata = [
            owner.into(), token_id.low.into(), token_id.high.into(), amount.low.into(),
            amount.high.into(),
        ];
        let (address, _) = deploy_syscall(
            mock_erc1155::TEST_CLASS_HASH.try_into().unwrap(), 103, calldata.span(), false,
        )
            .unwrap_syscall();
        address
    }

    fn create_erc20_round(supply_drop: ISupplyDropDispatcher) -> (u64, IERC20AssetDispatcher) {
        let token_address = deploy_erc20(admin(), 2_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 2_000);
        let id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);
        (id, IERC20AssetDispatcher { contract_address: token_address })
    }

    fn assert_only_amount_changed(before: SupplyDrop, after: SupplyDrop, amount: u256) {
        let mut expected = before;
        expected.amount = amount;
        let mut expected_data = array![];
        let mut actual_data = array![];
        expected.serialize(ref expected_data);
        after.serialize(ref actual_data);
        assert_eq!(actual_data, expected_data);
    }

    #[test]
    #[should_panic(expected: ('erc20 amount mismatch', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn top_up_rejects_fee_on_transfer_tokens() {
        let (_, _, supply_drop, _) = setup();
        let (id, token) = create_erc20_round(supply_drop);
        IMockERC20ControlDispatcher { contract_address: token.contract_address }
            .set_transfer_fee(1);
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(
        expected: (
            'supply drop not active', 'ENTRYPOINT_FAILED', 'ENTRYPOINT_FAILED', 'ENTRYPOINT_FAILED',
        ),
    )]
    #[available_gas(900000000)]
    fn funding_status_blocks_reentrant_top_ups_even_from_an_authorized_token() {
        let (world, _, supply_drop, _) = setup();
        let (id, token) = create_erc20_round(supply_drop);
        roles(@world).grant_role(SUPPLY_DROP_CREATOR_ROLE, token.contract_address);
        IMockERC20ControlDispatcher { contract_address: token.contract_address }
            .set_reentrant_top_up(true);
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(expected: ('not active supply drop', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn top_up_cannot_target_a_different_supply_drop() {
        let (_, _, supply_drop, _) = setup();
        let (id, _) = create_erc20_round(supply_drop);
        supply_drop.top_up_supply_drop(id + 1, 100);
    }

    #[test]
    #[should_panic(expected: ('unsolicited token', 'ENTRYPOINT_FAILED', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn direct_erc1155_transfers_still_cannot_increase_the_prize() {
        let (_, _, supply_drop, _) = setup();
        let token_address = deploy_erc1155(admin(), 77, 1_000);
        testing::set_contract_address(admin());
        IMockERC1155ControlDispatcher { contract_address: token_address }
            .set_approval_for_all(supply_drop.contract_address, true);
        supply_drop.create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC1155, token_address, 77, 500);
        IERC1155AssetDispatcher { contract_address: token_address }
            .safe_transfer_from(admin(), supply_drop.contract_address, 77, 100, array![].span());
    }

    #[test]
    #[available_gas(900000000)]
    fn erc20_top_ups_preserve_the_round_and_pay_the_full_prize() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let (id, token) = create_erc20_round(supply_drop);
        let before = supply_drop.get_supply_drop(id);
        testing::set_block_timestamp(STARTED_AT + DURATION - 1);
        supply_drop.top_up_supply_drop(id, 100);
        supply_drop.top_up_supply_drop(id, 150);
        assert_only_amount_changed(before, supply_drop.get_supply_drop(id), 750);
        assert_eq!(token.balance_of(supply_drop.contract_address), 750);
        assert_eq!(token.balance_of(admin()), 1_250);
        lock_and_make_randomness_ready(supply_drop, id);
        supply_drop.settle_supply_drop(id);
        testing::set_contract_address(operator());
        supply_drop.claim_prize(id, operator());
        assert_eq!(token.balance_of(operator()), 750);
        assert_eq!(token.balance_of(supply_drop.contract_address), 0);
    }

    #[test]
    #[available_gas(900000000)]
    fn another_creator_tops_up_erc1155_from_their_own_wallet() {
        let (world, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        testing::set_contract_address(admin());
        roles(@world).grant_role(SUPPLY_DROP_CREATOR_ROLE, creator_one());
        let token_address = deploy_erc1155(admin(), 77, 1_000);
        let token = IERC1155AssetDispatcher { contract_address: token_address };
        let approvals = IMockERC1155ControlDispatcher { contract_address: token_address };
        token.safe_transfer_from(admin(), creator_one(), 77, 300, array![].span());
        approvals.set_approval_for_all(supply_drop.contract_address, true);
        let id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC1155, token_address, 77, 500);
        let before = supply_drop.get_supply_drop(id);
        testing::set_contract_address(creator_one());
        approvals.set_approval_for_all(supply_drop.contract_address, true);
        supply_drop.top_up_supply_drop(id, 250);
        assert_only_amount_changed(before, supply_drop.get_supply_drop(id), 750);
        assert_eq!(token.balance_of(creator_one(), 77), 50);
        assert_eq!(token.balance_of(admin(), 77), 200);
        assert_eq!(token.balance_of(supply_drop.contract_address, 77), 750);
        lock_and_make_randomness_ready(supply_drop, id);
        supply_drop.settle_supply_drop(id);
        testing::set_contract_address(operator());
        supply_drop.claim_prize(id, operator());
        assert_eq!(token.balance_of(operator(), 77), 750);
        assert_eq!(token.balance_of(supply_drop.contract_address, 77), 0);
    }

    #[test]
    #[available_gas(900000000)]
    fn rolled_over_round_accepts_top_ups_without_resetting_draw_history() {
        let (_, _, supply_drop, _) = setup();
        let (id, token) = create_erc20_round(supply_drop);
        supply_drop.top_up_supply_drop(id, 100);
        lock_and_make_randomness_ready(supply_drop, id);
        supply_drop.settle_supply_drop(id);
        let before = supply_drop.get_supply_drop(id);
        assert_eq!(before.draw_count, 1);
        assert_eq!(before.amount, 600);
        supply_drop.top_up_supply_drop(id, 150);
        assert_only_amount_changed(before, supply_drop.get_supply_drop(id), 750);
        assert_eq!(token.balance_of(supply_drop.contract_address), 750);
    }

    #[test]
    #[should_panic(expected: ('not supply drop creator', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn unauthorized_wallet_cannot_top_up() {
        let (_, _, supply_drop, _) = setup();
        let (id, _) = create_erc20_round(supply_drop);
        testing::set_contract_address(operator());
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(expected: ('not supply drop creator', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn revoked_creator_cannot_top_up_their_existing_round() {
        let (world, _, supply_drop, _) = setup();
        testing::set_contract_address(admin());
        roles(@world).grant_role(SUPPLY_DROP_CREATOR_ROLE, creator_one());
        let token_address = deploy_erc20(creator_one(), 1_000);
        testing::set_contract_address(creator_one());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 1_000);
        let id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);
        testing::set_contract_address(admin());
        roles(@world).revoke_role(SUPPLY_DROP_CREATOR_ROLE, creator_one());
        testing::set_contract_address(creator_one());
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(expected: ('zero amount', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn zero_top_up_is_rejected() {
        let (_, _, supply_drop, _) = setup();
        let (id, _) = create_erc20_round(supply_drop);
        supply_drop.top_up_supply_drop(id, 0);
    }

    #[test]
    #[should_panic(expected: ('supply drop expired', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn top_up_at_the_deadline_is_rejected_before_locking() {
        let (_, _, supply_drop, _) = setup();
        let (id, _) = create_erc20_round(supply_drop);
        testing::set_block_timestamp(STARTED_AT + DURATION);
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(expected: ('supply drop not active', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn locked_round_cannot_be_topped_up() {
        let (_, _, supply_drop, _) = setup();
        let (id, _) = create_erc20_round(supply_drop);
        lock_and_make_randomness_ready(supply_drop, id);
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(expected: ('not active supply drop', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn settled_round_cannot_be_topped_up() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let (id, _) = create_erc20_round(supply_drop);
        lock_and_make_randomness_ready(supply_drop, id);
        supply_drop.settle_supply_drop(id);
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(expected: ('prize cannot be topped up', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn erc721_round_cannot_be_topped_up() {
        let (_, _, supply_drop, _) = setup();
        let token_address = deploy_erc721(admin(), 77);
        testing::set_contract_address(admin());
        IMockERC721ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 77);
        let id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC721, token_address, 77, 1);
        supply_drop.top_up_supply_drop(id, 1);
    }

    #[test]
    #[should_panic(expected: ('game paused', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn paused_game_rejects_top_ups() {
        let (mut world, _, supply_drop, _) = setup();
        let (id, _) = create_erc20_round(supply_drop);
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.paused = true;
        world.write_model_test(@config);
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(expected: ('insufficient allowance', 'ENTRYPOINT_FAILED', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn top_up_requires_approval_for_the_increment() {
        let (_, _, supply_drop, _) = setup();
        let (id, token) = create_erc20_round(supply_drop);
        IMockERC20ControlDispatcher { contract_address: token.contract_address }
            .approve(supply_drop.contract_address, 99);
        supply_drop.top_up_supply_drop(id, 100);
    }

    #[test]
    #[should_panic(expected: ('u256_add Overflow', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn top_up_cannot_overflow_the_recorded_prize() {
        let (_, _, supply_drop, _) = setup();
        let (id, _) = create_erc20_round(supply_drop);
        supply_drop
            .top_up_supply_drop(
                id, 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
            );
    }

    #[test]
    #[available_gas(900000000)]
    fn erc20_prize_is_escrowed_and_paid_to_the_winning_controller() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let prize: u256 = 500;
        let token_address = deploy_erc20(admin(), 1_000);
        let token = IERC20AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, prize);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, prize);
        assert_eq!(token.balance_of(supply_drop.contract_address), prize);

        lock_and_make_randomness_ready(supply_drop, supply_drop_id);
        supply_drop.settle_supply_drop(supply_drop_id);

        let settled = supply_drop.get_supply_drop(supply_drop_id);
        assert_eq!(settled.status, SUPPLY_DROP_STATUS_SETTLED);
        assert_eq!(settled.winner, operator());
        assert_eq!(settled.last_drawn_sector_id, 0);
        assert_eq!(token.balance_of(supply_drop.contract_address), prize);
        testing::set_contract_address(operator());
        supply_drop.claim_prize(supply_drop_id, operator());
        assert_eq!(token.balance_of(operator()), prize);
        assert_eq!(token.balance_of(supply_drop.contract_address), 0);
        assert!(supply_drop.get_supply_drop(supply_drop_id).claimed);
    }

    #[test]
    #[available_gas(900000000)]
    fn erc721_prize_is_escrowed_and_paid_to_the_winning_controller() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let token_id: u256 = 77;
        let token_address = deploy_erc721(admin(), token_id);
        let token = IERC721AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC721ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, token_id);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC721, token_address, token_id, 1);
        assert_eq!(token.owner_of(token_id), supply_drop.contract_address);

        lock_and_make_randomness_ready(supply_drop, supply_drop_id);
        supply_drop.settle_supply_drop(supply_drop_id);

        assert_eq!(token.owner_of(token_id), supply_drop.contract_address);
        testing::set_contract_address(operator());
        supply_drop.claim_prize(supply_drop_id, operator());
        assert_eq!(token.owner_of(token_id), operator());
        assert_eq!(supply_drop.get_supply_drop(supply_drop_id).winner, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn erc1155_prize_is_escrowed_and_paid_to_the_winning_controller() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let token_id: u256 = 88;
        let prize: u256 = 25;
        let token_address = deploy_erc1155(admin(), token_id, 100);
        let token = IERC1155AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC1155ControlDispatcher { contract_address: token_address }
            .set_approval_for_all(supply_drop.contract_address, true);
        let supply_drop_id = supply_drop
            .create_supply_drop(
                DURATION, SUPPLY_DROP_PRIZE_ERC1155, token_address, token_id, prize,
            );
        assert_eq!(token.balance_of(supply_drop.contract_address, token_id), prize);

        lock_and_make_randomness_ready(supply_drop, supply_drop_id);
        supply_drop.settle_supply_drop(supply_drop_id);

        assert_eq!(token.balance_of(supply_drop.contract_address, token_id), prize);
        testing::set_contract_address(operator());
        supply_drop.claim_prize(supply_drop_id, operator());
        assert_eq!(token.balance_of(operator(), token_id), prize);
        assert_eq!(supply_drop.get_supply_drop(supply_drop_id).winner, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn neutral_draw_rolls_the_escrow_into_another_full_round() {
        let (_, control, supply_drop, pool) = setup();
        let prize: u256 = 500;
        let token_address = deploy_erc20(admin(), 1_000);
        let token = IERC20AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, prize);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, prize);

        lock_and_make_randomness_ready(supply_drop, supply_drop_id);
        supply_drop.settle_supply_drop(supply_drop_id);

        let rolled: SupplyDrop = supply_drop.get_supply_drop(supply_drop_id);
        assert_eq!(rolled.status, SUPPLY_DROP_STATUS_ACTIVE);
        assert_eq!(rolled.draw_count, 1);
        assert_eq!(rolled.started_at, STARTED_AT + DURATION);
        assert_eq!(rolled.ends_at, STARTED_AT + DURATION + DURATION);
        assert_eq!(token.balance_of(supply_drop.contract_address), prize);

        capture_only_sector(control, pool);
        assert_eq!(control.get_sector_status(0).controller, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn gameplay_continues_after_expiry_without_changing_the_expiry_controller() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 500);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);

        testing::set_block_timestamp(STARTED_AT + DURATION);
        testing::set_contract_address(operator());
        control.release(0);
        pool.set_amount(challenger(), 1_000);
        testing::set_contract_address(challenger());
        control.capture(0, MINIMUM_STAKE);
        assert_eq!(control.get_sector_status(0).controller, challenger());

        lock_and_make_randomness_ready(supply_drop, supply_drop_id);
        supply_drop.settle_supply_drop(supply_drop_id);

        assert_eq!(supply_drop.get_supply_drop(supply_drop_id).winner, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn controller_disqualified_before_expiry_does_not_win() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let prize: u256 = 500;
        let token_address = deploy_erc20(admin(), 1_000);
        let token = IERC20AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, prize);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, prize);

        testing::set_block_timestamp(STARTED_AT + DURATION - 1);
        pool.set_amount(operator(), MINIMUM_STAKE - 1);
        control.sync_operator(operator());
        lock_and_make_randomness_ready(supply_drop, supply_drop_id);
        supply_drop.settle_supply_drop(supply_drop_id);

        let rolled = supply_drop.get_supply_drop(supply_drop_id);
        assert_eq!(rolled.status, SUPPLY_DROP_STATUS_ACTIVE);
        assert_eq!(rolled.draw_count, 1);
        assert_eq!(token.balance_of(supply_drop.contract_address), prize);
        assert_eq!(token.balance_of(operator()), 0);
    }

    #[test]
    #[available_gas(900000000)]
    fn controller_disqualified_after_expiry_still_wins() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 500);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);

        testing::set_block_timestamp(STARTED_AT + DURATION);
        pool.set_amount(operator(), MINIMUM_STAKE - 1);
        control.sync_operator(operator());
        lock_and_make_randomness_ready(supply_drop, supply_drop_id);
        supply_drop.settle_supply_drop(supply_drop_id);

        assert_eq!(supply_drop.get_supply_drop(supply_drop_id).winner, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn incumbent_wins_when_the_selected_sector_was_contested_at_expiry() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 500);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);

        pool.set_amount(challenger(), 1_000);
        testing::set_block_timestamp(STARTED_AT + DURATION - 100);
        testing::set_contract_address(challenger());
        control.challenge(0, 110);

        testing::set_block_timestamp(STARTED_AT + DURATION);
        testing::set_block_number(LOCK_BLOCK);
        supply_drop.lock_supply_drop(supply_drop_id);
        testing::set_block_timestamp(STARTED_AT + DURATION + 10_700);
        control.settle_challenge(0);
        assert_eq!(control.get_sector_status(0).controller, challenger());

        testing::set_block_hash(RANDOMNESS_BLOCK, BLOCK_HASH);
        testing::set_block_number(SETTLEMENT_BLOCK);
        supply_drop.settle_supply_drop(supply_drop_id);

        assert_eq!(supply_drop.get_supply_drop(supply_drop_id).winner, operator());
    }

    #[test]
    #[should_panic(expected: ('not supply drop creator', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn wallet_without_creator_role_cannot_sponsor_a_supply_drop() {
        let (_, _, supply_drop, _) = setup();
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(operator());
        supply_drop.create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);
    }

    #[test]
    #[available_gas(900000000)]
    fn multiple_creator_role_members_are_authorized() {
        let (world, _, supply_drop, _) = setup();
        let roles = roles(@world);
        testing::set_contract_address(admin());
        roles.grant_role(SUPPLY_DROP_CREATOR_ROLE, creator_one());
        roles.grant_role(SUPPLY_DROP_CREATOR_ROLE, creator_two());

        assert!(roles.has_role(SUPPLY_DROP_CREATOR_ROLE, creator_one()));
        assert!(roles.has_role(SUPPLY_DROP_CREATOR_ROLE, creator_two()));
        assert!(supply_drop.can_create_supply_drop(creator_one()));
        assert!(supply_drop.can_create_supply_drop(creator_two()));
        assert_eq!(supply_drop.supply_drop_creator_role(), SUPPLY_DROP_CREATOR_ROLE);
    }

    #[test]
    #[available_gas(900000000)]
    fn creator_role_member_can_fund_and_create_a_supply_drop() {
        let (world, _, supply_drop, _) = setup();
        testing::set_contract_address(admin());
        roles(@world).grant_role(SUPPLY_DROP_CREATOR_ROLE, creator_one());

        let token_address = deploy_erc20(creator_one(), 1_000);
        testing::set_contract_address(creator_one());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 500);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);

        assert_eq!(supply_drop.get_supply_drop(supply_drop_id).sponsor, creator_one());
    }

    #[test]
    #[should_panic(expected: ('not supply drop creator', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn revoked_creator_cannot_create_a_supply_drop() {
        let (world, _, supply_drop, _) = setup();
        let roles = roles(@world);
        testing::set_contract_address(admin());
        roles.grant_role(SUPPLY_DROP_CREATOR_ROLE, creator_one());
        roles.revoke_role(SUPPLY_DROP_CREATOR_ROLE, creator_one());

        let token_address = deploy_erc20(creator_one(), 1_000);
        testing::set_contract_address(creator_one());
        supply_drop.create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);
    }

    #[test]
    #[should_panic(expected: ('not admin', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn non_admin_cannot_grant_creator_role() {
        let (world, _, _, _) = setup();
        testing::set_contract_address(operator());
        roles(@world).grant_role(SUPPLY_DROP_CREATOR_ROLE, creator_one());
    }

    #[test]
    #[should_panic(expected: ('randomness not ready', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn settlement_waits_until_the_committed_block_hash_is_available() {
        let (_, _, supply_drop, _) = setup();
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 500);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);

        testing::set_block_timestamp(STARTED_AT + DURATION);
        testing::set_block_number(LOCK_BLOCK);
        supply_drop.lock_supply_drop(supply_drop_id);
        testing::set_block_number(SETTLEMENT_BLOCK - 1);
        supply_drop.settle_supply_drop(supply_drop_id);
    }

    #[test]
    #[should_panic(expected: ('not supply drop winner', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn only_the_recorded_winner_can_claim_the_prize() {
        let (_, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 500);
        let supply_drop_id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);
        lock_and_make_randomness_ready(supply_drop, supply_drop_id);
        supply_drop.settle_supply_drop(supply_drop_id);

        testing::set_contract_address(admin());
        supply_drop.claim_prize(supply_drop_id, admin());
    }
    fn staking_drop() -> (
        WorldStorage,
        IControlDispatcher,
        ISupplyDropDispatcher,
        IMockStakingPoolDispatcher,
        u64,
        IERC20AssetDispatcher,
    ) {
        let (world, control, supply_drop, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 2_000);
        pool.set_token(token_address);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 2_000);
        let id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);
        assert!(supply_drop.get_supply_drop_policy(id).staking_required);
        lock_and_make_randomness_ready(supply_drop, id);
        supply_drop.settle_supply_drop(id);
        testing::set_contract_address(operator());
        (
            world,
            control,
            supply_drop,
            pool,
            id,
            IERC20AssetDispatcher { contract_address: token_address },
        )
    }

    #[test]
    fn claim_only_holds_gameplay_without_spending_force_or_retiring() {
        let (_, control, supply_drop, _, id, token) = staking_drop();
        let before = control.get_operator_status(operator());
        supply_drop.claim_prize(id, operator());
        assert_eq!(token.balance_of(operator()), 500);
        let hold = control.get_supply_drop_hold(operator());
        assert!(hold.held);
        assert_eq!(hold.required_stake, 1_500);
        assert_eq!(hold.remaining_stake, 500);
        // Permissionless sync does not mistake a hold for insolvency.
        testing::set_contract_address(challenger());
        control.sync_operator(operator());
        let after = control.get_operator_status(operator());
        assert_eq!(before, after);
        let sector = control.get_sector_status(0);
        assert_eq!(sector.controller, operator());
        assert!(!sector.stale);
        assert!(!control.can_manage_image(0, operator(), sector.ownership_generation));
    }

    #[test]
    fn partial_deposit_does_not_clear_hold_but_full_deposit_does() {
        let (_, control, supply_drop, pool, id, token) = staking_drop();
        supply_drop.claim_prize(id, operator());
        IMockERC20ControlDispatcher { contract_address: token.contract_address }
            .approve(pool.contract_address, 500);
        pool.add_to_delegation_pool(operator(), 200);
        control.sync_operator(operator());
        assert_eq!(control.get_supply_drop_hold(operator()).remaining_stake, 300);
        assert!(control.get_supply_drop_hold(operator()).held);
        pool.add_to_delegation_pool(operator(), 300);
        // Action gates and image authorization see the live balance even before sync.
        let sector = control.get_sector_status(0);
        assert!(control.can_manage_image(0, operator(), sector.ownership_generation));
        control.reinforce(0, 50);
        assert_eq!(control.get_supply_drop_hold(operator()).required_stake, 0);
        assert!(!control.get_operator_status(operator()).retired);
        assert_eq!(token.balance_of(operator()), 0);
    }

    #[test]
    fn payout_recipient_cannot_redirect_the_winners_hold() {
        let (_, control, supply_drop, _, id, token) = staking_drop();
        supply_drop.claim_prize(id, challenger());
        assert_eq!(token.balance_of(challenger()), 500);
        assert!(control.get_supply_drop_hold(operator()).held);
        assert!(!control.get_supply_drop_hold(challenger()).held);
    }

    #[test]
    fn hold_does_not_block_opponents_or_challenge_settlement() {
        let (_, control, supply_drop, pool, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        pool.set_amount(challenger(), 1_000);
        testing::set_contract_address(challenger());
        control.challenge(0, 110);
        testing::set_block_timestamp(STARTED_AT + DURATION + 10_801);
        control.settle_challenge(0);
        assert_eq!(control.get_sector_status(0).controller, challenger());
        assert!(control.get_supply_drop_hold(operator()).held);
        assert!(!control.get_operator_status(operator()).retired);
    }

    #[test]
    fn retirement_remains_permanent_after_hold_is_funded() {
        let (_, control, supply_drop, pool, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        control.retire();
        pool.set_amount(operator(), 1_500);
        control.sync_operator(operator());
        assert!(!control.get_supply_drop_hold(operator()).held);
        assert!(control.get_operator_status(operator()).retired);
    }

    #[test]
    fn exit_intent_never_clears_a_hold_even_with_enough_stake() {
        let (_, control, supply_drop, pool, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        pool.set_amount(operator(), 1_500);
        pool.set_unpool(operator(), 1, STARTED_AT + DURATION + 100);
        assert!(control.get_supply_drop_hold(operator()).held);
        control.sync_operator(operator());
        assert!(control.get_operator_status(operator()).retired);
    }

    #[test]
    #[should_panic(expected: ('supply drop policy missing', 'ENTRYPOINT_FAILED'))]
    fn missing_policy_cannot_bypass_claim_staking() {
        let (mut world, _, supply_drop, _, id, _) = staking_drop();
        world
            .write_model_test(
                @stakewars::models::SupplyDropStakingPolicy {
                    supply_drop_id: id,
                    staking_pool: 0.try_into().unwrap(),
                    staking_required: false,
                },
            );
        supply_drop.claim_prize(id, operator());
    }

    #[test]
    fn changing_the_configured_pool_cannot_clear_a_claim_hold() {
        let (mut world, control, supply_drop, _, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        let (other_address, _) = deploy_syscall(
            mock_staking_pool::TEST_CLASS_HASH.try_into().unwrap(), 2, [].span(), false,
        )
            .unwrap_syscall();
        IMockStakingPoolDispatcher { contract_address: other_address }
            .set_amount(operator(), 5_000);
        let mut config: GameConfig = world.read_model(CONFIG_ID);
        config.staking_pool = other_address;
        world.write_model_test(@config);
        control.sync_operator(operator());
        assert!(control.get_supply_drop_hold(operator()).held);
        assert_eq!(control.get_supply_drop_hold(operator()).remaining_stake, 500);
    }

    #[test]
    #[should_panic(expected: ('stake supply drop first', 'ENTRYPOINT_FAILED'))]
    fn held_winner_cannot_claim_another_staking_drop() {
        let (_, _, supply_drop, _, id, token) = staking_drop();
        supply_drop.claim_prize(id, operator());
        testing::set_contract_address(admin());
        let second = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token.contract_address, 0, 500);
        testing::set_block_timestamp(STARTED_AT + DURATION * 2);
        testing::set_block_number(2_000);
        supply_drop.lock_supply_drop(second);
        testing::set_block_hash(2_010, BLOCK_HASH);
        testing::set_block_number(2_020);
        supply_drop.settle_supply_drop(second);
        testing::set_contract_address(operator());
        supply_drop.claim_prize(second, operator());
    }

    #[test]
    #[should_panic(expected: ('stake supply drop first', 'ENTRYPOINT_FAILED'))]
    fn claim_only_blocks_capture() {
        let (_, control, supply_drop, _, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        control.capture(0, 100);
    }

    #[test]
    #[should_panic(expected: ('stake supply drop first', 'ENTRYPOINT_FAILED'))]
    fn claim_only_blocks_capture_many() {
        let (_, control, supply_drop, _, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        control
            .capture_many(
                [stakewars::systems::control::CaptureRequest { sector_id: 0, allocation: 100 }]
                    .span(),
            );
    }

    #[test]
    #[should_panic(expected: ('stake supply drop first', 'ENTRYPOINT_FAILED'))]
    fn claim_only_blocks_reinforce() {
        let (_, control, supply_drop, _, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        control.reinforce(0, 1);
    }

    #[test]
    #[should_panic(expected: ('stake supply drop first', 'ENTRYPOINT_FAILED'))]
    fn claim_only_blocks_reinforce_many() {
        let (_, control, supply_drop, _, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        control
            .reinforce_many(
                [
                    stakewars::systems::control::ReinforcementRequest {
                        sector_id: 0, additional_allocation: 1,
                    }
                ]
                    .span(),
            );
    }

    #[test]
    #[should_panic(expected: ('stake supply drop first', 'ENTRYPOINT_FAILED'))]
    fn claim_only_blocks_release() {
        let (_, control, supply_drop, _, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        control.release(0);
    }

    #[test]
    #[should_panic(expected: ('stake supply drop first', 'ENTRYPOINT_FAILED'))]
    fn claim_only_blocks_challenge() {
        let (_, control, supply_drop, _, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        control.challenge(0, 110);
    }

    #[test]
    #[should_panic(expected: ('stake supply drop first', 'ENTRYPOINT_FAILED'))]
    fn claim_only_blocks_sacrifice() {
        let (_, control, supply_drop, _, id, _) = staking_drop();
        supply_drop.claim_prize(id, operator());
        control.challenge_with_sacrifice(0, 0, 110);
    }

    fn account_staking_drop() -> (
        IControlDispatcher,
        ISupplyDropDispatcher,
        IMockStakingPoolDispatcher,
        u64,
        IERC20AssetDispatcher,
        ContractAddress,
    ) {
        let (_, control, supply_drop, pool) = setup();
        let (account, _) = deploy_syscall(
            stakewars::tests::mock_account::mock_account::TEST_CLASS_HASH.try_into().unwrap(),
            10,
            [].span(),
            false,
        )
            .unwrap_syscall();
        pool.set_amount(account, 1_000);
        testing::set_contract_address(account);
        control.capture(0, 100);
        let token_address = deploy_erc20(admin(), 2_000);
        pool.set_token(token_address);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(supply_drop.contract_address, 2_000);
        let id = supply_drop
            .create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token_address, 0, 500);
        lock_and_make_randomness_ready(supply_drop, id);
        supply_drop.settle_supply_drop(id);
        (
            control,
            supply_drop,
            pool,
            id,
            IERC20AssetDispatcher { contract_address: token_address },
            account,
        )
    }

    fn claim_stake_calls(
        control: IControlDispatcher,
        supply_drop: ISupplyDropDispatcher,
        pool: IMockStakingPoolDispatcher,
        id: u64,
        token: ContractAddress,
        account: ContractAddress,
        stake_amount: u128,
    ) -> Span<starknet::account::Call> {
        use starknet::account::Call;
        [
            Call {
                to: supply_drop.contract_address,
                selector: selector!("claim_prize"),
                calldata: [id.into(), account.into()].span(),
            },
            Call {
                to: token,
                selector: selector!("approve"),
                calldata: [pool.contract_address.into(), stake_amount.into(), 0].span(),
            },
            Call {
                to: pool.contract_address,
                selector: selector!("add_to_delegation_pool"),
                calldata: [account.into(), stake_amount.into()].span(),
            },
            Call {
                to: control.contract_address,
                selector: selector!("sync_operator"),
                calldata: [account.into()].span(),
            },
        ]
            .span()
    }

    #[test]
    fn real_account_multicall_claims_stakes_and_clears_hold() {
        let (control, supply_drop, pool, id, token, account) = account_staking_drop();
        IMockAccountDispatcher { contract_address: account }
            .execute(
                claim_stake_calls(
                    control, supply_drop, pool, id, token.contract_address, account, 500,
                ),
            );
        assert!(supply_drop.get_supply_drop(id).claimed);
        assert_eq!(token.balance_of(account), 0);
        assert_eq!(token.balance_of(pool.contract_address), 500);
        assert_eq!(control.get_operator_status(account).live_delegated_amount, 1_500);
        assert_eq!(control.get_supply_drop_hold(account).required_stake, 0);
        assert_eq!(control.get_operator_status(account).spent_force, 0);
        assert!(!control.get_operator_status(account).retired);
    }

    #[test]
    #[feature("safe_dispatcher")]
    fn failed_staking_reverts_the_claim_token_transfer_and_hold() {
        let (control, supply_drop, pool, id, token, account) = account_staking_drop();
        let result = IMockAccountSafeDispatcher { contract_address: account }
            .execute(
                claim_stake_calls(
                    control, supply_drop, pool, id, token.contract_address, account, 501,
                ),
            );
        assert!(result.is_err());
        assert!(!supply_drop.get_supply_drop(id).claimed);
        assert_eq!(token.balance_of(supply_drop.contract_address), 500);
        assert_eq!(token.balance_of(account), 0);
        assert_eq!(token.balance_of(pool.contract_address), 0);
        assert_eq!(control.get_operator_status(account).live_delegated_amount, 1_000);
        assert_eq!(control.get_supply_drop_hold(account).required_stake, 0);
    }

    #[test]
    #[should_panic(expected: ('drop amount exceeds u128', 'ENTRYPOINT_FAILED'))]
    fn staking_drop_top_up_rejects_unstakeable_amounts() {
        let (_, _, supply_drop, pool) = setup();
        let token = deploy_erc20(admin(), 0xffffffffffffffffffffffffffffffff + 100);
        pool.set_token(token);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token }
            .approve(supply_drop.contract_address, 0xffffffffffffffffffffffffffffffff + 100);
        let id = supply_drop.create_supply_drop(DURATION, SUPPLY_DROP_PRIZE_ERC20, token, 0, 500);
        supply_drop.top_up_supply_drop(id, 0xffffffffffffffffffffffffffffffff);
    }
}
