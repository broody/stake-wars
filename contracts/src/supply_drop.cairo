use dojo::model::ModelStorage;
use dojo::world::WorldStorage;
use stakewars::models::SupplyDropHold;
use stakewars::staking::delegation_state;
use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct SupplyDropHoldStatus {
    pub staking_pool: ContractAddress,
    pub required_stake: u128,
    pub live_stake: u128,
    pub remaining_stake: u128,
    pub exiting: bool,
    pub held: bool,
}

pub fn hold_status(world: WorldStorage, operator: ContractAddress) -> SupplyDropHoldStatus {
    let hold: SupplyDropHold = world.read_model(operator);
    if hold.required_stake == 0 {
        return SupplyDropHoldStatus {
            staking_pool: hold.staking_pool,
            required_stake: 0,
            live_stake: 0,
            remaining_stake: 0,
            exiting: false,
            held: false,
        };
    }
    // Always read the pool that was fixed at claim time, even after a config change.
    let delegation = delegation_state(hold.staking_pool, operator);
    let remaining_stake = if delegation.amount < hold.required_stake {
        hold.required_stake - delegation.amount
    } else {
        0
    };
    SupplyDropHoldStatus {
        staking_pool: hold.staking_pool,
        required_stake: hold.required_stake,
        live_stake: delegation.amount,
        remaining_stake,
        exiting: delegation.exiting,
        held: remaining_stake > 0 || delegation.exiting,
    }
}
