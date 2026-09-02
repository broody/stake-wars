use stakewars::models::Jackpot;
use starknet::ContractAddress;

pub const RANDOMNESS_COMMIT_DELAY_BLOCKS: u64 = 10;
pub const BLOCK_HASH_AVAILABILITY_DELAY_BLOCKS: u64 = 10;

#[starknet::interface]
pub trait IJackpot<TContractState> {
    fn create_jackpot(
        ref self: TContractState,
        duration_seconds: u64,
        prize_kind: u8,
        token: ContractAddress,
        token_id: u256,
        amount: u256,
    ) -> u64;
    fn lock_jackpot(ref self: TContractState, jackpot_id: u64);
    fn settle_jackpot(ref self: TContractState, jackpot_id: u64);
    fn claim_prize(ref self: TContractState, jackpot_id: u64, recipient: ContractAddress);
    fn get_jackpot(self: @TContractState, jackpot_id: u64) -> Jackpot;
    fn get_active_jackpot(self: @TContractState) -> Jackpot;
}

#[dojo::contract]
pub mod jackpot {
    use core::hash::HashStateTrait;
    use core::num::traits::Zero;
    use core::poseidon::PoseidonTrait;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use stakewars::assets::{
        IERC1155AssetDispatcher, IERC1155AssetDispatcherTrait, IERC1155Receiver,
        IERC1155_RECEIVER_ID, IERC20AssetDispatcher, IERC20AssetDispatcherTrait,
        IERC721AssetDispatcher, IERC721AssetDispatcherTrait, IERC721Receiver, IERC721_RECEIVER_ID,
        ISRC5, ISRC5_ID,
    };
    use stakewars::models::{
        CONFIG_ID, GameConfig, JACKPOT_COUNTER_ID, JACKPOT_PRIZE_ERC1155, JACKPOT_PRIZE_ERC20,
        JACKPOT_PRIZE_ERC721, JACKPOT_STATUS_ACTIVE, JACKPOT_STATUS_DRAWING, JACKPOT_STATUS_FUNDING,
        JACKPOT_STATUS_SETTLED, Jackpot, JackpotCounter, JackpotOperatorSnapshot,
        JackpotSectorSnapshot, OperatorState, Sector,
    };
    use starknet::syscalls::get_block_hash_syscall;
    use starknet::{
        ContractAddress, SyscallResultTrait, get_block_number, get_block_timestamp,
        get_caller_address, get_contract_address,
    };
    use super::{BLOCK_HASH_AVAILABILITY_DELAY_BLOCKS, IJackpot, RANDOMNESS_COMMIT_DELAY_BLOCKS};

