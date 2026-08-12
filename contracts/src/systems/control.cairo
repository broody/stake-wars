use starknet::ContractAddress;

pub const MAX_SYNC_BATCH: usize = 50;
pub const MAX_CONTROL_ACTION_BATCH: usize = 20;

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
    pub allocated_stake: u128,
    pub ownership_generation: u64,
    pub required_stake: u128,
    pub stale: bool,
    pub needs_sync: bool,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct OperatorStatus {
    pub operator: ContractAddress,
    pub live_delegated_amount: u128,
    pub total_allocated: u128,
    pub available_stake: u128,
    pub generation: u64,
    pub controlled_point_count: u32,
    pub needs_sync: bool,
}

#[starknet::interface]
pub trait IControl<TContractState> {
    fn capture(ref self: TContractState, control_point_id: u32, allocation: u128);
    fn capture_many(ref self: TContractState, captures: Span<CaptureRequest>);
    fn reinforce(ref self: TContractState, control_point_id: u32, additional_allocation: u128);
    fn reinforce_many(ref self: TContractState, reinforcements: Span<ReinforcementRequest>);
    fn release(ref self: TContractState, control_point_id: u32);
    fn redeploy(
        ref self: TContractState,
        from_control_point_id: u32,
        to_control_point_id: u32,
        new_allocation: u128,
    );
    fn sync_operator(ref self: TContractState, operator: ContractAddress) -> u128;
    fn sync_operators(ref self: TContractState, operators: Span<ContractAddress>) -> u32;
    fn get_control_point_status(self: @TContractState, control_point_id: u32) -> ControlPointStatus;
    fn get_operator_status(self: @TContractState, operator: ContractAddress) -> OperatorStatus;
    fn can_manage_image(
        self: @TContractState,
        control_point_id: u32,
        operator: ContractAddress,
        ownership_generation: u64,
    ) -> bool;
    fn required_stake(self: @TContractState, control_point_id: u32) -> u128;
    fn available_stake(self: @TContractState, operator: ContractAddress) -> u128;
}

