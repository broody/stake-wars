use starknet::ContractAddress;

pub const MAX_SYNC_BATCH: usize = 50;
pub const MAX_STATUS_BATCH: usize = 200;

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct ControlPointStatus {
    pub id: u32,
    pub controller: ContractAddress,
    pub capture_power: u128,
    pub ownership_generation: u64,
    pub controlled_since: u64,
    pub required_stake: u128,
    pub active_challenge_id: u64,
    pub challenge_leader: ContractAddress,
    pub challenge_leader_power: u128,
    pub challenge_deadline: u64,
    pub stale: bool,
    pub needs_sync: bool,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct OperatorStatus {
    pub operator: ContractAddress,
    pub live_delegated_amount: u128,
    pub point_power: u128,
    pub challenge_power: u128,
    pub forfeited_power: u128,
    pub available_power: u128,
    pub generation: u64,
    pub controlled_point_count: u32,
    pub active_challenge_id: u64,
    pub active_challenge_commitment: u128,
    pub retired: bool,
    pub exiting: bool,
    pub needs_sync: bool,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct ChallengeStatus {
    pub id: u64,
    pub control_point_id: u32,
    pub incumbent: ContractAddress,
    pub leader: ContractAddress,
    pub leader_power: u128,
    pub required_power: u128,
    pub deadline: u64,
    pub participant_count: u32,
    pub settled: bool,
    pub winner: ContractAddress,
}

#[starknet::interface]
pub trait IControl<TContractState> {
    fn capture(ref self: TContractState, control_point_id: u32);
    fn reinforce(ref self: TContractState, control_point_id: u32);
    fn release(ref self: TContractState, control_point_id: u32);
    fn challenge(ref self: TContractState, control_point_id: u32);
    fn challenge_with_collateral(
        ref self: TContractState, control_point_id: u32, collateral_point_id: u32,
    );
    fn settle_challenge(ref self: TContractState, control_point_id: u32);
    fn retire(ref self: TContractState);
    fn relinquish_all(ref self: TContractState);
    fn sync_operator(ref self: TContractState, operator: ContractAddress) -> u128;
    fn sync_operators(ref self: TContractState, operators: Span<ContractAddress>) -> u32;
    fn get_control_point_status(self: @TContractState, control_point_id: u32) -> ControlPointStatus;
    fn get_control_point_statuses(
        self: @TContractState, control_point_ids: Span<u32>,
    ) -> Array<ControlPointStatus>;
    fn get_operator_status(self: @TContractState, operator: ContractAddress) -> OperatorStatus;
    fn get_challenge_status(self: @TContractState, challenge_id: u64) -> ChallengeStatus;
    fn can_manage_image(
        self: @TContractState,
        control_point_id: u32,
        operator: ContractAddress,
        ownership_generation: u64,
    ) -> bool;
    fn required_stake(self: @TContractState, control_point_id: u32) -> u128;
}

#[dojo::contract]
pub mod control {
    use core::num::traits::Zero;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use stakewars::math::minimum_challenge;
    use stakewars::models::{
        CHALLENGE_COUNTER_ID, CONFIG_ID, Challenge, ChallengeCounter, ChallengeParticipant,
        ControlPoint, GameConfig, OperatorState,
    };
    use stakewars::staking::{DelegationState, delegation_state};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        ChallengeStatus, ControlPointStatus, IControl, MAX_STATUS_BATCH, MAX_SYNC_BATCH,
        OperatorStatus,
    };

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointCaptured {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub capture_power: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointReinforced {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub added_power: u128,
        pub capture_power: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointReleased {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub previous_controller: ContractAddress,
        pub released_power: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ChallengeStarted {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub control_point_id: u32,
        pub incumbent: ContractAddress,
        pub challenger: ContractAddress,
        pub incumbent_power: u128,
        pub challenger_power: u128,
        pub deadline: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ChallengeLeadershipChanged {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub control_point_id: u32,
        pub previous_leader: ContractAddress,
        pub leader: ContractAddress,
        pub leader_power: u128,
        pub deadline: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct CollateralSacrificed {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub operator: ContractAddress,
        #[key]
        pub control_point_id: u32,
        pub power: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ChallengeSettled {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub control_point_id: u32,
        pub winner: ContractAddress,
        pub winning_power: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct PowerForfeited {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub operator: ContractAddress,
        pub amount: u128,
        pub total_forfeited_power: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OperatorDisqualified {
        #[key]
        pub operator: ContractAddress,
        pub previous_generation: u64,
        pub new_generation: u64,
        pub invalidated_power: u128,
        pub live_delegated_amount: u128,
        pub invalidated_point_count: u32,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OperatorRetired {
        #[key]
        pub operator: ContractAddress,
        pub previous_generation: u64,
        pub new_generation: u64,
        pub invalidated_power: u128,
        pub released_point_count: u32,
    }

    #[abi(embed_v0)]
    impl ControlImpl of IControl<ContractState> {
        fn capture(ref self: ContractState, control_point_id: u32) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            assert(operator.active_challenge_id == 0, 'active challenge');

            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            if !point.controller.is_zero() {
                let (controller, _, _) = self
                    .refresh_operator(point.controller, config.staking_pool);
                let current = !controller.retired
                    && controller.generation > 0
                    && point.controller_generation == controller.generation;
                assert(!current, 'point occupied');
            }

            let available = available_power(delegation.amount, operator);
            assert(available >= config.minimum_stake, 'below minimum stake');
            operator.point_power += available;
            operator.controlled_point_count += 1;
            point.controller = caller;
            point.controller_generation = operator.generation;
            point.capture_power = available;
            point.ownership_generation += 1;
            point.controlled_since = get_block_timestamp();
            point.active_challenge_id = 0;
            world.write_model(@operator);
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointCaptured {
                        control_point_id,
                        controller: caller,
                        capture_power: available,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn reinforce(ref self: ContractState, control_point_id: u32) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            assert(operator.active_challenge_id == 0, 'active challenge');

            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            self.assert_controller(point, caller, operator);
            assert(point.active_challenge_id == 0, 'point challenged');
            let added_power = available_power(delegation.amount, operator);
            assert(added_power > 0, 'no available power');
            operator.point_power += added_power;
            point.capture_power += added_power;
            world.write_model(@operator);
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointReinforced {
                        control_point_id,
                        controller: caller,
                        added_power,
                        capture_power: point.capture_power,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn release(ref self: ContractState, control_point_id: u32) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            let caller = get_caller_address();
            let (mut operator, _, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            self.assert_controller(point, caller, operator);
            assert(point.active_challenge_id == 0, 'point challenged');
            let released_power = point.capture_power;
            self.release_point(ref operator, ref point);
            world.write_model(@operator);
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointReleased {
                        control_point_id,
                        previous_controller: caller,
                        released_power,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn challenge(ref self: ContractState, control_point_id: u32) {
            self.challenge_internal(control_point_id, Option::None);
        }

        fn challenge_with_collateral(
            ref self: ContractState, control_point_id: u32, collateral_point_id: u32,
        ) {
            self.challenge_internal(control_point_id, Option::Some(collateral_point_id));
        }

        fn settle_challenge(ref self: ContractState, control_point_id: u32) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            assert(point.active_challenge_id > 0, 'no active challenge');
            let mut challenge: Challenge = world.read_model(point.active_challenge_id);
            assert(!challenge.settled, 'challenge settled');
            assert(get_block_timestamp() >= challenge.deadline, 'challenge active');

            let (leader_state, _, _) = self.refresh_operator(challenge.leader, config.staking_pool);
            let leader_participant: ChallengeParticipant = world
                .read_model((challenge.id, challenge.leader));
            let leader_valid = leader_participant.joined
                && !leader_participant.resolved
                && leader_participant.operator_generation == leader_state.generation
                && !leader_state.retired;

            let mut winner = if leader_valid {
                challenge.leader
            } else {
                zero_address()
            };
            if winner.is_zero() {
                let (incumbent_state, _, _) = self
                    .refresh_operator(challenge.incumbent, config.staking_pool);
                let incumbent_participant: ChallengeParticipant = world
                    .read_model((challenge.id, challenge.incumbent));
                if incumbent_participant.joined
                    && !incumbent_participant.resolved
                    && incumbent_participant.operator_generation == incumbent_state.generation
                    && !incumbent_state.retired {
                    winner = challenge.incumbent;
                }
            }

            self.resolve_at_settlement(challenge.id, challenge.incumbent, winner, ref point);
            if !winner.is_zero() && winner != challenge.incumbent {
                self.resolve_at_settlement(challenge.id, winner, winner, ref point);
            }

            if winner.is_zero() {
                clear_point(ref point);
            } else {
                let winner_participant: ChallengeParticipant = world
                    .read_model((challenge.id, winner));
                if point.controller != winner {
                    point.ownership_generation += 1;
                    point.controlled_since = get_block_timestamp();
                }
                let winner_state: OperatorState = world.read_model(winner);
                point.controller = winner;
                point.controller_generation = winner_state.generation;
                point.capture_power = winner_participant.commitment;
                point.active_challenge_id = 0;
            }

            challenge.settled = true;
            challenge.winner = winner;
            challenge.settled_at = get_block_timestamp();
            world.write_model(@point);
            world.write_model(@challenge);
            world
                .emit_event(
                    @ChallengeSettled {
                        challenge_id: challenge.id,
                        control_point_id,
                        winner,
                        winning_power: if winner.is_zero() {
                            0
                        } else {
                            point.capture_power
                        },
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn retire(ref self: ContractState) {
            self.initialized_config();
            self.retire_operator(get_caller_address());
        }

        fn relinquish_all(ref self: ContractState) {
            self.initialized_config();
            self.retire_operator(get_caller_address());
        }

        fn sync_operator(ref self: ContractState, operator: ContractAddress) -> u128 {
            assert(!operator.is_zero(), 'zero operator');
            let config = self.initialized_config();
            let (_, delegation, _) = self.refresh_operator(operator, config.staking_pool);
            delegation.amount
        }

        fn sync_operators(ref self: ContractState, operators: Span<ContractAddress>) -> u32 {
            assert(operators.len() > 0, 'empty sync batch');
            assert(operators.len() <= MAX_SYNC_BATCH, 'sync batch too large');
            let config = self.initialized_config();
            let mut synchronized = 0;
            for operator in operators {
                assert(!operator.is_zero(), 'zero operator');
                let (_, _, changed) = self.refresh_operator(*operator, config.staking_pool);
                if changed {
                    synchronized += 1;
                }
            }
            synchronized
        }

        fn get_control_point_status(
            self: @ContractState, control_point_id: u32,
        ) -> ControlPointStatus {
            let config = self.initialized_config();
            self.assert_control_point_id(config, control_point_id);
            self.control_point_status(config, control_point_id)
        }

        fn get_control_point_statuses(
            self: @ContractState, control_point_ids: Span<u32>,
        ) -> Array<ControlPointStatus> {
            assert(control_point_ids.len() > 0, 'empty status batch');
            assert(control_point_ids.len() <= MAX_STATUS_BATCH, 'status batch too large');
            let config = self.initialized_config();
            let mut statuses = array![];
            for control_point_id in control_point_ids {
                self.assert_control_point_id(config, *control_point_id);
                statuses.append(self.control_point_status(config, *control_point_id));
            }
            statuses
        }

        fn get_operator_status(self: @ContractState, operator: ContractAddress) -> OperatorStatus {
            assert(!operator.is_zero(), 'zero operator');
            let config = self.initialized_config();
            self.operator_status(config, operator)
        }

        fn get_challenge_status(self: @ContractState, challenge_id: u64) -> ChallengeStatus {
            assert(challenge_id > 0, 'invalid challenge');
            let config = self.initialized_config();
            let world = self.world_default();
            let challenge: Challenge = world.read_model(challenge_id);
            assert(challenge.id == challenge_id, 'challenge not found');
            ChallengeStatus {
                id: challenge.id,
                control_point_id: challenge.control_point_id,
                incumbent: challenge.incumbent,
                leader: challenge.leader,
                leader_power: challenge.leader_power,
                required_power: minimum_challenge(
                    challenge.leader_power, config.challenge_premium_bps,
                ),
                deadline: challenge.deadline,
                participant_count: challenge.participant_count,
                settled: challenge.settled,
                winner: challenge.winner,
            }
        }

        fn can_manage_image(
            self: @ContractState,
            control_point_id: u32,
            operator: ContractAddress,
            ownership_generation: u64,
        ) -> bool {
            if operator.is_zero() {
                return false;
            }
            let config = self.initialized_config();
            self.assert_control_point_id(config, control_point_id);
            let status = self.control_point_status(config, control_point_id);
            status.controller == operator
                && status.ownership_generation == ownership_generation
                && !status.stale
        }

        fn required_stake(self: @ContractState, control_point_id: u32) -> u128 {
            let config = self.initialized_config();
            self.assert_control_point_id(config, control_point_id);
            self.control_point_status(config, control_point_id).required_stake
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"stakewars")
        }

        fn initialized_config(self: @ContractState) -> GameConfig {
            let world = self.world_default();
            let config: GameConfig = world.read_model(CONFIG_ID);
            assert(config.initialized, 'not initialized');
            config
        }

        fn active_config(self: @ContractState) -> GameConfig {
            let config = self.initialized_config();
            assert(!config.paused, 'game paused');
            config
        }

        fn assert_control_point_id(self: @ContractState, config: GameConfig, id: u32) {
            assert(id < config.control_point_limit, 'invalid control point');
        }

        fn assert_playable(self: @ContractState, ref operator: OperatorState) {
            assert(!operator.retired, 'operator retired');
            if operator.generation == 0 {
                operator.generation = 1;
            }
        }

        fn assert_controller(
            self: @ContractState,
            point: ControlPoint,
            operator_address: ContractAddress,
            operator: OperatorState,
        ) {
            assert(
                point.controller == operator_address
                    && point.controller_generation == operator.generation,
                'not controller',
            );
        }

        fn operator_status(
            self: @ContractState, config: GameConfig, operator_address: ContractAddress,
        ) -> OperatorStatus {
            let world = self.world_default();
            let operator: OperatorState = world.read_model(operator_address);
            let delegation = delegation_state(config.staking_pool, operator_address);
            let obligations = total_obligations(operator);
            let active_challenge_commitment = if operator.active_challenge_id > 0 {
                let participant: ChallengeParticipant = world
                    .read_model((operator.active_challenge_id, operator_address));
                if participant.joined && !participant.resolved {
                    participant.commitment
                } else {
                    0
                }
            } else {
                0
            };
            OperatorStatus {
                operator: operator_address,
                live_delegated_amount: delegation.amount,
                point_power: operator.point_power,
                challenge_power: operator.challenge_power,
                forfeited_power: operator.forfeited_power,
                available_power: available_power(delegation.amount, operator),
                generation: operator.generation,
                controlled_point_count: operator.controlled_point_count,
                active_challenge_id: operator.active_challenge_id,
                active_challenge_commitment,
                retired: operator.retired,
                exiting: delegation.exiting,
                needs_sync: !operator.retired
                    && (delegation.exiting || delegation.amount < obligations),
            }
        }

        fn control_point_status(
            self: @ContractState, config: GameConfig, control_point_id: u32,
        ) -> ControlPointStatus {
            let world = self.world_default();
            let point: ControlPoint = world.read_model(control_point_id);
            let mut controller = zero_address();
            let mut capture_power = 0;
            let mut controlled_since = 0;
            let mut stale = false;
            let mut needs_sync = false;
            if !point.controller.is_zero() {
                let operator = self.operator_status(config, point.controller);
                let current = !operator.retired
                    && point.controller_generation == operator.generation
                    && !operator.needs_sync;
                if current {
                    controller = point.controller;
                    capture_power = point.capture_power;
                    controlled_since = point.controlled_since;
                } else {
                    stale = true;
                    needs_sync = operator.needs_sync;
                }
            }

            let mut challenge_leader = zero_address();
            let mut challenge_leader_power = 0;
            let mut challenge_deadline = 0;
            if point.active_challenge_id > 0 {
                let challenge: Challenge = world.read_model(point.active_challenge_id);
                if !challenge.settled {
                    challenge_leader = challenge.leader;
                    challenge_leader_power = challenge.leader_power;
                    challenge_deadline = challenge.deadline;
                }
            }
            let required_stake = if point.active_challenge_id > 0 {
                minimum_challenge(challenge_leader_power, config.challenge_premium_bps)
            } else if controller.is_zero() {
                config.minimum_stake
            } else {
                minimum_challenge(capture_power, config.challenge_premium_bps)
            };

            ControlPointStatus {
                id: control_point_id,
                controller,
                capture_power,
                ownership_generation: point.ownership_generation,
                controlled_since,
                required_stake,
                active_challenge_id: point.active_challenge_id,
                challenge_leader,
                challenge_leader_power,
                challenge_deadline,
                stale,
                needs_sync,
            }
        }

        fn refresh_operator(
            ref self: ContractState,
            operator_address: ContractAddress,
            staking_pool: ContractAddress,
        ) -> (OperatorState, DelegationState, bool) {
            assert(!operator_address.is_zero(), 'zero operator');
            let mut world = self.world_default();
            let mut operator: OperatorState = world.read_model(operator_address);
            let mut changed = self.resolve_settled(ref operator);
            let delegation = delegation_state(staking_pool, operator_address);

            if !operator.retired && delegation.exiting {
                self.retire_state(ref operator);
                changed = true;
            } else if !operator.retired && operator.generation > 0 && delegation.amount == 0 {
                self.retire_state(ref operator);
                changed = true;
            } else if !operator.retired && delegation.amount < total_obligations(operator) {
                let previous_generation = operator.generation;
                let invalidated_power = operator.point_power + operator.challenge_power;
                let invalidated_point_count = operator.controlled_point_count;
                operator.generation += 1;
                operator.forfeited_power += invalidated_power;
                operator.point_power = 0;
                operator.challenge_power = 0;
                operator.controlled_point_count = 0;
                operator.active_challenge_id = 0;
                changed = true;
                world
                    .emit_event(
                        @OperatorDisqualified {
                            operator: operator_address,
                            previous_generation,
                            new_generation: operator.generation,
                            invalidated_power,
                            live_delegated_amount: delegation.amount,
                            invalidated_point_count,
                        },
                    );
            }
            if changed {
                world.write_model(@operator);
            }
            (operator, delegation, changed)
        }

        fn resolve_settled(self: @ContractState, ref operator: OperatorState) -> bool {
            if operator.active_challenge_id == 0 {
                return false;
            }
            let mut world = self.world_default();
            let challenge: Challenge = world.read_model(operator.active_challenge_id);
            if !challenge.settled {
                return false;
            }
            let mut participant: ChallengeParticipant = world
                .read_model((challenge.id, operator.operator));
            if !participant.joined || participant.resolved {
                operator.active_challenge_id = 0;
                return true;
            }
            if participant.operator_generation == operator.generation {
                if challenge.winner == operator.operator {
                    let challenge_component = participant.commitment
                        - participant.point_power_included;
                    operator.challenge_power -= challenge_component;
                    operator.point_power += challenge_component;
                } else {
                    let challenge_component = participant.commitment
                        - participant.point_power_included;
                    operator.challenge_power -= challenge_component;
                    if participant.point_power_included > 0 {
                        operator.point_power -= participant.point_power_included;
                        operator.controlled_point_count -= 1;
                    }
                    operator.forfeited_power += participant.commitment;
                    world
                        .emit_event(
                            @PowerForfeited {
                                challenge_id: challenge.id,
                                operator: operator.operator,
                                amount: participant.commitment,
                                total_forfeited_power: operator.forfeited_power,
                            },
                        );
                }
            }
            operator.active_challenge_id = 0;
            participant.resolved = true;
            world.write_model(@participant);
            true
        }

        fn challenge_internal(
            ref self: ContractState, control_point_id: u32, collateral_point_id: Option<u32>,
        ) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            match collateral_point_id {
                Option::Some(source_id) => self.assert_control_point_id(config, source_id),
                Option::None => {},
            }
            assert(!point.controller.is_zero(), 'point neutral');
            let (mut incumbent_state, _, _) = self
                .refresh_operator(point.controller, config.staking_pool);
            self.assert_controller(point, point.controller, incumbent_state);

            if point.active_challenge_id == 0 {
                assert(caller != point.controller, 'already controller');
                assert(operator.active_challenge_id == 0, 'active challenge');
                assert(incumbent_state.active_challenge_id == 0, 'incumbent challenged');
                let challenge_id = self.next_challenge_id();
                let contribution = self
                    .commit_contribution(
                        ref operator,
                        delegation.amount,
                        challenge_id,
                        control_point_id,
                        collateral_point_id,
                    );
                let required = minimum_challenge(point.capture_power, config.challenge_premium_bps);
                assert(contribution >= required, 'insufficient challenge');
                let deadline = get_block_timestamp() + config.challenge_period_seconds;
                operator.challenge_power += contribution;
                operator.active_challenge_id = challenge_id;
                incumbent_state.active_challenge_id = challenge_id;
                point.active_challenge_id = challenge_id;
                let challenge = Challenge {
                    id: challenge_id,
                    control_point_id,
                    incumbent: point.controller,
                    leader: caller,
                    leader_power: contribution,
                    deadline,
                    participant_count: 2,
                    settled: false,
                    winner: zero_address(),
                    settled_at: 0,
                };
                let incumbent = ChallengeParticipant {
                    challenge_id,
                    operator: point.controller,
                    commitment: point.capture_power,
                    point_power_included: point.capture_power,
                    operator_generation: incumbent_state.generation,
                    joined: true,
                    resolved: false,
                };
                let challenger = ChallengeParticipant {
                    challenge_id,
                    operator: caller,
                    commitment: contribution,
                    point_power_included: 0,
                    operator_generation: operator.generation,
                    joined: true,
                    resolved: false,
                };
                world.write_model(@operator);
                world.write_model(@incumbent_state);
                world.write_model(@point);
                world.write_model(@challenge);
                world.write_model(@incumbent);
                world.write_model(@challenger);
                world
                    .emit_event(
                        @ChallengeStarted {
                            challenge_id,
                            control_point_id,
                            incumbent: point.controller,
                            challenger: caller,
                            incumbent_power: point.capture_power,
                            challenger_power: contribution,
                            deadline,
                        },
                    );
                return;
            }

            let mut challenge: Challenge = world.read_model(point.active_challenge_id);
            assert(!challenge.settled, 'challenge settled');
            assert(get_block_timestamp() < challenge.deadline, 'challenge ended');
            assert(challenge.leader != caller, 'leader cannot raise');
            assert(
                operator.active_challenge_id == 0 || operator.active_challenge_id == challenge.id,
                'active challenge',
            );
            let mut participant: ChallengeParticipant = world.read_model((challenge.id, caller));
            let contribution = self
                .commit_contribution(
                    ref operator,
                    delegation.amount,
                    challenge.id,
                    control_point_id,
                    collateral_point_id,
                );
            assert(contribution > 0, 'no available power');
            let new_commitment = if participant.joined {
                assert(!participant.resolved, 'position resolved');
                participant.commitment + contribution
            } else {
                contribution
            };
            let required = minimum_challenge(challenge.leader_power, config.challenge_premium_bps);
            assert(new_commitment >= required, 'insufficient raise');
            if !participant.joined {
                participant.challenge_id = challenge.id;
                participant.operator = caller;
                participant.point_power_included = 0;
                participant.operator_generation = operator.generation;
                participant.joined = true;
                participant.resolved = false;
                challenge.participant_count += 1;
            }
            participant.commitment = new_commitment;
            operator.challenge_power += contribution;
            operator.active_challenge_id = challenge.id;
            let previous_leader = challenge.leader;
            challenge.leader = caller;
            challenge.leader_power = new_commitment;
            challenge.deadline = get_block_timestamp() + config.challenge_period_seconds;
            world.write_model(@operator);
            world.write_model(@participant);
            world.write_model(@challenge);
            world
                .emit_event(
                    @ChallengeLeadershipChanged {
                        challenge_id: challenge.id,
                        control_point_id,
                        previous_leader,
                        leader: caller,
                        leader_power: new_commitment,
                        deadline: challenge.deadline,
                    },
                );
        }

        fn commit_contribution(
            ref self: ContractState,
            ref operator: OperatorState,
            live_amount: u128,
            challenge_id: u64,
            target_point_id: u32,
            collateral_point_id: Option<u32>,
        ) -> u128 {
            let available = available_power(live_amount, operator);
            let mut collateral_power = 0;
            match collateral_point_id {
                Option::Some(source_id) => {
                    assert(source_id != target_point_id, 'target as collateral');
                    let mut world = self.world_default();
                    let mut source: ControlPoint = world.read_model(source_id);
                    self.assert_controller(source, operator.operator, operator);
                    assert(source.active_challenge_id == 0, 'collateral challenged');
                    collateral_power = source.capture_power;
                    self.release_point(ref operator, ref source);
                    world.write_model(@source);
                    world
                        .emit_event(
                            @CollateralSacrificed {
                                challenge_id,
                                operator: operator.operator,
                                control_point_id: source_id,
                                power: collateral_power,
                            },
                        );
                },
                Option::None => {},
            }
            available + collateral_power
        }

        fn release_point(
            self: @ContractState, ref operator: OperatorState, ref point: ControlPoint,
        ) {
            let released_power = point.capture_power;
            assert(operator.controlled_point_count > 0, 'point count invariant');
            assert(operator.point_power >= released_power, 'point power invariant');
            operator.point_power -= released_power;
            operator.controlled_point_count -= 1;
            clear_point(ref point);
        }

        fn next_challenge_id(ref self: ContractState) -> u64 {
            let mut world = self.world_default();
            let mut counter: ChallengeCounter = world.read_model(CHALLENGE_COUNTER_ID);
            counter.next_id += 1;
            world.write_model(@counter);
            counter.next_id
        }

        fn resolve_at_settlement(
            ref self: ContractState,
            challenge_id: u64,
            operator_address: ContractAddress,
            winner: ContractAddress,
            ref point: ControlPoint,
        ) {
            let mut world = self.world_default();
            let mut participant: ChallengeParticipant = world
                .read_model((challenge_id, operator_address));
            if !participant.joined || participant.resolved {
                return;
            }
            let mut operator: OperatorState = world.read_model(operator_address);
            if participant.operator_generation != operator.generation {
                participant.resolved = true;
                world.write_model(@participant);
                return;
            }
            let challenge_component = participant.commitment - participant.point_power_included;
            if operator_address == winner {
                operator.challenge_power -= challenge_component;
                operator.point_power += challenge_component;
                if participant.point_power_included == 0 {
                    operator.controlled_point_count += 1;
                }
            } else {
                operator.challenge_power -= challenge_component;
                if participant.point_power_included > 0 {
                    operator.point_power -= participant.point_power_included;
                    operator.controlled_point_count -= 1;
                }
                operator.forfeited_power += participant.commitment;
                world
                    .emit_event(
                        @PowerForfeited {
                            challenge_id,
                            operator: operator_address,
                            amount: participant.commitment,
                            total_forfeited_power: operator.forfeited_power,
                        },
                    );
            }
            operator.active_challenge_id = 0;
            participant.resolved = true;
            world.write_model(@operator);
            world.write_model(@participant);
        }

        fn retire_operator(ref self: ContractState, operator_address: ContractAddress) {
            assert(!operator_address.is_zero(), 'zero operator');
            let mut world = self.world_default();
            let mut operator: OperatorState = world.read_model(operator_address);
            if operator.retired {
                return;
            }
            let previous_generation = operator.generation;
            let invalidated_power = operator.point_power + operator.challenge_power;
            let released_point_count = operator.controlled_point_count;
            if operator.generation == 0 {
                operator.generation = 1;
            }
            self.retire_state(ref operator);
            world.write_model(@operator);
            world
                .emit_event(
                    @OperatorRetired {
                        operator: operator_address,
                        previous_generation,
                        new_generation: operator.generation,
                        invalidated_power,
                        released_point_count,
                    },
                );
        }

        fn retire_state(self: @ContractState, ref operator: OperatorState) {
            operator.generation += 1;
            operator.forfeited_power += operator.point_power + operator.challenge_power;
            operator.point_power = 0;
            operator.challenge_power = 0;
            operator.controlled_point_count = 0;
            operator.active_challenge_id = 0;
            operator.retired = true;
        }
    }

    fn total_obligations(operator: OperatorState) -> u128 {
        operator.point_power + operator.challenge_power + operator.forfeited_power
    }

    fn available_power(live_amount: u128, operator: OperatorState) -> u128 {
        let obligations = total_obligations(operator);
        if live_amount > obligations {
            live_amount - obligations
        } else {
            0
        }
    }

    fn clear_point(ref point: ControlPoint) {
        point.controller = zero_address();
        point.controller_generation = 0;
        point.capture_power = 0;
        point.ownership_generation += 1;
        point.controlled_since = 0;
        point.active_challenge_id = 0;
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
