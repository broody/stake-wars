#[cfg(test)]
mod tests {
    use dojo::model::ModelStorageTest;
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
        CONFIG_ID, GameConfig, JACKPOT_PRIZE_ERC1155, JACKPOT_PRIZE_ERC20, JACKPOT_PRIZE_ERC721,
        JACKPOT_STATUS_ACTIVE, JACKPOT_STATUS_SETTLED, Jackpot, m_Challenge, m_ChallengeCounter,
        m_ChallengeParticipant, m_GameConfig, m_Jackpot, m_JackpotCounter,
        m_JackpotOperatorSnapshot, m_JackpotSectorSnapshot, m_OperatorState, m_Sector,
    };
    use stakewars::systems::control::{IControlDispatcher, IControlDispatcherTrait, control};
    use stakewars::systems::jackpot::{IJackpotDispatcher, IJackpotDispatcherTrait, jackpot};
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

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "stakewars",
            resources: [
                TestResource::Model(m_GameConfig::TEST_CLASS_HASH),
                TestResource::Model(m_OperatorState::TEST_CLASS_HASH),
                TestResource::Model(m_Sector::TEST_CLASS_HASH),
                TestResource::Model(m_ChallengeCounter::TEST_CLASS_HASH),
                TestResource::Model(m_Challenge::TEST_CLASS_HASH),
                TestResource::Model(m_ChallengeParticipant::TEST_CLASS_HASH),
                TestResource::Model(m_JackpotCounter::TEST_CLASS_HASH),
                TestResource::Model(m_Jackpot::TEST_CLASS_HASH),
                TestResource::Model(m_JackpotSectorSnapshot::TEST_CLASS_HASH),
                TestResource::Model(m_JackpotOperatorSnapshot::TEST_CLASS_HASH),
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
                TestResource::Event(jackpot::e_JackpotCreated::TEST_CLASS_HASH),
                TestResource::Event(jackpot::e_JackpotLocked::TEST_CLASS_HASH),
                TestResource::Event(jackpot::e_JackpotRolledOver::TEST_CLASS_HASH),
                TestResource::Event(jackpot::e_JackpotSettled::TEST_CLASS_HASH),
                TestResource::Event(jackpot::e_JackpotClaimed::TEST_CLASS_HASH),
                TestResource::Contract(control::TEST_CLASS_HASH),
                TestResource::Contract(jackpot::TEST_CLASS_HASH),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"stakewars", @"control")
                .with_writer_of(control_writer_selectors()),
            ContractDefTrait::new(@"stakewars", @"jackpot")
                .with_writer_of(jackpot_writer_selectors()),
        ]
            .span()
    }

    fn control_writer_selectors() -> Span<felt252> {
        [
            resource_selector(@"OperatorState"), resource_selector(@"Sector"),
            resource_selector(@"ChallengeCounter"), resource_selector(@"Challenge"),
            resource_selector(@"ChallengeParticipant"), resource_selector(@"SectorCaptured"),
            resource_selector(@"JackpotSectorSnapshot"),
            resource_selector(@"JackpotOperatorSnapshot"), resource_selector(@"SectorReinforced"),
            resource_selector(@"SectorReleased"), resource_selector(@"ChallengeInitiated"),
            resource_selector(@"ChallengeEscalated"), resource_selector(@"SectorSacrificed"),
            resource_selector(@"ChallengeSettled"), resource_selector(@"ChallengePositionResolved"),
            resource_selector(@"OperatorDisqualified"), resource_selector(@"OperatorRetired"),
        ]
            .span()
    }

    fn jackpot_writer_selectors() -> Span<felt252> {
        [
            resource_selector(@"JackpotCounter"), resource_selector(@"Jackpot"),
            resource_selector(@"JackpotCreated"), resource_selector(@"JackpotLocked"),
            resource_selector(@"JackpotRolledOver"), resource_selector(@"JackpotSettled"),
            resource_selector(@"JackpotClaimed"),
        ]
            .span()
    }

    fn resource_selector(name: @ByteArray) -> felt252 {
        dojo::utils::selector_from_names(@"stakewars", name)
    }

    fn setup() -> (
        WorldStorage, IControlDispatcher, IJackpotDispatcher, IMockStakingPoolDispatcher,
    ) {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
        world.sync_perms_and_inits(contract_defs());
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
        let (control_address, _) = world.dns(@"control").unwrap();
        let (jackpot_address, _) = world.dns(@"jackpot").unwrap();
        testing::set_block_timestamp(STARTED_AT);
        (
            world,
            IControlDispatcher { contract_address: control_address },
            IJackpotDispatcher { contract_address: jackpot_address },
            IMockStakingPoolDispatcher { contract_address: pool_address },
        )
    }

    fn capture_only_sector(control: IControlDispatcher, pool: IMockStakingPoolDispatcher) {
        pool.set_amount(operator(), 1_000);
        testing::set_contract_address(operator());
        control.capture(0, MINIMUM_STAKE);
    }

    fn lock_and_make_randomness_ready(jackpot: IJackpotDispatcher, jackpot_id: u64) {
        testing::set_block_timestamp(STARTED_AT + DURATION);
        testing::set_block_number(LOCK_BLOCK);
        jackpot.lock_jackpot(jackpot_id);
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

    #[test]
    #[available_gas(900000000)]
    fn erc20_prize_is_escrowed_and_paid_to_the_winning_controller() {
        let (_, control, jackpot, pool) = setup();
        capture_only_sector(control, pool);
        let prize: u256 = 500;
        let token_address = deploy_erc20(admin(), 1_000);
        let token = IERC20AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, prize);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, prize);
        assert_eq!(token.balance_of(jackpot.contract_address), prize);

        lock_and_make_randomness_ready(jackpot, jackpot_id);
        jackpot.settle_jackpot(jackpot_id);

        let settled = jackpot.get_jackpot(jackpot_id);
        assert_eq!(settled.status, JACKPOT_STATUS_SETTLED);
        assert_eq!(settled.winner, operator());
        assert_eq!(settled.last_drawn_sector_id, 0);
        assert_eq!(token.balance_of(jackpot.contract_address), prize);
        testing::set_contract_address(operator());
        jackpot.claim_prize(jackpot_id, operator());
        assert_eq!(token.balance_of(operator()), prize);
        assert_eq!(token.balance_of(jackpot.contract_address), 0);
        assert!(jackpot.get_jackpot(jackpot_id).claimed);
    }

    #[test]
    #[available_gas(900000000)]
    fn erc721_prize_is_escrowed_and_paid_to_the_winning_controller() {
        let (_, control, jackpot, pool) = setup();
        capture_only_sector(control, pool);
        let token_id: u256 = 77;
        let token_address = deploy_erc721(admin(), token_id);
        let token = IERC721AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC721ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, token_id);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC721, token_address, token_id, 1);
        assert_eq!(token.owner_of(token_id), jackpot.contract_address);

        lock_and_make_randomness_ready(jackpot, jackpot_id);
        jackpot.settle_jackpot(jackpot_id);

        assert_eq!(token.owner_of(token_id), jackpot.contract_address);
        testing::set_contract_address(operator());
        jackpot.claim_prize(jackpot_id, operator());
        assert_eq!(token.owner_of(token_id), operator());
        assert_eq!(jackpot.get_jackpot(jackpot_id).winner, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn erc1155_prize_is_escrowed_and_paid_to_the_winning_controller() {
        let (_, control, jackpot, pool) = setup();
        capture_only_sector(control, pool);
        let token_id: u256 = 88;
        let prize: u256 = 25;
        let token_address = deploy_erc1155(admin(), token_id, 100);
        let token = IERC1155AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC1155ControlDispatcher { contract_address: token_address }
            .set_approval_for_all(jackpot.contract_address, true);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC1155, token_address, token_id, prize);
        assert_eq!(token.balance_of(jackpot.contract_address, token_id), prize);

        lock_and_make_randomness_ready(jackpot, jackpot_id);
        jackpot.settle_jackpot(jackpot_id);

        assert_eq!(token.balance_of(jackpot.contract_address, token_id), prize);
        testing::set_contract_address(operator());
        jackpot.claim_prize(jackpot_id, operator());
        assert_eq!(token.balance_of(operator(), token_id), prize);
        assert_eq!(jackpot.get_jackpot(jackpot_id).winner, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn neutral_draw_rolls_the_escrow_into_another_full_round() {
        let (_, control, jackpot, pool) = setup();
        let prize: u256 = 500;
        let token_address = deploy_erc20(admin(), 1_000);
        let token = IERC20AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, prize);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, prize);

        lock_and_make_randomness_ready(jackpot, jackpot_id);
        jackpot.settle_jackpot(jackpot_id);

        let rolled: Jackpot = jackpot.get_jackpot(jackpot_id);
        assert_eq!(rolled.status, JACKPOT_STATUS_ACTIVE);
        assert_eq!(rolled.draw_count, 1);
        assert_eq!(rolled.started_at, STARTED_AT + DURATION);
        assert_eq!(rolled.ends_at, STARTED_AT + DURATION + DURATION);
        assert_eq!(token.balance_of(jackpot.contract_address), prize);

        capture_only_sector(control, pool);
        assert_eq!(control.get_sector_status(0).controller, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn gameplay_continues_after_expiry_without_changing_the_expiry_controller() {
        let (_, control, jackpot, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, 500);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, 500);

        testing::set_block_timestamp(STARTED_AT + DURATION);
        testing::set_contract_address(operator());
        control.release(0);
        pool.set_amount(challenger(), 1_000);
        testing::set_contract_address(challenger());
        control.capture(0, MINIMUM_STAKE);
        assert_eq!(control.get_sector_status(0).controller, challenger());

        lock_and_make_randomness_ready(jackpot, jackpot_id);
        jackpot.settle_jackpot(jackpot_id);

        assert_eq!(jackpot.get_jackpot(jackpot_id).winner, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn controller_disqualified_before_expiry_does_not_win() {
        let (_, control, jackpot, pool) = setup();
        capture_only_sector(control, pool);
        let prize: u256 = 500;
        let token_address = deploy_erc20(admin(), 1_000);
        let token = IERC20AssetDispatcher { contract_address: token_address };
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, prize);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, prize);

        testing::set_block_timestamp(STARTED_AT + DURATION - 1);
        pool.set_amount(operator(), MINIMUM_STAKE - 1);
        control.sync_operator(operator());
        lock_and_make_randomness_ready(jackpot, jackpot_id);
        jackpot.settle_jackpot(jackpot_id);

        let rolled = jackpot.get_jackpot(jackpot_id);
        assert_eq!(rolled.status, JACKPOT_STATUS_ACTIVE);
        assert_eq!(rolled.draw_count, 1);
        assert_eq!(token.balance_of(jackpot.contract_address), prize);
        assert_eq!(token.balance_of(operator()), 0);
    }

    #[test]
    #[available_gas(900000000)]
    fn controller_disqualified_after_expiry_still_wins() {
        let (_, control, jackpot, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, 500);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, 500);

        testing::set_block_timestamp(STARTED_AT + DURATION);
        pool.set_amount(operator(), MINIMUM_STAKE - 1);
        control.sync_operator(operator());
        lock_and_make_randomness_ready(jackpot, jackpot_id);
        jackpot.settle_jackpot(jackpot_id);

        assert_eq!(jackpot.get_jackpot(jackpot_id).winner, operator());
    }

    #[test]
    #[available_gas(900000000)]
    fn incumbent_wins_when_the_selected_sector_was_contested_at_expiry() {
        let (_, control, jackpot, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, 500);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, 500);

        pool.set_amount(challenger(), 1_000);
        testing::set_block_timestamp(STARTED_AT + DURATION - 100);
        testing::set_contract_address(challenger());
        control.challenge(0, 110);

        testing::set_block_timestamp(STARTED_AT + DURATION);
        testing::set_block_number(LOCK_BLOCK);
        jackpot.lock_jackpot(jackpot_id);
        testing::set_block_timestamp(STARTED_AT + DURATION + 10_700);
        control.settle_challenge(0);
        assert_eq!(control.get_sector_status(0).controller, challenger());

        testing::set_block_hash(RANDOMNESS_BLOCK, BLOCK_HASH);
        testing::set_block_number(SETTLEMENT_BLOCK);
        jackpot.settle_jackpot(jackpot_id);

        assert_eq!(jackpot.get_jackpot(jackpot_id).winner, operator());
    }

    #[test]
    #[should_panic(expected: ('not game admin', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn only_the_game_admin_can_sponsor_a_jackpot() {
        let (_, _, jackpot, _) = setup();
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(operator());
        jackpot.create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, 500);
    }

    #[test]
    #[should_panic(expected: ('randomness not ready', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn settlement_waits_until_the_committed_block_hash_is_available() {
        let (_, _, jackpot, _) = setup();
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, 500);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, 500);

        testing::set_block_timestamp(STARTED_AT + DURATION);
        testing::set_block_number(LOCK_BLOCK);
        jackpot.lock_jackpot(jackpot_id);
        testing::set_block_number(SETTLEMENT_BLOCK - 1);
        jackpot.settle_jackpot(jackpot_id);
    }

    #[test]
    #[should_panic(expected: ('not jackpot winner', 'ENTRYPOINT_FAILED'))]
    #[available_gas(900000000)]
    fn only_the_recorded_winner_can_claim_the_prize() {
        let (_, control, jackpot, pool) = setup();
        capture_only_sector(control, pool);
        let token_address = deploy_erc20(admin(), 1_000);
        testing::set_contract_address(admin());
        IMockERC20ControlDispatcher { contract_address: token_address }
            .approve(jackpot.contract_address, 500);
        let jackpot_id = jackpot
            .create_jackpot(DURATION, JACKPOT_PRIZE_ERC20, token_address, 0, 500);
        lock_and_make_randomness_ready(jackpot, jackpot_id);
        jackpot.settle_jackpot(jackpot_id);

        testing::set_contract_address(admin());
        jackpot.claim_prize(jackpot_id, admin());
    }
}
