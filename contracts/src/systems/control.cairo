use starknet::ContractAddress;

pub const MAX_SYNC_BATCH: usize = 50;
pub const MAX_STATUS_BATCH: usize = 200;
pub const MAX_CONTROL_ACTION_BATCH: usize = 200;
const MAX_U128: u128 = 340282366920938463463374607431768211455;
const MINIMUM_CHALLENGE_RAISE_DIVISOR: u128 = 10;

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct CaptureRequest {
    pub control_point_id: u32,
    pub allocation: u128,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct ReinforcementRequest {
    pub control_point_id: u32,
    pub additional_allocation: u128,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct ControlPointStatus {
    pub id: u32,
    pub controller: ContractAddress,
    pub capture_force: u128,
    pub ownership_generation: u64,
    pub controlled_since: u64,
    pub required_stake: u128,
    pub active_challenge_id: u64,
    pub challenge_lead_change_count: u32,
    pub challenge_deadline: u64,
    pub stale: bool,
    pub needs_sync: bool,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct OperatorStatus {
    pub operator: ContractAddress,
    pub live_delegated_amount: u128,
    pub point_force: u128,
    pub challenge_force: u128,
    pub spent_force: u128,
    pub available_force: u128,
    pub generation: u64,
    pub controlled_point_count: u32,
    pub active_challenge_count: u32,
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
    pub leading_force: u128,
    pub last_loser: ContractAddress,
    pub last_losing_force: u128,
    pub deadline: u64,
    pub lead_change_count: u32,
    pub participant_count: u32,
    pub settled: bool,
    pub winner: ContractAddress,
    pub winning_force: u128,
    pub losing_force: u128,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct ChallengeParticipantStatus {
    pub challenge_id: u64,
    pub operator: ContractAddress,
    pub committed_force: u128,
    pub point_force_included: u128,
    pub additional_force: u128,
    pub joined: bool,
    pub resolved: bool,
    pub won: bool,
}

#[starknet::interface]
pub trait IControl<TContractState> {
    fn capture(ref self: TContractState, control_point_id: u32, allocation: u128);
    fn capture_many(ref self: TContractState, captures: Span<CaptureRequest>);
    fn reinforce(ref self: TContractState, control_point_id: u32, additional_allocation: u128);
    fn reinforce_many(ref self: TContractState, reinforcements: Span<ReinforcementRequest>);
    fn release(ref self: TContractState, control_point_id: u32);
    fn challenge(ref self: TContractState, control_point_id: u32, committed_force: u128);
    fn challenge_with_sacrifice(
        ref self: TContractState,
        control_point_id: u32,
        sacrificed_control_point_id: u32,
        committed_force: u128,
    );
    fn settle_challenge(ref self: TContractState, control_point_id: u32);
    fn resolve_challenge_position(
        ref self: TContractState, challenge_id: u64, operator: ContractAddress,
    );
    fn retire(ref self: TContractState);
    fn sync_operator(ref self: TContractState, operator: ContractAddress) -> u128;
    fn sync_operators(ref self: TContractState, operators: Span<ContractAddress>) -> u32;
    fn get_control_point_status(self: @TContractState, control_point_id: u32) -> ControlPointStatus;
    fn get_control_point_statuses(
        self: @TContractState, control_point_ids: Span<u32>,
    ) -> Array<ControlPointStatus>;
    fn get_operator_status(self: @TContractState, operator: ContractAddress) -> OperatorStatus;
    fn get_challenge_status(self: @TContractState, challenge_id: u64) -> ChallengeStatus;
    fn get_challenge_participant_status(
        self: @TContractState, challenge_id: u64, operator: ContractAddress,
    ) -> ChallengeParticipantStatus;
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
    use stakewars::models::{
        CHALLENGE_COUNTER_ID, CONFIG_ID, Challenge, ChallengeCounter, ChallengeParticipant,
        ControlPoint, GameConfig, OperatorState,
    };
    use stakewars::staking::{DelegationState, delegation_state};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        CaptureRequest, ChallengeParticipantStatus, ChallengeStatus, ControlPointStatus, IControl,
        MAX_CONTROL_ACTION_BATCH, MAX_STATUS_BATCH, MAX_SYNC_BATCH, OperatorStatus,
        ReinforcementRequest,
    };

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointCaptured {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub capture_force: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointReinforced {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub added_force: u128,
        pub capture_force: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointReleased {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub previous_controller: ContractAddress,
        pub released_force: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ChallengeInitiated {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub control_point_id: u32,
        #[key]
        pub challenger: ContractAddress,
        pub incumbent: ContractAddress,
        pub defender_force_at_risk: u128,
        pub committed_force: u128,
        pub deadline: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ChallengeEscalated {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub control_point_id: u32,
        #[key]
        pub challenger: ContractAddress,
        pub committed_force: u128,
        pub added_force: u128,
        pub previous_leader: ContractAddress,
        pub previous_leading_force: u128,
        pub deadline: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointSacrificed {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub operator: ContractAddress,
        #[key]
        pub control_point_id: u32,
        pub force: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ChallengeSettled {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub control_point_id: u32,
        pub winner: ContractAddress,
        pub loser: ContractAddress,
        pub winning_force: u128,
        pub losing_force: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ChallengePositionResolved {
        #[key]
        pub challenge_id: u64,
        #[key]
        pub operator: ContractAddress,
        #[key]
        pub control_point_id: u32,
        pub lost_force: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OperatorDisqualified {
        #[key]
        pub operator: ContractAddress,
        pub previous_generation: u64,
        pub new_generation: u64,
        pub invalidated_force: u128,
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
        pub invalidated_force: u128,
        pub released_point_count: u32,
    }

    #[abi(embed_v0)]
    impl ControlImpl of IControl<ContractState> {
        fn capture(ref self: ContractState, control_point_id: u32, allocation: u128) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            self
                .capture_with_synced(
                    config,
                    caller,
                    ref operator,
                    delegation.amount,
                    control_point_id,
                    allocation,
                    get_block_timestamp(),
                );
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn capture_many(ref self: ContractState, captures: Span<CaptureRequest>) {
            assert(captures.len() > 0, 'empty capture batch');
            assert(captures.len() <= MAX_CONTROL_ACTION_BATCH, 'capture batch too large');
            let config = self.active_config();
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            let controlled_since = get_block_timestamp();
            for capture in captures {
                self.assert_control_point_id(config, *capture.control_point_id);
                self
                    .capture_with_synced(
                        config,
                        caller,
                        ref operator,
                        delegation.amount,
                        *capture.control_point_id,
                        *capture.allocation,
                        controlled_since,
                    );
            }
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn reinforce(ref self: ContractState, control_point_id: u32, additional_allocation: u128) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            self
                .reinforce_with_synced(
                    caller,
                    ref operator,
                    delegation.amount,
                    control_point_id,
                    additional_allocation,
                );
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn reinforce_many(ref self: ContractState, reinforcements: Span<ReinforcementRequest>) {
            assert(reinforcements.len() > 0, 'empty reinforce batch');
            assert(reinforcements.len() <= MAX_CONTROL_ACTION_BATCH, 'reinforce batch too large');
            let config = self.active_config();
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            for reinforcement in reinforcements {
                self.assert_control_point_id(config, *reinforcement.control_point_id);
                self
                    .reinforce_with_synced(
                        caller,
                        ref operator,
                        delegation.amount,
                        *reinforcement.control_point_id,
                        *reinforcement.additional_allocation,
                    );
            }
            let mut world = self.world_default();
            world.write_model(@operator);
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
            let released_force = point.capture_force;
            self.release_point(ref operator, ref point);
            world.write_model(@operator);
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointReleased {
                        control_point_id,
                        previous_controller: caller,
                        released_force,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn challenge(ref self: ContractState, control_point_id: u32, committed_force: u128) {
            self.commit_challenge_force(control_point_id, committed_force, Option::None);
        }

        fn challenge_with_sacrifice(
            ref self: ContractState,
            control_point_id: u32,
            sacrificed_control_point_id: u32,
            committed_force: u128,
        ) {
            self
                .commit_challenge_force(
                    control_point_id, committed_force, Option::Some(sacrificed_control_point_id),
                );
        }

        fn settle_challenge(ref self: ContractState, control_point_id: u32) {
            let config = self.initialized_config();
            self.assert_control_point_id(config, control_point_id);
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            assert(point.active_challenge_id > 0, 'no active challenge');
            let mut challenge: Challenge = world.read_model(point.active_challenge_id);
            assert(!challenge.settled, 'challenge settled');
            assert(get_block_timestamp() >= challenge.deadline, 'challenge active');

            let mut winner_position: ChallengeParticipant = world
                .read_model((challenge.id, challenge.leader));
            let (mut leader, _, _) = self.refresh_operator(challenge.leader, config.staking_pool);
            let leader_valid = valid_challenge_operator(leader, challenge.leader_generation)
                && winner_position.joined
                && !winner_position.resolved
                && winner_position.operator_generation == leader.generation
                && winner_position.committed_force == challenge.leading_force;
            let mut winner = zero_address();
            let mut winning_force = 0;
            if leader_valid {
                winner = challenge.leader;
                winning_force = challenge.leading_force;
                let additional_force = winning_force - winner_position.point_force_included;
                assert(leader.challenge_force >= additional_force, 'challenge force invariant');
                assert(leader.active_challenge_count > 0, 'challenge count invariant');
                leader.challenge_force -= additional_force;
                leader.point_force += additional_force;
                if winner_position.point_force_included == 0 {
                    leader.controlled_point_count += 1;
                }
                leader.active_challenge_count -= 1;
                winner_position.resolved = true;
                winner_position.won = true;
                world.write_model(@leader);
                world.write_model(@winner_position);
            }

            challenge.winner = winner;
            if challenge.incumbent != winner {
                self.resolve_losing_position(config, challenge, challenge.incumbent);
            }
            if challenge.last_loser != winner && challenge.last_loser != challenge.incumbent {
                self.resolve_losing_position(config, challenge, challenge.last_loser);
            }

            if winner.is_zero() {
                clear_point(ref point);
            } else {
                if point.controller != winner {
                    point.ownership_generation += 1;
                    point.controlled_since = get_block_timestamp();
                }
                point.controller = winner;
                point.controller_generation = leader.generation;
                point.capture_force = winning_force;
                point.active_challenge_id = 0;
            }

            challenge.settled = true;
            challenge.winning_force = winning_force;
            challenge.losing_force = challenge.last_losing_force;
            challenge.settled_at = get_block_timestamp();
            world.write_model(@point);
            world.write_model(@challenge);
            world
                .emit_event(
                    @ChallengeSettled {
                        challenge_id: challenge.id,
                        control_point_id,
                        winner,
                        loser: challenge.last_loser,
                        winning_force,
                        losing_force: challenge.last_losing_force,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn resolve_challenge_position(
            ref self: ContractState, challenge_id: u64, operator: ContractAddress,
        ) {
            assert(challenge_id > 0, 'invalid challenge');
            assert(!operator.is_zero(), 'zero operator');
            let config = self.initialized_config();
            let world = self.world_default();
            let challenge: Challenge = world.read_model(challenge_id);
            assert(challenge.id == challenge_id, 'challenge not found');
            assert(challenge.settled, 'challenge active');
            assert(operator != challenge.winner, 'winner position');
            let resolved_force = self.resolve_losing_position(config, challenge, operator);
            assert(resolved_force > 0, 'position unavailable');
        }

        fn retire(ref self: ContractState) {
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
            let world = self.world_default();
            let challenge: Challenge = world.read_model(challenge_id);
            assert(challenge.id == challenge_id, 'challenge not found');
            ChallengeStatus {
                id: challenge.id,
                control_point_id: challenge.control_point_id,
                incumbent: challenge.incumbent,
                leader: challenge.leader,
                leading_force: challenge.leading_force,
                last_loser: challenge.last_loser,
                last_losing_force: challenge.last_losing_force,
                deadline: challenge.deadline,
                lead_change_count: challenge.lead_change_count,
                participant_count: challenge.participant_count,
                settled: challenge.settled,
                winner: challenge.winner,
                winning_force: challenge.winning_force,
                losing_force: challenge.losing_force,
            }
        }

        fn get_challenge_participant_status(
            self: @ContractState, challenge_id: u64, operator: ContractAddress,
        ) -> ChallengeParticipantStatus {
            assert(challenge_id > 0, 'invalid challenge');
            assert(!operator.is_zero(), 'zero operator');
            let world = self.world_default();
            let challenge: Challenge = world.read_model(challenge_id);
            assert(challenge.id == challenge_id, 'challenge not found');
            let participant: ChallengeParticipant = world.read_model((challenge_id, operator));
            let additional_force = if participant
                .committed_force > participant
                .point_force_included {
                participant.committed_force - participant.point_force_included
            } else {
                0
            };
            ChallengeParticipantStatus {
                challenge_id,
                operator,
                committed_force: participant.committed_force,
                point_force_included: participant.point_force_included,
                additional_force,
                joined: participant.joined,
                resolved: participant.resolved,
                won: participant.won,
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
            let operator: OperatorState = self.world_default().read_model(operator_address);
            let delegation = delegation_state(config.staking_pool, operator_address);
            let obligations = total_obligations(operator);
            OperatorStatus {
                operator: operator_address,
                live_delegated_amount: delegation.amount,
                point_force: operator.point_force,
                challenge_force: operator.challenge_force,
                spent_force: operator.spent_force,
                available_force: available_force(delegation.amount, operator),
                generation: operator.generation,
                controlled_point_count: operator.controlled_point_count,
                active_challenge_count: operator.active_challenge_count,
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
            let mut capture_force = 0;
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
                    capture_force = point.capture_force;
                    controlled_since = point.controlled_since;
                } else {
                    stale = true;
                    needs_sync = operator.needs_sync;
                }
            }

            let mut challenge_lead_change_count = 0;
            let mut challenge_deadline = 0;
            let mut required_stake = if controller.is_zero() {
                config.minimum_stake
            } else {
                minimum_challenge_force(capture_force)
            };
            if point.active_challenge_id > 0 {
                let challenge: Challenge = world.read_model(point.active_challenge_id);
                if !challenge.settled {
                    challenge_lead_change_count = challenge.lead_change_count;
                    challenge_deadline = challenge.deadline;
                    required_stake = minimum_challenge_force(challenge.leading_force);
                }
            }

            ControlPointStatus {
                id: control_point_id,
                controller,
                capture_force,
                ownership_generation: point.ownership_generation,
                controlled_since,
                required_stake,
                active_challenge_id: point.active_challenge_id,
                challenge_lead_change_count,
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
            let mut changed = false;
            let delegation = delegation_state(staking_pool, operator_address);

            if !operator.retired && delegation.exiting {
                self.retire_state(ref operator);
                changed = true;
            } else if !operator.retired && operator.generation > 0 && delegation.amount == 0 {
                self.retire_state(ref operator);
                changed = true;
            } else if !operator.retired && delegation.amount < total_obligations(operator) {
                let previous_generation = operator.generation;
                let invalidated_force = total_obligations(operator);
                let invalidated_point_count = operator.controlled_point_count;
                self.retire_state(ref operator);
                changed = true;
                world
                    .emit_event(
                        @OperatorDisqualified {
                            operator: operator_address,
                            previous_generation,
                            new_generation: operator.generation,
                            invalidated_force,
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

        fn capture_with_synced(
            ref self: ContractState,
            config: GameConfig,
            caller: ContractAddress,
            ref operator: OperatorState,
            live_amount: u128,
            control_point_id: u32,
            allocation: u128,
            controlled_since: u64,
        ) {
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            if !point.controller.is_zero() {
                let controller = if point.controller == caller {
                    operator
                } else {
                    let (refreshed, _, _) = self
                        .refresh_operator(point.controller, config.staking_pool);
                    refreshed
                };
                let current = !controller.retired
                    && controller.generation > 0
                    && point.controller_generation == controller.generation;
                assert(!current, 'point occupied');
            }

            assert(allocation >= config.minimum_stake, 'below minimum stake');
            assert(
                allocation <= available_force(live_amount, operator),
                'insufficient available force',
            );
            operator.point_force += allocation;
            operator.controlled_point_count += 1;
            point.controller = caller;
            point.controller_generation = operator.generation;
            point.capture_force = allocation;
            point.ownership_generation += 1;
            point.controlled_since = controlled_since;
            point.active_challenge_id = 0;
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointCaptured {
                        control_point_id,
                        controller: caller,
                        capture_force: allocation,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn reinforce_with_synced(
            self: @ContractState,
            caller: ContractAddress,
            ref operator: OperatorState,
            live_amount: u128,
            control_point_id: u32,
            additional_allocation: u128,
        ) {
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            self.assert_controller(point, caller, operator);
            assert(point.active_challenge_id == 0, 'point challenged');
            assert(additional_allocation > 0, 'zero allocation');
            assert(
                additional_allocation <= available_force(live_amount, operator),
                'insufficient available force',
            );
            operator.point_force += additional_allocation;
            point.capture_force += additional_allocation;
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointReinforced {
                        control_point_id,
                        controller: caller,
                        added_force: additional_allocation,
                        capture_force: point.capture_force,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn commit_challenge_force(
            ref self: ContractState,
            control_point_id: u32,
            committed_force: u128,
            sacrificed_control_point_id: Option<u32>,
        ) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            assert(!point.controller.is_zero(), 'point neutral');

            if point.active_challenge_id == 0 {
                let (mut incumbent, _, _) = self
                    .refresh_operator(point.controller, config.staking_pool);
                self.assert_controller(point, point.controller, incumbent);
                assert(caller != point.controller, 'already controller');
                assert(committed_force > point.capture_force, 'challenge too weak');
                assert(
                    committed_force >= minimum_challenge_force(point.capture_force),
                    'challenge too weak',
                );
                let challenge_id = self.next_challenge_id();
                self
                    .sacrifice_if_requested(
                        ref operator, challenge_id, control_point_id, sacrificed_control_point_id,
                    );
                assert(
                    committed_force <= available_force(delegation.amount, operator),
                    'insufficient available force',
                );
                let deadline = get_block_timestamp() + config.challenge_period_seconds;
                let defender_force_at_risk = point.capture_force;
                incumbent.active_challenge_count += 1;
                operator.challenge_force += committed_force;
                operator.active_challenge_count += 1;
                point.active_challenge_id = challenge_id;
                let challenge = Challenge {
                    id: challenge_id,
                    control_point_id,
                    incumbent: point.controller,
                    leader: caller,
                    leader_generation: operator.generation,
                    leading_force: committed_force,
                    last_loser: point.controller,
                    last_losing_force: defender_force_at_risk,
                    deadline,
                    lead_change_count: 1,
                    participant_count: 2,
                    settled: false,
                    winner: zero_address(),
                    winning_force: 0,
                    losing_force: 0,
                    settled_at: 0,
                };
                let incumbent_position = ChallengeParticipant {
                    challenge_id,
                    operator: point.controller,
                    committed_force: defender_force_at_risk,
                    point_force_included: defender_force_at_risk,
                    operator_generation: incumbent.generation,
                    joined: true,
                    resolved: false,
                    won: false,
                };
                let challenger_position = ChallengeParticipant {
                    challenge_id,
                    operator: caller,
                    committed_force,
                    point_force_included: 0,
                    operator_generation: operator.generation,
                    joined: true,
                    resolved: false,
                    won: false,
                };
                world.write_model(@operator);
                world.write_model(@incumbent);
                world.write_model(@point);
                world.write_model(@challenge);
                world.write_model(@incumbent_position);
                world.write_model(@challenger_position);
                world
                    .emit_event(
                        @ChallengeInitiated {
                            challenge_id,
                            control_point_id,
                            incumbent: point.controller,
                            challenger: caller,
                            defender_force_at_risk,
                            committed_force,
                            deadline,
                        },
                    );
                return;
            }

            let mut challenge: Challenge = world.read_model(point.active_challenge_id);
            assert(!challenge.settled, 'challenge settled');
            assert(get_block_timestamp() < challenge.deadline, 'challenge ended');
            assert(caller != challenge.leader, 'already leading');
            assert(committed_force > challenge.leading_force, 'challenge too weak');
            assert(
                committed_force >= minimum_challenge_force(challenge.leading_force),
                'challenge too weak',
            );
            let mut participant: ChallengeParticipant = world.read_model((challenge.id, caller));
            let previous_commitment = if participant.joined {
                assert(!participant.resolved, 'position resolved');
                assert(
                    participant.operator_generation == operator.generation,
                    'position generation mismatch',
                );
                participant.committed_force
            } else {
                0
            };
            let added_force = committed_force - previous_commitment;
            self
                .sacrifice_if_requested(
                    ref operator, challenge.id, control_point_id, sacrificed_control_point_id,
                );
            assert(
                added_force <= available_force(delegation.amount, operator),
                'insufficient available force',
            );
            let previous_leader = challenge.leader;
            let previous_leading_force = challenge.leading_force;
            let deadline = get_block_timestamp() + config.challenge_period_seconds;
            operator.challenge_force += added_force;
            if !participant.joined {
                operator.active_challenge_count += 1;
                challenge.participant_count += 1;
                participant.challenge_id = challenge.id;
                participant.operator = caller;
                participant.point_force_included = 0;
                participant.operator_generation = operator.generation;
                participant.joined = true;
                participant.resolved = false;
                participant.won = false;
            }
            participant.committed_force = committed_force;
            challenge.leader = caller;
            challenge.leader_generation = operator.generation;
            challenge.leading_force = committed_force;
            challenge.last_loser = previous_leader;
            challenge.last_losing_force = previous_leading_force;
            challenge.deadline = deadline;
            challenge.lead_change_count += 1;
            world.write_model(@operator);
            world.write_model(@participant);
            world.write_model(@challenge);
            world
                .emit_event(
                    @ChallengeEscalated {
                        challenge_id: challenge.id,
                        control_point_id,
                        challenger: caller,
                        committed_force,
                        added_force,
                        previous_leader,
                        previous_leading_force,
                        deadline,
                    },
                );
        }

        fn sacrifice_if_requested(
            ref self: ContractState,
            ref operator: OperatorState,
            challenge_id: u64,
            target_control_point_id: u32,
            sacrificed_control_point_id: Option<u32>,
        ) {
            match sacrificed_control_point_id {
                Option::Some(source_id) => {
                    let config = self.active_config();
                    self.assert_control_point_id(config, source_id);
                    assert(source_id != target_control_point_id, 'target as sacrifice');
                    let mut world = self.world_default();
                    let mut source: ControlPoint = world.read_model(source_id);
                    self.assert_controller(source, operator.operator, operator);
                    assert(source.active_challenge_id == 0, 'sacrifice challenged');
                    let force = source.capture_force;
                    self.release_point(ref operator, ref source);
                    world.write_model(@source);
                    world
                        .emit_event(
                            @ControlPointSacrificed {
                                challenge_id,
                                operator: operator.operator,
                                control_point_id: source_id,
                                force,
                            },
                        );
                },
                Option::None => {},
            }
        }

        fn resolve_losing_position(
            ref self: ContractState,
            config: GameConfig,
            challenge: Challenge,
            operator_address: ContractAddress,
        ) -> u128 {
            let mut world = self.world_default();
            let mut participant: ChallengeParticipant = world
                .read_model((challenge.id, operator_address));
            if !participant.joined || participant.resolved || operator_address == challenge.winner {
                return 0;
            }

            let lost_force = participant.committed_force;
            let additional_force = lost_force - participant.point_force_included;
            let (mut operator, _, _) = self.refresh_operator(operator_address, config.staking_pool);
            if valid_challenge_operator(operator, participant.operator_generation) {
                assert(operator.challenge_force >= additional_force, 'challenge force invariant');
                assert(operator.active_challenge_count > 0, 'challenge count invariant');
                operator.challenge_force -= additional_force;
                if participant.point_force_included > 0 {
                    assert(
                        operator.point_force >= participant.point_force_included,
                        'point force invariant',
                    );
                    assert(operator.controlled_point_count > 0, 'point count invariant');
                    operator.point_force -= participant.point_force_included;
                    operator.controlled_point_count -= 1;
                }
                operator.spent_force += lost_force;
                operator.active_challenge_count -= 1;
                world.write_model(@operator);
            }
            participant.resolved = true;
            participant.won = false;
            world.write_model(@participant);
            world
                .emit_event(
                    @ChallengePositionResolved {
                        challenge_id: challenge.id,
                        operator: operator_address,
                        control_point_id: challenge.control_point_id,
                        lost_force,
                    },
                );
            lost_force
        }

        fn release_point(
            self: @ContractState, ref operator: OperatorState, ref point: ControlPoint,
        ) {
            let released_force = point.capture_force;
            assert(operator.controlled_point_count > 0, 'point count invariant');
            assert(operator.point_force >= released_force, 'point force invariant');
            operator.point_force -= released_force;
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

        fn retire_operator(ref self: ContractState, operator_address: ContractAddress) {
            assert(!operator_address.is_zero(), 'zero operator');
            let mut world = self.world_default();
            let mut operator: OperatorState = world.read_model(operator_address);
            if operator.retired {
                return;
            }
            let previous_generation = operator.generation;
            let invalidated_force = total_obligations(operator);
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
                        invalidated_force,
                        released_point_count,
                    },
                );
        }

        fn retire_state(self: @ContractState, ref operator: OperatorState) {
            operator.generation += 1;
            operator.point_force = 0;
            operator.challenge_force = 0;
            operator.spent_force = 0;
            operator.controlled_point_count = 0;
            operator.active_challenge_count = 0;
            operator.retired = true;
        }
    }

    fn valid_challenge_operator(operator: OperatorState, generation: u64) -> bool {
        !operator.retired && operator.generation == generation
    }

    fn total_obligations(operator: OperatorState) -> u128 {
        operator.point_force + operator.challenge_force + operator.spent_force
    }

    fn available_force(live_amount: u128, operator: OperatorState) -> u128 {
        if operator.retired {
            return 0;
        }
        let obligations = total_obligations(operator);
        if live_amount > obligations {
            live_amount - obligations
        } else {
            0
        }
    }

    fn minimum_challenge_force(current_force: u128) -> u128 {
        if current_force == super::MAX_U128 {
            return current_force;
        }

        let quotient = current_force / super::MINIMUM_CHALLENGE_RAISE_DIVISOR;
        let remainder = current_force % super::MINIMUM_CHALLENGE_RAISE_DIVISOR;
        let rounded_tenth = quotient + if remainder > 0 {
            1
        } else {
            0
        };
        let increment = if rounded_tenth > 0 {
            rounded_tenth
        } else {
            1
        };

        if increment > super::MAX_U128 - current_force {
            super::MAX_U128
        } else {
            current_force + increment
        }
    }

    fn clear_point(ref point: ControlPoint) {
        point.controller = zero_address();
        point.controller_generation = 0;
        point.capture_force = 0;
        point.ownership_generation += 1;
        point.controlled_since = 0;
        point.active_challenge_id = 0;
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
