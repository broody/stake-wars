use stakewars::supply_drop::SupplyDropHoldStatus;
use starknet::ContractAddress;

pub const MAX_SYNC_BATCH: usize = 50;
pub const MAX_STATUS_BATCH: usize = 200;
pub const MAX_CONTROL_ACTION_BATCH: usize = 200;
const MAX_U128: u128 = 340282366920938463463374607431768211455;
const MINIMUM_TAKEOVER_RAISE_DIVISOR: u128 = 10;

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct CaptureRequest {
    pub sector_id: u32,
    pub allocation: u128,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct ReinforcementRequest {
    pub sector_id: u32,
    pub additional_allocation: u128,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct SectorStatus {
    pub id: u32,
    pub controller: ContractAddress,
    pub capture_force: u128,
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
    pub sector_force: u128,
    pub available_force: u128,
    pub generation: u64,
    pub controlled_sector_count: u32,
    pub retired: bool,
    pub exiting: bool,
    pub needs_sync: bool,
}

#[starknet::interface]
pub trait IControl<TContractState> {
    fn get_supply_drop_hold(
        self: @TContractState, operator: ContractAddress,
    ) -> SupplyDropHoldStatus;
    /// Captures a neutral Sector, or takes over an occupied one by committing at least its
    /// `required_stake`. A displaced Controller's FORCE is returned in full.
    fn capture(ref self: TContractState, sector_id: u32, allocation: u128);
    fn capture_many(ref self: TContractState, captures: Span<CaptureRequest>);
    fn reinforce(ref self: TContractState, sector_id: u32, additional_allocation: u128);
    fn reinforce_many(ref self: TContractState, reinforcements: Span<ReinforcementRequest>);
    fn release(ref self: TContractState, sector_id: u32);
    fn retire(ref self: TContractState);
    fn sync_operator(ref self: TContractState, operator: ContractAddress) -> u128;
    fn sync_operators(ref self: TContractState, operators: Span<ContractAddress>) -> u32;
    fn get_sector_status(self: @TContractState, sector_id: u32) -> SectorStatus;
    fn get_sector_statuses(self: @TContractState, sector_ids: Span<u32>) -> Array<SectorStatus>;
    fn get_operator_status(self: @TContractState, operator: ContractAddress) -> OperatorStatus;
    fn can_manage_image(
        self: @TContractState, sector_id: u32, operator: ContractAddress, ownership_generation: u64,
    ) -> bool;
    fn required_stake(self: @TContractState, sector_id: u32) -> u128;
}

#[dojo::contract]
pub mod control {
    use core::num::traits::Zero;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use stakewars::models::{
        CONFIG_ID, GameConfig, OperatorState, SUPPLY_DROP_COUNTER_ID, SUPPLY_DROP_STATUS_ACTIVE,
        SUPPLY_DROP_STATUS_DRAWING, Sector, SupplyDrop, SupplyDropCounter, SupplyDropHold,
        SupplyDropOperatorSnapshot, SupplyDropSectorSnapshot,
    };
    use stakewars::staking::{DelegationState, delegation_state};
    use stakewars::supply_drop::{SupplyDropHoldStatus, hold_status};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        CaptureRequest, IControl, MAX_CONTROL_ACTION_BATCH, MAX_STATUS_BATCH, MAX_SYNC_BATCH,
        OperatorStatus, ReinforcementRequest, SectorStatus,
    };

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct SectorCaptured {
        #[key]
        pub sector_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub capture_force: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct SectorTakenOver {
        #[key]
        pub sector_id: u32,
        #[key]
        pub controller: ContractAddress,
        #[key]
        pub previous_controller: ContractAddress,
        pub capture_force: u128,
        pub returned_force: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct SectorReinforced {
        #[key]
        pub sector_id: u32,
        #[key]
        pub controller: ContractAddress,
        pub added_force: u128,
        pub capture_force: u128,
        pub ownership_generation: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct SectorReleased {
        #[key]
        pub sector_id: u32,
        #[key]
        pub previous_controller: ContractAddress,
        pub released_force: u128,
        pub ownership_generation: u64,
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
        pub invalidated_sector_count: u32,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OperatorRetired {
        #[key]
        pub operator: ContractAddress,
        pub previous_generation: u64,
        pub new_generation: u64,
        pub invalidated_force: u128,
        pub released_sector_count: u32,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct SupplyDropHoldCleared {
        #[key]
        pub operator: ContractAddress,
        pub staking_pool: ContractAddress,
    }

    #[abi(embed_v0)]
    impl ControlImpl of IControl<ContractState> {
        fn get_supply_drop_hold(
            self: @ContractState, operator: ContractAddress,
        ) -> SupplyDropHoldStatus {
            self.initialized_config();
            hold_status(self.world_default(), operator)
        }
        fn capture(ref self: ContractState, sector_id: u32, allocation: u128) {
            let config = self.active_config();
            self.assert_sector_id(config, sector_id);
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            self
                .capture_with_synced(
                    config,
                    caller,
                    ref operator,
                    delegation.amount,
                    sector_id,
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
                self.assert_sector_id(config, *capture.sector_id);
                self
                    .capture_with_synced(
                        config,
                        caller,
                        ref operator,
                        delegation.amount,
                        *capture.sector_id,
                        *capture.allocation,
                        controlled_since,
                    );
            }
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn reinforce(ref self: ContractState, sector_id: u32, additional_allocation: u128) {
            let config = self.active_config();
            self.assert_sector_id(config, sector_id);
            let caller = get_caller_address();
            let (mut operator, delegation, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            self
                .reinforce_with_synced(
                    caller, ref operator, delegation.amount, sector_id, additional_allocation,
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
                self.assert_sector_id(config, *reinforcement.sector_id);
                self
                    .reinforce_with_synced(
                        caller,
                        ref operator,
                        delegation.amount,
                        *reinforcement.sector_id,
                        *reinforcement.additional_allocation,
                    );
            }
            let mut world = self.world_default();
            world.write_model(@operator);
        }

        fn release(ref self: ContractState, sector_id: u32) {
            let config = self.active_config();
            self.assert_sector_id(config, sector_id);
            let caller = get_caller_address();
            let (mut operator, _, _) = self.refresh_operator(caller, config.staking_pool);
            self.assert_playable(ref operator);
            let mut world = self.world_default();
            let mut sector: Sector = world.read_model(sector_id);
            self.assert_controller(sector, caller, operator);
            let released_force = sector.capture_force;
            self.snapshot_sector_at_supply_drop_expiry(sector);
            self.release_sector(ref operator, ref sector);
            world.write_model(@operator);
            world.write_model(@sector);
            world
                .emit_event(
                    @SectorReleased {
                        sector_id,
                        previous_controller: caller,
                        released_force,
                        ownership_generation: sector.ownership_generation,
                    },
                );
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

        fn get_sector_status(self: @ContractState, sector_id: u32) -> SectorStatus {
            let config = self.initialized_config();
            self.assert_sector_id(config, sector_id);
            self.sector_status(config, sector_id)
        }

        fn get_sector_statuses(self: @ContractState, sector_ids: Span<u32>) -> Array<SectorStatus> {
            assert(sector_ids.len() > 0, 'empty status batch');
            assert(sector_ids.len() <= MAX_STATUS_BATCH, 'status batch too large');
            let config = self.initialized_config();
            let mut statuses = array![];
            for sector_id in sector_ids {
                self.assert_sector_id(config, *sector_id);
                statuses.append(self.sector_status(config, *sector_id));
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
            sector_id: u32,
            operator: ContractAddress,
            ownership_generation: u64,
        ) -> bool {
            if operator.is_zero() {
                return false;
            }
            let config = self.initialized_config();
            self.assert_sector_id(config, sector_id);
            let status = self.sector_status(config, sector_id);
            status.controller == operator
                && status.ownership_generation == ownership_generation
                && !status.stale
                && !hold_status(self.world_default(), operator).held
        }

        fn required_stake(self: @ContractState, sector_id: u32) -> u128 {
            let config = self.initialized_config();
            self.assert_sector_id(config, sector_id);
            self.sector_status(config, sector_id).required_stake
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

        fn expired_supply_drop(self: @ContractState) -> Option<SupplyDrop> {
            let world = self.world_default();
            let counter: SupplyDropCounter = world.read_model(SUPPLY_DROP_COUNTER_ID);
            if counter.active_id == 0 {
                return Option::None;
            }
            let current: SupplyDrop = world.read_model(counter.active_id);
            let snapshot_open = current.status == SUPPLY_DROP_STATUS_ACTIVE
                || current.status == SUPPLY_DROP_STATUS_DRAWING;
            if snapshot_open && get_block_timestamp() >= current.ends_at {
                Option::Some(current)
            } else {
                Option::None
            }
        }

        fn snapshot_sector_at_supply_drop_expiry(self: @ContractState, sector: Sector) {
            match self.expired_supply_drop() {
                Option::Some(current) => {
                    let mut world = self.world_default();
                    let snapshot: SupplyDropSectorSnapshot = world
                        .read_model((current.id, current.draw_count, sector.id));
                    if !snapshot.initialized {
                        world
                            .write_model(
                                @SupplyDropSectorSnapshot {
                                    supply_drop_id: current.id,
                                    draw_count: current.draw_count,
                                    sector_id: sector.id,
                                    initialized: true,
                                    controller: sector.controller,
                                    controller_generation: sector.controller_generation,
                                },
                            );
                    }
                },
                Option::None => {},
            }
        }

        fn snapshot_operator_at_supply_drop_expiry(self: @ContractState, operator: OperatorState) {
            match self.expired_supply_drop() {
                Option::Some(current) => {
                    let mut world = self.world_default();
                    let snapshot: SupplyDropOperatorSnapshot = world
                        .read_model((current.id, current.draw_count, operator.operator));
                    if !snapshot.initialized {
                        world
                            .write_model(
                                @SupplyDropOperatorSnapshot {
                                    supply_drop_id: current.id,
                                    draw_count: current.draw_count,
                                    operator: operator.operator,
                                    initialized: true,
                                    generation: operator.generation,
                                    retired: operator.retired,
                                },
                            );
                    }
                },
                Option::None => {},
            }
        }

        fn assert_sector_id(self: @ContractState, config: GameConfig, id: u32) {
            assert(id < config.sector_limit, 'invalid sector');
        }

        fn assert_playable(self: @ContractState, ref operator: OperatorState) {
            assert(!operator.retired, 'operator retired');
            assert(
                !hold_status(self.world_default(), operator.operator).held,
                'stake supply drop first',
            );
            if operator.generation == 0 {
                operator.generation = 1;
            }
        }

        fn assert_controller(
            self: @ContractState,
            sector: Sector,
            operator_address: ContractAddress,
            operator: OperatorState,
        ) {
            assert(
                sector.controller == operator_address
                    && sector.controller_generation == operator.generation,
                'not controller',
            );
        }

        fn operator_status(
            self: @ContractState, config: GameConfig, operator_address: ContractAddress,
        ) -> OperatorStatus {
            let operator: OperatorState = self.world_default().read_model(operator_address);
            let delegation = delegation_state(config.staking_pool, operator_address);
            OperatorStatus {
                operator: operator_address,
                live_delegated_amount: delegation.amount,
                sector_force: operator.sector_force,
                available_force: available_force(delegation.amount, operator),
                generation: operator.generation,
                controlled_sector_count: operator.controlled_sector_count,
                retired: operator.retired,
                exiting: delegation.exiting,
                needs_sync: !operator.retired
                    && (delegation.exiting || delegation.amount < operator.sector_force),
            }
        }

        fn sector_status(self: @ContractState, config: GameConfig, sector_id: u32) -> SectorStatus {
            let world = self.world_default();
            let sector: Sector = world.read_model(sector_id);
            let mut controller = zero_address();
            let mut capture_force = 0;
            let mut controlled_since = 0;
            let mut stale = false;
            let mut needs_sync = false;
            if !sector.controller.is_zero() {
                let operator = self.operator_status(config, sector.controller);
                let current = !operator.retired
                    && sector.controller_generation == operator.generation
                    && !operator.needs_sync;
                if current {
                    controller = sector.controller;
                    capture_force = sector.capture_force;
                    controlled_since = sector.controlled_since;
                } else {
                    stale = true;
                    needs_sync = operator.needs_sync;
                }
            }

            let required_stake = if controller.is_zero() {
                config.minimum_stake
            } else {
                minimum_takeover_force(config.minimum_stake, capture_force)
            };

            SectorStatus {
                id: sector_id,
                controller,
                capture_force,
                ownership_generation: sector.ownership_generation,
                controlled_since,
                required_stake,
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
                self.snapshot_operator_at_supply_drop_expiry(operator);
                self.retire_state(ref operator);
                changed = true;
            } else if !operator.retired && operator.generation > 0 && delegation.amount == 0 {
                self.snapshot_operator_at_supply_drop_expiry(operator);
                self.retire_state(ref operator);
                changed = true;
            } else if !operator.retired && delegation.amount < operator.sector_force {
                let previous_generation = operator.generation;
                let invalidated_force = operator.sector_force;
                let invalidated_sector_count = operator.controlled_sector_count;
                self.snapshot_operator_at_supply_drop_expiry(operator);
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
                            invalidated_sector_count,
                        },
                    );
            }
            if changed {
                world.write_model(@operator);
            }
            // Do not assert here: refresh is also used by opponents and Keepers.
            let hold = hold_status(world, operator_address);
            if hold.required_stake > 0 && !hold.held {
                world
                    .write_model(
                        @SupplyDropHold {
                            operator: operator_address,
                            staking_pool: hold.staking_pool,
                            required_stake: 0,
                        },
                    );
                world
                    .emit_event(
                        @SupplyDropHoldCleared {
                            operator: operator_address, staking_pool: hold.staking_pool,
                        },
                    );
            }
            (operator, delegation, changed)
        }

        fn capture_with_synced(
            ref self: ContractState,
            config: GameConfig,
            caller: ContractAddress,
            ref operator: OperatorState,
            live_amount: u128,
            sector_id: u32,
            allocation: u128,
            controlled_since: u64,
        ) {
            let mut world = self.world_default();
            let mut sector: Sector = world.read_model(sector_id);
            // A Sector whose recorded Controller is no longer current is neutral.
            let mut incumbent: Option<OperatorState> = Option::None;
            if !sector.controller.is_zero() {
                if sector.controller == caller {
                    assert(!holds_sector(operator, sector), 'already controller');
                } else {
                    let (refreshed, _, _) = self
                        .refresh_operator(sector.controller, config.staking_pool);
                    if holds_sector(refreshed, sector) {
                        incumbent = Option::Some(refreshed);
                    }
                }
            }

            match incumbent {
                Option::Some(_) => assert(
                    allocation >= minimum_takeover_force(
                        config.minimum_stake, sector.capture_force,
                    ),
                    'takeover too weak',
                ),
                Option::None => assert(allocation >= config.minimum_stake, 'below minimum stake'),
            }
            assert(
                allocation <= available_force(live_amount, operator),
                'insufficient available force',
            );

            self.snapshot_sector_at_supply_drop_expiry(sector);
            let previous_controller = sector.controller;
            let returned_force = sector.capture_force;
            match incumbent {
                Option::Some(displaced_state) => {
                    // A takeover returns the displaced garrison to its Available Force in full.
                    let mut displaced = displaced_state;
                    free_garrison(ref displaced, returned_force);
                    world.write_model(@displaced);
                },
                Option::None => {},
            }
            operator.sector_force += allocation;
            operator.controlled_sector_count += 1;
            sector.controller = caller;
            sector.controller_generation = operator.generation;
            sector.capture_force = allocation;
            sector.ownership_generation += 1;
            sector.controlled_since = controlled_since;
            world.write_model(@sector);
            if incumbent.is_some() {
                world
                    .emit_event(
                        @SectorTakenOver {
                            sector_id,
                            controller: caller,
                            previous_controller,
                            capture_force: allocation,
                            returned_force,
                            ownership_generation: sector.ownership_generation,
                        },
                    );
            } else {
                world
                    .emit_event(
                        @SectorCaptured {
                            sector_id,
                            controller: caller,
                            capture_force: allocation,
                            ownership_generation: sector.ownership_generation,
                        },
                    );
            }
        }

        fn reinforce_with_synced(
            self: @ContractState,
            caller: ContractAddress,
            ref operator: OperatorState,
            live_amount: u128,
            sector_id: u32,
            additional_allocation: u128,
        ) {
            let mut world = self.world_default();
            let mut sector: Sector = world.read_model(sector_id);
            self.assert_controller(sector, caller, operator);
            assert(additional_allocation > 0, 'zero allocation');
            assert(
                additional_allocation <= available_force(live_amount, operator),
                'insufficient available force',
            );
            operator.sector_force += additional_allocation;
            sector.capture_force += additional_allocation;
            world.write_model(@sector);
            world
                .emit_event(
                    @SectorReinforced {
                        sector_id,
                        controller: caller,
                        added_force: additional_allocation,
                        capture_force: sector.capture_force,
                        ownership_generation: sector.ownership_generation,
                    },
                );
        }

        fn release_sector(self: @ContractState, ref operator: OperatorState, ref sector: Sector) {
            free_garrison(ref operator, sector.capture_force);
            clear_sector(ref sector);
        }

        fn retire_operator(ref self: ContractState, operator_address: ContractAddress) {
            assert(!operator_address.is_zero(), 'zero operator');
            let mut world = self.world_default();
            let mut operator: OperatorState = world.read_model(operator_address);
            if operator.retired {
                return;
            }
            self.snapshot_operator_at_supply_drop_expiry(operator);
            let previous_generation = operator.generation;
            let invalidated_force = operator.sector_force;
            let released_sector_count = operator.controlled_sector_count;
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
                        released_sector_count,
                    },
                );
        }

        fn retire_state(self: @ContractState, ref operator: OperatorState) {
            operator.generation += 1;
            operator.sector_force = 0;
            operator.controlled_sector_count = 0;
            operator.retired = true;
        }
    }

    fn free_garrison(ref operator: OperatorState, force: u128) {
        assert(operator.controlled_sector_count > 0, 'sector count invariant');
        assert(operator.sector_force >= force, 'sector force invariant');
        operator.sector_force -= force;
        operator.controlled_sector_count -= 1;
    }

    fn holds_sector(operator: OperatorState, sector: Sector) -> bool {
        !operator.retired
            && operator.generation > 0
            && sector.controller_generation == operator.generation
    }

    // Legacy open-Challenge commitments and Spent Force are deliberately ignored.
    fn available_force(live_amount: u128, operator: OperatorState) -> u128 {
        if operator.retired {
            return 0;
        }
        if live_amount > operator.sector_force {
            live_amount - operator.sector_force
        } else {
            0
        }
    }

    /// At least 10% more than the current Capture Force, rounded up to one base unit, and never
    /// below the network minimum stake.
    fn minimum_takeover_force(minimum_stake: u128, current_force: u128) -> u128 {
        let raised = if current_force == super::MAX_U128 {
            current_force
        } else {
            let quotient = current_force / super::MINIMUM_TAKEOVER_RAISE_DIVISOR;
            let remainder = current_force % super::MINIMUM_TAKEOVER_RAISE_DIVISOR;
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
        };
        if raised > minimum_stake {
            raised
        } else {
            minimum_stake
        }
    }

    fn clear_sector(ref sector: Sector) {
        sector.controller = zero_address();
        sector.controller_generation = 0;
        sector.capture_force = 0;
        sector.ownership_generation += 1;
        sector.controlled_since = 0;
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
