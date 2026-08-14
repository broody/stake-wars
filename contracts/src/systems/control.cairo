use starknet::ContractAddress;

pub const MAX_SYNC_BATCH: usize = 50;
pub const MAX_CONTROL_ACTION_BATCH: usize = 200;

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct ControlPointStatus {
    pub id: u32,
    pub controller: ContractAddress,
    pub capture_power: u128,
    pub ownership_generation: u64,
    pub controlled_since: u64,
    pub required_stake: u128,
    pub stale: bool,
    pub needs_sync: bool,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct OperatorStatus {
    pub operator: ContractAddress,
    pub live_delegated_amount: u128,
    pub registered_power: u128,
    pub generation: u64,
    pub controlled_point_count: u32,
    pub needs_sync: bool,
}

#[starknet::interface]
pub trait IControl<TContractState> {
    fn capture(ref self: TContractState, control_point_id: u32);
    fn capture_many(ref self: TContractState, control_point_ids: Span<u32>);
    fn reinforce(ref self: TContractState, control_point_id: u32);
    fn reinforce_many(ref self: TContractState, control_point_ids: Span<u32>);
    fn release(ref self: TContractState, control_point_id: u32);
    fn relinquish_all(ref self: TContractState);
    fn sync_operator(ref self: TContractState, operator: ContractAddress) -> u128;
    fn sync_operators(ref self: TContractState, operators: Span<ContractAddress>) -> u32;
    fn get_control_point_status(self: @TContractState, control_point_id: u32) -> ControlPointStatus;
    fn get_control_point_statuses(
        self: @TContractState, control_point_ids: Span<u32>,
    ) -> Array<ControlPointStatus>;
    fn get_operator_status(self: @TContractState, operator: ContractAddress) -> OperatorStatus;
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
    use stakewars::models::{CONFIG_ID, ControlPoint, GameConfig, OperatorState};
    use stakewars::staking::delegated_amount;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        ControlPointStatus, IControl, MAX_CONTROL_ACTION_BATCH, MAX_SYNC_BATCH, OperatorStatus,
    };

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointCaptured {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub previous_controller: ContractAddress,
        pub previous_power: u128,
        pub capture_power: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointDisplaced {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub previous_controller: ContractAddress,
        #[key]
        pub new_controller: ContractAddress,
        pub defeated_power: u128,
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
        pub previous_power: u128,
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
        pub previous_power: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OperatorDisqualified {
        #[key]
        pub operator: ContractAddress,
        pub previous_generation: u64,
        pub new_generation: u64,
        pub previous_registered_power: u128,
        pub live_delegated_amount: u128,
        pub invalidated_point_count: u32,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OperatorRelinquished {
        #[key]
        pub operator: ContractAddress,
        pub previous_generation: u64,
        pub new_generation: u64,
        pub previous_registered_power: u128,
        pub released_point_count: u32,
    }

    #[abi(embed_v0)]
    impl ControlImpl of IControl<ContractState> {
        fn capture(ref self: ContractState, control_point_id: u32) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);

            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);
            if operator.generation == 0 {
                operator.generation = 1;
            }
            self.capture_with_synced(config, caller, ref operator, live_amount, control_point_id);
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn capture_many(ref self: ContractState, control_point_ids: Span<u32>) {
            assert(control_point_ids.len() > 0, 'empty capture batch');
            assert(control_point_ids.len() <= MAX_CONTROL_ACTION_BATCH, 'capture batch too large');

            let config = self.active_config();
            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);
            if operator.generation == 0 {
                operator.generation = 1;
            }

            for control_point_id in control_point_ids {
                self.assert_control_point_id(config, *control_point_id);
                self
                    .capture_with_synced(
                        config, caller, ref operator, live_amount, *control_point_id,
                    );
            }

            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn reinforce(ref self: ContractState, control_point_id: u32) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);

            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);
            self.reinforce_with_synced(caller, ref operator, live_amount, control_point_id);
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn reinforce_many(ref self: ContractState, control_point_ids: Span<u32>) {
            assert(control_point_ids.len() > 0, 'empty reinforce batch');
            assert(
                control_point_ids.len() <= MAX_CONTROL_ACTION_BATCH, 'reinforce batch too large',
            );

            let config = self.active_config();
            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);

            for control_point_id in control_point_ids {
                self.assert_control_point_id(config, *control_point_id);
                self.reinforce_with_synced(caller, ref operator, live_amount, *control_point_id);
            }

            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn release(ref self: ContractState, control_point_id: u32) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);

            let caller = get_caller_address();
            let (mut operator, _, _) = self.refresh_operator(caller, config.staking_pool);
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            assert(
                point.controller == caller && point.controller_generation == operator.generation,
                'not controller',
            );
            assert(operator.controlled_point_count > 0, 'point count invariant');

            let previous_power = point.capture_power;
            operator.controlled_point_count -= 1;
            if operator.controlled_point_count == 0 {
                operator.registered_power = 0;
            }
            clear_point(ref point);

            world.write_model(@operator);
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointReleased {
                        control_point_id,
                        previous_controller: caller,
                        previous_power,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn relinquish_all(ref self: ContractState) {
            // This exit path deliberately remains available while gameplay is paused.
            self.initialized_config();

            let caller = get_caller_address();
            let mut world = self.world_default();
            let mut operator: OperatorState = world.read_model(caller);

            if operator.registered_power == 0 && operator.controlled_point_count == 0 {
                return;
            }

            assert(operator.generation > 0, 'invalid generation');
            let previous_generation = operator.generation;
            let previous_registered_power = operator.registered_power;
            let released_point_count = operator.controlled_point_count;

            operator.generation += 1;
            operator.registered_power = 0;
            operator.controlled_point_count = 0;
            world.write_model(@operator);
            world
                .emit_event(
                    @OperatorRelinquished {
                        operator: caller,
                        previous_generation,
                        new_generation: operator.generation,
                        previous_registered_power,
                        released_point_count,
                    },
                );
        }

        fn sync_operator(ref self: ContractState, operator: ContractAddress) -> u128 {
            assert(!operator.is_zero(), 'zero operator');
            let config = self.initialized_config();
            let (_, live_amount, _) = self.refresh_operator(operator, config.staking_pool);
            live_amount
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
            assert(control_point_ids.len() <= MAX_CONTROL_ACTION_BATCH, 'status batch too large');
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

        fn operator_status(
            self: @ContractState, config: GameConfig, operator_address: ContractAddress,
        ) -> OperatorStatus {
            let world = self.world_default();
            let operator: OperatorState = world.read_model(operator_address);
            let live_amount = delegated_amount(config.staking_pool, operator_address);
            let needs_sync = operator.controlled_point_count > 0
                && live_amount < operator.registered_power;

            OperatorStatus {
                operator: operator_address,
                live_delegated_amount: live_amount,
                registered_power: operator.registered_power,
                generation: operator.generation,
                controlled_point_count: operator.controlled_point_count,
                needs_sync,
            }
        }

        fn control_point_status(
            self: @ContractState, config: GameConfig, control_point_id: u32,
        ) -> ControlPointStatus {
            let world = self.world_default();
            let point: ControlPoint = world.read_model(control_point_id);

            if point.controller.is_zero() {
                return ControlPointStatus {
                    id: control_point_id,
                    controller: zero_address(),
                    capture_power: 0,
                    ownership_generation: point.ownership_generation,
                    controlled_since: 0,
                    required_stake: config.minimum_stake,
                    stale: false,
                    needs_sync: false,
                };
            }

            let operator = self.operator_status(config, point.controller);
            let generation_matches = operator.generation > 0
                && point.controller_generation == operator.generation;
            let current = generation_matches && !operator.needs_sync;

            ControlPointStatus {
                id: control_point_id,
                controller: if current {
                    point.controller
                } else {
                    zero_address()
                },
                capture_power: if current {
                    point.capture_power
                } else {
                    0
                },
                ownership_generation: point.ownership_generation,
                controlled_since: if current {
                    point.controlled_since
                } else {
                    0
                },
                required_stake: if current {
                    minimum_challenge(point.capture_power, config.challenge_premium_bps)
                } else {
                    config.minimum_stake
                },
                stale: !current,
                needs_sync: generation_matches && operator.needs_sync,
            }
        }

        fn refresh_operator(
            ref self: ContractState,
            operator_address: ContractAddress,
            staking_pool: ContractAddress,
        ) -> (OperatorState, u128, bool) {
            assert(!operator_address.is_zero(), 'zero operator');
            let live_amount = delegated_amount(staking_pool, operator_address);
            let mut world = self.world_default();
            let mut operator: OperatorState = world.read_model(operator_address);
            let mut changed = false;

            if operator.controlled_point_count > 0 && live_amount < operator.registered_power {
                let previous_generation = operator.generation;
                let previous_registered_power = operator.registered_power;
                let invalidated_point_count = operator.controlled_point_count;
                operator.generation += 1;
                operator.registered_power = 0;
                operator.controlled_point_count = 0;
                changed = true;
                world
                    .emit_event(
                        @OperatorDisqualified {
                            operator: operator_address,
                            previous_generation,
                            new_generation: operator.generation,
                            previous_registered_power,
                            live_delegated_amount: live_amount,
                            invalidated_point_count,
                        },
                    );
            }

            if changed {
                world.write_model(@operator);
            }
            (operator, live_amount, changed)
        }

        fn capture_with_synced(
            ref self: ContractState,
            config: GameConfig,
            caller: ContractAddress,
            ref operator: OperatorState,
            live_amount: u128,
            control_point_id: u32,
        ) {
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            let mut previous_controller = zero_address();
            let mut previous_power = 0;

            if !point.controller.is_zero() {
                let current_controller = point.controller;
                let current_operator = if current_controller == caller {
                    operator
                } else {
                    let (refreshed, _, _) = self
                        .refresh_operator(current_controller, config.staking_pool);
                    refreshed
                };

                if current_operator.generation > 0
                    && point.controller_generation == current_operator.generation {
                    assert(current_controller != caller, 'already controller');
                    let required = minimum_challenge(
                        point.capture_power, config.challenge_premium_bps,
                    );
                    assert(live_amount >= required, 'insufficient challenge');
                    assert(current_operator.controlled_point_count > 0, 'point count invariant');

                    let mut displaced = current_operator;
                    displaced.controlled_point_count -= 1;
                    if displaced.controlled_point_count == 0 {
                        displaced.registered_power = 0;
                    }
                    previous_controller = current_controller;
                    previous_power = point.capture_power;
                    let mut world = self.world_default();
                    world.write_model(@displaced);
                } else {
                    assert(live_amount >= config.minimum_stake, 'below minimum stake');
                }
            } else {
                assert(live_amount >= config.minimum_stake, 'below minimum stake');
            }

            operator.registered_power = live_amount;
            operator.controlled_point_count += 1;

            point.controller = caller;
            point.controller_generation = operator.generation;
            point.capture_power = live_amount;
            point.ownership_generation += 1;
            point.controlled_since = get_block_timestamp();

            let mut world = self.world_default();
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointCaptured {
                        control_point_id,
                        controller: caller,
                        previous_controller,
                        previous_power,
                        capture_power: live_amount,
                        ownership_generation: point.ownership_generation,
                    },
                );
            if !previous_controller.is_zero() {
                let mut world = self.world_default();
                world
                    .emit_event(
                        @ControlPointDisplaced {
                            control_point_id,
                            previous_controller,
                            new_controller: caller,
                            defeated_power: previous_power,
                            capture_power: live_amount,
                            ownership_generation: point.ownership_generation,
                        },
                    );
            }
        }

        fn reinforce_with_synced(
            ref self: ContractState,
            caller: ContractAddress,
            ref operator: OperatorState,
            live_amount: u128,
            control_point_id: u32,
        ) {
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            assert(
                point.controller == caller && point.controller_generation == operator.generation,
                'not controller',
            );
            assert(live_amount > point.capture_power, 'power not increased');

            let previous_power = point.capture_power;
            operator.registered_power = live_amount;
            point.capture_power = live_amount;
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointReinforced {
                        control_point_id,
                        controller: caller,
                        previous_power,
                        capture_power: live_amount,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }
    }

    fn clear_point(ref point: ControlPoint) {
        point.controller = zero_address();
        point.controller_generation = 0;
        point.capture_power = 0;
        point.ownership_generation += 1;
        point.controlled_since = 0;
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
