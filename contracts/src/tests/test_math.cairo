#[cfg(test)]
mod tests {
    use stakewars::math::{ceil_mul_div, minimum_challenge};

    #[test]
    fn exact_ten_percent_premium() {
        assert_eq!(minimum_challenge(1_000, 1_000), 1_100);
    }

    #[test]
    fn challenge_rounds_up() {
        assert_eq!(minimum_challenge(101, 1_000), 112);
    }

    #[test]
    fn zero_power_stays_zero() {
        assert_eq!(minimum_challenge(0, 1_000), 0);
    }

    #[test]
    fn multiplication_uses_wide_intermediate() {
        let max_u128: u128 = 0xffffffffffffffffffffffffffffffff;
        assert_eq!(ceil_mul_div(max_u128, 10_000, 10_000), max_u128);
    }
}