    const JACKPOT_RANDOMNESS_DOMAIN: felt252 = 'STAKEWARS_JACKPOT_V1';

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct JackpotCreated {
        #[key]
        pub jackpot_id: u64,
        #[key]
        pub sponsor: ContractAddress,
        pub prize_kind: u8,
        pub token: ContractAddress,
        pub token_id: u256,
        pub amount: u256,
        pub started_at: u64,
        pub ends_at: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct JackpotLocked {
        #[key]
        pub jackpot_id: u64,
        pub randomness_block: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct JackpotRolledOver {
        #[key]
        pub jackpot_id: u64,
        pub drawn_sector_id: u32,
        pub randomness: felt252,
        pub draw_count: u32,
        pub next_ends_at: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct JackpotSettled {
        #[key]
        pub jackpot_id: u64,
        #[key]
        pub winner: ContractAddress,
        pub winning_sector_id: u32,
        pub randomness: felt252,
        pub draw_count: u32,
        pub settled_at: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct JackpotClaimed {
        #[key]
        pub jackpot_id: u64,
        #[key]
        pub winner: ContractAddress,
        pub recipient: ContractAddress,
        pub claimed_at: u64,
    }

    #[abi(embed_v0)]
    impl JackpotImpl of IJackpot<ContractState> {
        fn create_jackpot(
            ref self: ContractState,
            duration_seconds: u64,
            prize_kind: u8,
            token: ContractAddress,
            token_id: u256,
            amount: u256,
        ) -> u64 {
            let mut world = self.world_default();
            let config: GameConfig = world.read_model(CONFIG_ID);
            let sponsor = get_caller_address();
            assert(config.initialized, 'not initialized');
            assert(!config.paused, 'game paused');
            assert(config.admin == sponsor, 'not game admin');
            assert(!config.staking_pool.is_zero(), 'zero staking pool');
            assert(config.sector_limit > 0, 'zero sector limit');
            assert(duration_seconds > 0, 'zero duration');
            self.validate_prize(prize_kind, token, token_id, amount);

            let mut counter: JackpotCounter = world.read_model(JACKPOT_COUNTER_ID);
            assert(counter.active_id == 0, 'jackpot already active');
            counter.next_id += 1;
            counter.active_id = counter.next_id;

            let started_at = get_block_timestamp();
            let ends_at = started_at + duration_seconds;
            let mut next = Jackpot {
                id: counter.next_id,
                status: JACKPOT_STATUS_FUNDING,
                sponsor,
                prize_kind,
                token,
                token_id,
                amount,
                staking_pool_snapshot: config.staking_pool,
                sector_limit_snapshot: config.sector_limit,
                duration_seconds,
                started_at,
                ends_at,
                randomness_block: 0,
                last_randomness: 0,
                last_drawn_sector_id: 0,
                draw_count: 0,
                winner: zero_address(),
                settled_at: 0,
                claimed: false,
                claimed_by: zero_address(),
                claimed_at: 0,
            };

            world.write_model(@counter);
            world.write_model(@next);
            self.pull_prize(next);
            next.status = JACKPOT_STATUS_ACTIVE;
            world.write_model(@next);
            world
                .emit_event(
                    @JackpotCreated {
                        jackpot_id: next.id,
                        sponsor,
                        prize_kind,
                        token,
                        token_id,
                        amount,
                        started_at,
                        ends_at,
                    },
                );
            next.id
        }

        fn lock_jackpot(ref self: ContractState, jackpot_id: u64) {
            let mut world = self.world_default();
            let mut current = self.require_active_jackpot(jackpot_id);
            assert(current.status == JACKPOT_STATUS_ACTIVE, 'jackpot not active');
            assert(get_block_timestamp() >= current.ends_at, 'jackpot not expired');

            current.status = JACKPOT_STATUS_DRAWING;
            current.randomness_block = get_block_number() + RANDOMNESS_COMMIT_DELAY_BLOCKS;
            world.write_model(@current);
            world
                .emit_event(
                    @JackpotLocked {
                        jackpot_id: current.id, randomness_block: current.randomness_block,
                    },
                );
        }

        fn settle_jackpot(ref self: ContractState, jackpot_id: u64) {
            let mut world = self.world_default();
            let config: GameConfig = world.read_model(CONFIG_ID);
            assert(config.initialized, 'not initialized');
            let mut current = self.require_active_jackpot(jackpot_id);
            assert(current.status == JACKPOT_STATUS_DRAWING, 'jackpot not locked');
            assert(
                get_block_number() >= current.randomness_block
                    + BLOCK_HASH_AVAILABILITY_DELAY_BLOCKS,
                'randomness not ready',
            );

            let block_hash = get_block_hash_syscall(current.randomness_block).unwrap_syscall();
            let randomness = PoseidonTrait::new()
                .update(JACKPOT_RANDOMNESS_DOMAIN)
                .update(block_hash)
                .update(current.id.into())
                .update(current.draw_count.into())
                .update(current.ends_at.into())
                .finalize();
            let randomness_value: u256 = randomness.into();
            let sector_index = randomness_value % current.sector_limit_snapshot.into();
            let sector_id: u32 = sector_index.try_into().unwrap();
            let winner = self.controller_at_expiry(current, sector_id);

            current.last_randomness = randomness;
            current.last_drawn_sector_id = sector_id;
            current.draw_count += 1;

            match winner {
                Option::Some(winner) => {
                    let settled_at = get_block_timestamp();
                    current.status = JACKPOT_STATUS_SETTLED;
                    current.randomness_block = 0;
                    current.winner = winner;
                    current.settled_at = settled_at;
                    let mut counter: JackpotCounter = world.read_model(JACKPOT_COUNTER_ID);
                    counter.active_id = 0;
                    world.write_model(@current);
                    world.write_model(@counter);
                    world
                        .emit_event(
                            @JackpotSettled {
                                jackpot_id: current.id,
                                winner,
                                winning_sector_id: sector_id,
                                randomness,
                                draw_count: current.draw_count,
                                settled_at,
                            },
                        );
                },
                Option::None => {
                    let started_at = get_block_timestamp();
                    current.status = JACKPOT_STATUS_ACTIVE;
                    current.started_at = started_at;
                    current.ends_at = started_at + current.duration_seconds;
                    current.randomness_block = 0;
                    world.write_model(@current);
                    world
                        .emit_event(
                            @JackpotRolledOver {
                                jackpot_id: current.id,
                                drawn_sector_id: sector_id,
                                randomness,
                                draw_count: current.draw_count,
                                next_ends_at: current.ends_at,
                            },
                        );
                },
            }
        }

        fn claim_prize(ref self: ContractState, jackpot_id: u64, recipient: ContractAddress) {
            assert(!recipient.is_zero(), 'zero recipient');
            let mut world = self.world_default();
            let mut settled: Jackpot = world.read_model(jackpot_id);
            let winner = get_caller_address();
            assert(settled.id == jackpot_id, 'jackpot not found');
            assert(settled.status == JACKPOT_STATUS_SETTLED, 'jackpot not settled');
            assert(settled.winner == winner, 'not jackpot winner');
            assert(!settled.claimed, 'prize already claimed');

            let claimed_at = get_block_timestamp();
            settled.claimed = true;
            settled.claimed_by = recipient;
            settled.claimed_at = claimed_at;
            world.write_model(@settled);
            world.emit_event(@JackpotClaimed { jackpot_id, winner, recipient, claimed_at });
            self.push_prize(recipient, settled);
        }

        fn get_jackpot(self: @ContractState, jackpot_id: u64) -> Jackpot {
            let current: Jackpot = self.world_default().read_model(jackpot_id);
            assert(current.id > 0, 'jackpot not found');
            current
        }

        fn get_active_jackpot(self: @ContractState) -> Jackpot {
            let world = self.world_default();
            let counter: JackpotCounter = world.read_model(JACKPOT_COUNTER_ID);
            assert(counter.active_id > 0, 'no active jackpot');
            world.read_model(counter.active_id)
        }
    }

    #[abi(embed_v0)]
    impl ERC721ReceiverImpl of IERC721Receiver<ContractState> {
        fn on_erc721_received(
            self: @ContractState,
            operator: ContractAddress,
            from: ContractAddress,
            token_id: u256,
            data: Span<felt252>,
        ) -> felt252 {
            let _ = data;
            let pending = self.expected_funding();
            assert(operator == get_contract_address(), 'unexpected operator');
            assert(pending.prize_kind == JACKPOT_PRIZE_ERC721, 'unexpected prize kind');
            assert(get_caller_address() == pending.token, 'unexpected token');
            assert(from == pending.sponsor, 'unexpected sponsor');
            assert(token_id == pending.token_id, 'unexpected token id');
            IERC721_RECEIVER_ID
        }
    }

    #[abi(embed_v0)]
    impl ERC1155ReceiverImpl of IERC1155Receiver<ContractState> {
        fn on_erc1155_received(
            self: @ContractState,
            operator: ContractAddress,
            from: ContractAddress,
            token_id: u256,
            value: u256,
            data: Span<felt252>,
        ) -> felt252 {
            let _ = data;
            let pending = self.expected_funding();
            assert(operator == get_contract_address(), 'unexpected operator');
            assert(pending.prize_kind == JACKPOT_PRIZE_ERC1155, 'unexpected prize kind');
            assert(get_caller_address() == pending.token, 'unexpected token');
            assert(from == pending.sponsor, 'unexpected sponsor');
            assert(token_id == pending.token_id, 'unexpected token id');
            assert(value == pending.amount, 'unexpected amount');
            IERC1155_RECEIVER_ID
        }

        fn on_erc1155_batch_received(
            self: @ContractState,
            operator: ContractAddress,
            from: ContractAddress,
            token_ids: Span<u256>,
            values: Span<u256>,
            data: Span<felt252>,
        ) -> felt252 {
            let _ = operator;
            let _ = from;
            let _ = token_ids;
            let _ = values;
            let _ = data;
            panic!("batch not supported")
        }
    }

    #[abi(embed_v0)]
    impl SRC5Impl of ISRC5<ContractState> {
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == IERC721_RECEIVER_ID
                || interface_id == IERC1155_RECEIVER_ID
                || interface_id == ISRC5_ID
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"stakewars")
        }

        fn require_active_jackpot(self: @ContractState, jackpot_id: u64) -> Jackpot {
            let world = self.world_default();
            let counter: JackpotCounter = world.read_model(JACKPOT_COUNTER_ID);
            assert(counter.active_id == jackpot_id, 'not active jackpot');
            let current: Jackpot = world.read_model(jackpot_id);
            assert(current.id == jackpot_id, 'jackpot not found');
            current
        }

        fn expected_funding(self: @ContractState) -> Jackpot {
            let world = self.world_default();
            let counter: JackpotCounter = world.read_model(JACKPOT_COUNTER_ID);
            assert(counter.active_id > 0, 'unsolicited token');
            let pending: Jackpot = world.read_model(counter.active_id);
            assert(pending.status == JACKPOT_STATUS_FUNDING, 'unsolicited token');
            pending
        }

        fn validate_prize(
            self: @ContractState,
            prize_kind: u8,
            token: ContractAddress,
            token_id: u256,
            amount: u256,
        ) {
            assert(!token.is_zero(), 'zero token');
            if prize_kind == JACKPOT_PRIZE_ERC20 {
                assert(token_id == 0, 'erc20 token id');
                assert(amount > 0, 'zero amount');
            } else if prize_kind == JACKPOT_PRIZE_ERC721 {
                assert(amount == 1, 'erc721 amount');
            } else {
                assert(prize_kind == JACKPOT_PRIZE_ERC1155, 'invalid prize kind');
                assert(amount > 0, 'zero amount');
            }
        }

        fn pull_prize(ref self: ContractState, prize: Jackpot) {
            let escrow = get_contract_address();
            if prize.prize_kind == JACKPOT_PRIZE_ERC20 {
                let token = IERC20AssetDispatcher { contract_address: prize.token };
                let before = token.balance_of(escrow);
                assert(
                    token.transfer_from(prize.sponsor, escrow, prize.amount), 'erc20 pull failed',
                );
                assert(token.balance_of(escrow) == before + prize.amount, 'erc20 amount mismatch');
            } else if prize.prize_kind == JACKPOT_PRIZE_ERC721 {
                IERC721AssetDispatcher { contract_address: prize.token }
                    .safe_transfer_from(prize.sponsor, escrow, prize.token_id, array![].span());
                assert(
                    IERC721AssetDispatcher { contract_address: prize.token }
                        .owner_of(prize.token_id) == escrow,
                    'erc721 owner mismatch',
                );
            } else {
                let token = IERC1155AssetDispatcher { contract_address: prize.token };
                let before = token.balance_of(escrow, prize.token_id);
                token
                    .safe_transfer_from(
                        prize.sponsor, escrow, prize.token_id, prize.amount, array![].span(),
                    );
                assert(
                    token.balance_of(escrow, prize.token_id) == before + prize.amount,
                    'erc1155 amount mismatch',
                );
            }
        }

        fn push_prize(ref self: ContractState, winner: ContractAddress, prize: Jackpot) {
            let escrow = get_contract_address();
            if prize.prize_kind == JACKPOT_PRIZE_ERC20 {
                let token = IERC20AssetDispatcher { contract_address: prize.token };
                let before = token.balance_of(winner);
                assert(token.transfer(winner, prize.amount), 'erc20 push failed');
                assert(token.balance_of(winner) == before + prize.amount, 'erc20 amount mismatch');
            } else if prize.prize_kind == JACKPOT_PRIZE_ERC721 {
                IERC721AssetDispatcher { contract_address: prize.token }
                    .safe_transfer_from(escrow, winner, prize.token_id, array![].span());
                assert(
                    IERC721AssetDispatcher { contract_address: prize.token }
                        .owner_of(prize.token_id) == winner,
                    'erc721 owner mismatch',
                );
            } else {
                let token = IERC1155AssetDispatcher { contract_address: prize.token };
                let before = token.balance_of(winner, prize.token_id);
                token
                    .safe_transfer_from(
                        escrow, winner, prize.token_id, prize.amount, array![].span(),
                    );
                assert(
                    token.balance_of(winner, prize.token_id) == before + prize.amount,
                    'erc1155 amount mismatch',
                );
            }
        }

        fn controller_at_expiry(
            self: @ContractState, current: Jackpot, sector_id: u32,
        ) -> Option<ContractAddress> {
            let world = self.world_default();
            let sector_snapshot: JackpotSectorSnapshot = world
                .read_model((current.id, current.draw_count, sector_id));
            let (controller, controller_generation) = if sector_snapshot.initialized {
                (sector_snapshot.controller, sector_snapshot.controller_generation)
            } else {
                let sector: Sector = world.read_model(sector_id);
                (sector.controller, sector.controller_generation)
            };
            if controller.is_zero() {
                return Option::None;
            }
            let operator_snapshot: JackpotOperatorSnapshot = world
                .read_model((current.id, current.draw_count, controller));
            let (generation, retired) = if operator_snapshot.initialized {
                (operator_snapshot.generation, operator_snapshot.retired)
            } else {
                let operator: OperatorState = world.read_model(controller);
                (operator.generation, operator.retired)
            };
            if retired || generation == 0 || generation != controller_generation {
                return Option::None;
            }
            Option::Some(controller)
        }
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
