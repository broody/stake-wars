pub const BASIS_POINTS_DENOMINATOR: u128 = 10_000;

pub fn minimum_challenge(current_power: u128, premium_bps: u16) -> u128 {
    let multiplier = BASIS_POINTS_DENOMINATOR + premium_bps.into();
    ceil_mul_div(current_power, multiplier, BASIS_POINTS_DENOMINATOR)
}

pub fn ceil_mul_div(value: u128, multiplier: u128, denominator: u128) -> u128 {
    assert(denominator > 0, 'zero denominator');

    if value == 0 || multiplier == 0 {
        return 0;
    }

    let numerator: u256 = value.into() * multiplier.into();
    let rounded: u256 = numerator + (denominator - 1).into();
    let result: u256 = rounded / denominator.into();
    result.try_into().expect('result overflow')
}