#[dojo::contract]
pub mod control {
    use core::num::traits::Zero;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use stakewars::math::minimum_challenge;
    use stakewars::models::{CONFIG_ID, ControlPoint, GameConfig, OperatorState};
    use stakewars::staking::delegated_amount;
    use starknet::{ContractAddress, get_caller_address};
    use super::{
        CaptureRequest, ControlPointStatus, IControl, MAX_CONTROL_ACTION_BATCH, MAX_SYNC_BATCH,
        OperatorStatus, ReinforcementRequest,
    };

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointCaptured {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub previous_controller: ContractAddress,
        pub previous_allocation: u128,
        pub allocation: u128,
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
        pub released_allocation: u128,
        pub new_allocation: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointReinforced {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub previous_allocation: u128,
        pub allocation: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointReleased {
        #[key]
        pub control_point_id: u32,
        #[key]
        pub previous_controller: ContractAddress,
        pub released_allocation: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ControlPointRedeployed {
        #[key]
        pub operator: ContractAddress,
        #[key]
        pub from_control_point_id: u32,
        #[key]
        pub to_control_point_id: u32,
        pub released_allocation: u128,
        pub new_allocation: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OperatorDisqualified {
        #[key]
        pub operator: ContractAddress,
        pub previous_generation: u64,
        pub new_generation: u64,
        pub previous_allocation: u128,
        pub live_delegated_amount: u128,
        pub invalidated_point_count: u32,
    }

    #[abi(embed_v0)]
    impl ControlImpl of IControl<ContractState> {
        fn capture(ref self: ContractState, control_point_id: u32, allocation: u128) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            assert(allocation > 0, 'zero allocation');

            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);
            if operator.generation == 0 {
                operator.generation = 1;
            }
            self
                .capture_with_synced(
                    config, caller, ref operator, live_amount, control_point_id, allocation,
                );
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn capture_many(ref self: ContractState, captures: Span<CaptureRequest>) {
            assert(captures.len() > 0, 'empty capture batch');
            assert(captures.len() <= MAX_CONTROL_ACTION_BATCH, 'capture batch too large');

            let config = self.active_config();
            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);
            if operator.generation == 0 {
                operator.generation = 1;
            }

            for capture in captures {
                self.assert_control_point_id(config, *capture.control_point_id);
                assert(*capture.allocation > 0, 'zero allocation');
                self
                    .capture_with_synced(
                        config,
                        caller,
                        ref operator,
                        live_amount,
                        *capture.control_point_id,
                        *capture.allocation,
                    );
            }

            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn reinforce(ref self: ContractState, control_point_id: u32, additional_allocation: u128) {
            let config = self.active_config();
            self.assert_control_point_id(config, control_point_id);
            assert(additional_allocation > 0, 'zero allocation');

            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);
            self
                .reinforce_with_synced(
                    caller, ref operator, live_amount, control_point_id, additional_allocation,
                );
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn reinforce_many(ref self: ContractState, reinforcements: Span<ReinforcementRequest>) {
            assert(reinforcements.len() > 0, 'empty reinforce batch');
            assert(reinforcements.len() <= MAX_CONTROL_ACTION_BATCH, 'reinforce batch too large');

            let config = self.active_config();
            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);

            for reinforcement in reinforcements {
                self.assert_control_point_id(config, *reinforcement.control_point_id);
                assert(*reinforcement.additional_allocation > 0, 'zero allocation');
                self
                    .reinforce_with_synced(
                        caller,
                        ref operator,
                        live_amount,
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
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            assert(
                point.controller == caller && point.controller_generation == operator.generation,
                'not controller',
            );

            let released_allocation = point.allocated_stake;
            assert(operator.total_allocated >= released_allocation, 'allocation invariant');
            assert(operator.controlled_point_count > 0, 'point count invariant');
            operator.total_allocated -= released_allocation;
            operator.controlled_point_count -= 1;
            clear_point(ref point);

            world.write_model(@operator);
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointReleased {
                        control_point_id,
                        previous_controller: caller,
                        released_allocation,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }

        fn redeploy(
            ref self: ContractState,
            from_control_point_id: u32,
            to_control_point_id: u32,
            new_allocation: u128,
        ) {
            let config = self.active_config();
            self.assert_control_point_id(config, from_control_point_id);
            self.assert_control_point_id(config, to_control_point_id);
            assert(from_control_point_id != to_control_point_id, 'same control point');
            assert(new_allocation > 0, 'zero allocation');

            let caller = get_caller_address();
            let (mut operator, live_amount, _) = self.refresh_operator(caller, config.staking_pool);
            let mut world = self.world_default();
            let mut source: ControlPoint = world.read_model(from_control_point_id);
            assert(
                source.controller == caller && source.controller_generation == operator.generation,
                'not source controller',
            );

            let released_allocation = source.allocated_stake;
            assert(operator.total_allocated >= released_allocation, 'allocation invariant');
            assert(operator.controlled_point_count > 0, 'point count invariant');
            operator.total_allocated -= released_allocation;
            operator.controlled_point_count -= 1;
            clear_point(ref source);
            world.write_model(@operator);
            world.write_model(@source);

            self
                .capture_with_synced(
                    config, caller, ref operator, live_amount, to_control_point_id, new_allocation,
                );
            let mut world = self.world_default();
            world.write_model(@operator);
            world
                .emit_event(
                    @ControlPointRedeployed {
                        operator: caller,
                        from_control_point_id,
                        to_control_point_id,
                        released_allocation,
                        new_allocation,
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

        fn available_stake(self: @ContractState, operator: ContractAddress) -> u128 {
            assert(!operator.is_zero(), 'zero operator');
            let config = self.initialized_config();
            self.operator_status(config, operator).available_stake
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
            let needs_sync = live_amount < operator.total_allocated;
            let effective_allocation = if needs_sync {
                0
            } else {
                operator.total_allocated
            };

            OperatorStatus {
                operator: operator_address,
                live_delegated_amount: live_amount,
                total_allocated: operator.total_allocated,
                available_stake: live_amount - effective_allocation,
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
                    allocated_stake: 0,
                    ownership_generation: point.ownership_generation,
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
                allocated_stake: if current {
                    point.allocated_stake
                } else {
                    0
                },
                ownership_generation: point.ownership_generation,
                required_stake: if current {
                    minimum_challenge(point.allocated_stake, config.challenge_premium_bps)
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

            if live_amount < operator.total_allocated {
                let previous_generation = operator.generation;
                let previous_allocation = operator.total_allocated;
                let invalidated_point_count = operator.controlled_point_count;
                operator.generation += 1;
                operator.total_allocated = 0;
                operator.controlled_point_count = 0;
                changed = true;
                world
                    .emit_event(
                        @OperatorDisqualified {
                            operator: operator_address,
                            previous_generation,
                            new_generation: operator.generation,
                            previous_allocation,
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
            allocation: u128,
        ) {
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            let mut previous_controller = zero_address();
            let mut previous_allocation = 0;

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
                        point.allocated_stake, config.challenge_premium_bps,
                    );
                    assert(allocation >= required, 'insufficient challenge');
                    assert(
                        current_operator.total_allocated >= point.allocated_stake,
                        'allocation invariant',
                    );
                    assert(current_operator.controlled_point_count > 0, 'point count invariant');

                    let mut displaced = current_operator;
                    displaced.total_allocated -= point.allocated_stake;
                    displaced.controlled_point_count -= 1;
                    previous_controller = current_controller;
                    previous_allocation = point.allocated_stake;
                    let mut world = self.world_default();
                    world.write_model(@displaced);
                } else {
                    assert(allocation >= config.minimum_stake, 'below minimum stake');
                }
            } else {
                assert(allocation >= config.minimum_stake, 'below minimum stake');
            }

            let new_total = operator.total_allocated + allocation;
            assert(new_total <= live_amount, 'allocation exceeds stake');
            operator.total_allocated = new_total;
            operator.controlled_point_count += 1;

            point.controller = caller;
            point.controller_generation = operator.generation;
            point.allocated_stake = allocation;
            point.ownership_generation += 1;

            let mut world = self.world_default();
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointCaptured {
                        control_point_id,
                        controller: caller,
                        previous_controller,
                        previous_allocation,
                        allocation,
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
                            released_allocation: previous_allocation,
                            new_allocation: allocation,
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
            additional_allocation: u128,
        ) {
            let mut world = self.world_default();
            let mut point: ControlPoint = world.read_model(control_point_id);
            assert(
                point.controller == caller && point.controller_generation == operator.generation,
                'not controller',
            );

            let previous_allocation = point.allocated_stake;
            let new_total = operator.total_allocated + additional_allocation;
            assert(new_total <= live_amount, 'allocation exceeds stake');

            operator.total_allocated = new_total;
            point.allocated_stake += additional_allocation;
            world.write_model(@point);
            world
                .emit_event(
                    @ControlPointReinforced {
                        control_point_id,
                        controller: caller,
                        previous_allocation,
                        allocation: point.allocated_stake,
                        ownership_generation: point.ownership_generation,
                    },
                );
        }
    }

    fn clear_point(ref point: ControlPoint) {
        point.controller = zero_address();
        point.controller_generation = 0;
        point.allocated_stake = 0;
        point.ownership_generation += 1;
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
