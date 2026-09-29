use stakewars::models::{BeaconAuction, BeaconConfig};
use starknet::ContractAddress;

pub const BPS_DENOMINATOR: u16 = 10_000;

/// Current round and the exact amount the next bid must reach. A world without
/// Beacon configuration reports `initialized: false` instead of panicking.
#[derive(Copy, Drop, Serde, Debug)]
pub struct BeaconStatus {
    pub initialized: bool,
    pub first_round_id: u64,
    pub auction: BeaconAuction,
    pub minimum_bid: u128,
}

#[starknet::interface]
pub trait IBeacon<TContractState> {
    fn initialize_beacon(
        ref self: TContractState,
        payment_token: ContractAddress,
        proceeds_recipient: ContractAddress,
        reserve_price: u128,
        min_raise_bps: u16,
        bidding_duration_seconds: u64,
        extension_seconds: u64,
        first_round_id: u64,
    );
    fn set_beacon_rules(
        ref self: TContractState,
        proceeds_recipient: ContractAddress,
        reserve_price: u128,
        min_raise_bps: u16,
        bidding_duration_seconds: u64,
        extension_seconds: u64,
    );
    fn place_beacon_bid(ref self: TContractState, round_id: u64, amount: u128);
    fn settle_beacon_auction(ref self: TContractState, round_id: u64);
    fn get_beacon_config(self: @TContractState) -> BeaconConfig;
    fn get_beacon_status(self: @TContractState) -> BeaconStatus;
    fn get_beacon_auction(self: @TContractState, round_id: u64) -> BeaconAuction;
}

#[dojo::contract]
pub mod beacon {
    use core::num::traits::Zero;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use stakewars::assets::{IERC20AssetDispatcher, IERC20AssetDispatcherTrait};
    use stakewars::models::{
        BEACON_CONFIG_ID, BEACON_COUNTER_ID, BEACON_STATUS_BIDDING, BEACON_STATUS_PENDING,
        BEACON_STATUS_SETTLED, BeaconAuction, BeaconConfig, BeaconCounter, CONFIG_ID, GameConfig,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use super::{BPS_DENOMINATOR, BeaconStatus, IBeacon};

    const MAX_U128: u128 = 0xffffffffffffffffffffffffffffffff;

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct BeaconRulesChanged {
        #[key]
        pub admin: ContractAddress,
        pub payment_token: ContractAddress,
        pub proceeds_recipient: ContractAddress,
        pub reserve_price: u128,
        pub min_raise_bps: u16,
        pub bidding_duration_seconds: u64,
        pub extension_seconds: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct BeaconAuctionOpened {
        #[key]
        pub round_id: u64,
        pub payment_token: ContractAddress,
        pub reserve_price: u128,
        pub min_raise_bps: u16,
        pub bidding_duration_seconds: u64,
        pub extension_seconds: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct BeaconBidPlaced {
        #[key]
        pub round_id: u64,
        #[key]
        pub bidder: ContractAddress,
        pub amount: u128,
        pub previous_leader: ContractAddress,
        pub previous_bid: u128,
        pub ends_at: u64,
        pub bid_count: u32,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct BeaconAuctionSettled {
        #[key]
        pub round_id: u64,
        #[key]
        pub winner: ContractAddress,
        pub winning_bid: u128,
        pub bid_count: u32,
        pub proceeds_recipient: ContractAddress,
        pub settled_at: u64,
    }

    #[abi(embed_v0)]
    impl BeaconImpl of IBeacon<ContractState> {
        fn initialize_beacon(
            ref self: ContractState,
            payment_token: ContractAddress,
            proceeds_recipient: ContractAddress,
            reserve_price: u128,
            min_raise_bps: u16,
            bidding_duration_seconds: u64,
            extension_seconds: u64,
            first_round_id: u64,
        ) {
            let mut world = self.world_default();
            let admin = self.assert_admin();
            let existing: BeaconConfig = world.read_model(BEACON_CONFIG_ID);
            assert(!existing.initialized, 'beacon already initialized');
            assert(!payment_token.is_zero(), 'zero payment token');
            assert(first_round_id > 0, 'zero first round');
            validate_rules(
                proceeds_recipient,
                reserve_price,
                min_raise_bps,
                bidding_duration_seconds,
                extension_seconds,
            );

            let config = BeaconConfig {
                id: BEACON_CONFIG_ID,
                initialized: true,
                payment_token,
                proceeds_recipient,
                reserve_price,
                min_raise_bps,
                bidding_duration_seconds,
                extension_seconds,
                first_round_id,
            };
            world.write_model(@config);
            world.emit_event(@rules_changed(admin, config));
            self.open_round(config, first_round_id);
        }

        fn set_beacon_rules(
            ref self: ContractState,
            proceeds_recipient: ContractAddress,
            reserve_price: u128,
            min_raise_bps: u16,
            bidding_duration_seconds: u64,
            extension_seconds: u64,
        ) {
            let mut world = self.world_default();
            let admin = self.assert_admin();
            let mut config = self.require_config();
            validate_rules(
                proceeds_recipient,
                reserve_price,
                min_raise_bps,
                bidding_duration_seconds,
                extension_seconds,
            );
            config.proceeds_recipient = proceeds_recipient;
            config.reserve_price = reserve_price;
            config.min_raise_bps = min_raise_bps;
            config.bidding_duration_seconds = bidding_duration_seconds;
            config.extension_seconds = extension_seconds;
            world.write_model(@config);
            world.emit_event(@rules_changed(admin, config));

            // A round without bids has promised nothing yet, so it follows the new rules.
            // Once bidding starts, the round keeps the rules its bidders accepted.
            let counter: BeaconCounter = world.read_model(BEACON_COUNTER_ID);
            let mut current: BeaconAuction = world.read_model(counter.current_round_id);
            if current.status == BEACON_STATUS_PENDING {
                current.proceeds_recipient = config.proceeds_recipient;
                current.reserve_price = config.reserve_price;
                current.min_raise_bps = config.min_raise_bps;
                current.bidding_duration_seconds = config.bidding_duration_seconds;
                current.extension_seconds = config.extension_seconds;
                world.write_model(@current);
            }
        }

        fn place_beacon_bid(ref self: ContractState, round_id: u64, amount: u128) {
            let mut world = self.world_default();
            let game: GameConfig = world.read_model(CONFIG_ID);
            assert(game.initialized, 'not initialized');
            assert(!game.paused, 'game paused');
            let mut auction = self.require_current_auction(round_id);
            let bidder = get_caller_address();
            let now = get_block_timestamp();
            let previous_leader = auction.leader;
            let previous_bid = auction.leading_bid;

            assert(amount >= minimum_bid(auction), 'bid too low');
            if auction.status == BEACON_STATUS_PENDING {
                // The first qualifying bid starts the clock.
                auction.status = BEACON_STATUS_BIDDING;
                auction.started_at = now;
                auction.ends_at = now + auction.bidding_duration_seconds;
            } else {
                assert(auction.status == BEACON_STATUS_BIDDING, 'auction not open');
                assert(now < auction.ends_at, 'auction ended');
                assert(bidder != previous_leader, 'already leading');
                assert(amount > previous_bid, 'bid too low');
                // A late bid keeps the auction open long enough for a response.
                let response_deadline = now + auction.extension_seconds;
                if response_deadline > auction.ends_at {
                    auction.ends_at = response_deadline;
                }
            }
            auction.leader = bidder;
            auction.leading_bid = amount;
            auction.bid_count += 1;
            world.write_model(@auction);
            world
                .emit_event(
                    @BeaconBidPlaced {
                        round_id,
                        bidder,
                        amount,
                        previous_leader,
                        previous_bid,
                        ends_at: auction.ends_at,
                        bid_count: auction.bid_count,
                    },
                );

            self.pull_bid(auction.payment_token, bidder, amount);
            if previous_bid > 0 {
                self.push_payment(auction.payment_token, previous_leader, previous_bid);
            }
        }

        fn settle_beacon_auction(ref self: ContractState, round_id: u64) {
            // Settlement remains available while gameplay is paused.
            let mut world = self.world_default();
            let mut auction = self.require_current_auction(round_id);
            assert(auction.status == BEACON_STATUS_BIDDING, 'auction not started');
            let settled_at = get_block_timestamp();
            assert(settled_at >= auction.ends_at, 'auction active');

            auction.status = BEACON_STATUS_SETTLED;
            auction.settled_at = settled_at;
            world.write_model(@auction);
            world
                .emit_event(
                    @BeaconAuctionSettled {
                        round_id,
                        winner: auction.leader,
                        winning_bid: auction.leading_bid,
                        bid_count: auction.bid_count,
                        proceeds_recipient: auction.proceeds_recipient,
                        settled_at,
                    },
                );
            let config = self.require_config();
            self.open_round(config, round_id + 1);
            self
                .push_payment(
                    auction.payment_token, auction.proceeds_recipient, auction.leading_bid,
                );
        }

        fn get_beacon_config(self: @ContractState) -> BeaconConfig {
            self.world_default().read_model(BEACON_CONFIG_ID)
        }

        fn get_beacon_status(self: @ContractState) -> BeaconStatus {
            let world = self.world_default();
            let config: BeaconConfig = world.read_model(BEACON_CONFIG_ID);
            let counter: BeaconCounter = world.read_model(BEACON_COUNTER_ID);
            let auction: BeaconAuction = world.read_model(counter.current_round_id);
            if !config.initialized {
                return BeaconStatus {
                    initialized: false, first_round_id: 0, auction, minimum_bid: 0,
                };
            }
            BeaconStatus {
                initialized: true,
                first_round_id: config.first_round_id,
                auction,
                minimum_bid: minimum_bid(auction),
            }
        }

        fn get_beacon_auction(self: @ContractState, round_id: u64) -> BeaconAuction {
            let auction: BeaconAuction = self.world_default().read_model(round_id);
            assert(auction.status != 0, 'beacon round not found');
            auction
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"stakewars")
        }

        fn assert_admin(self: @ContractState) -> ContractAddress {
            let game: GameConfig = self.world_default().read_model(CONFIG_ID);
            let caller = get_caller_address();
            assert(game.initialized, 'not initialized');
            assert(game.admin == caller, 'not admin');
            caller
        }

        fn require_config(self: @ContractState) -> BeaconConfig {
            let config: BeaconConfig = self.world_default().read_model(BEACON_CONFIG_ID);
            assert(config.initialized, 'beacon not initialized');
            config
        }

        fn require_current_auction(self: @ContractState, round_id: u64) -> BeaconAuction {
            self.require_config();
            let world = self.world_default();
            let counter: BeaconCounter = world.read_model(BEACON_COUNTER_ID);
            assert(counter.current_round_id == round_id, 'not current beacon round');
            let auction: BeaconAuction = world.read_model(round_id);
            assert(auction.status != 0, 'beacon round not found');
            auction
        }

        fn open_round(ref self: ContractState, config: BeaconConfig, round_id: u64) {
            let mut world = self.world_default();
            world
                .write_model(
                    @BeaconAuction {
                        round_id,
                        status: BEACON_STATUS_PENDING,
                        payment_token: config.payment_token,
                        proceeds_recipient: config.proceeds_recipient,
                        reserve_price: config.reserve_price,
                        min_raise_bps: config.min_raise_bps,
                        bidding_duration_seconds: config.bidding_duration_seconds,
                        extension_seconds: config.extension_seconds,
                        started_at: 0,
                        ends_at: 0,
                        leader: Zero::zero(),
                        leading_bid: 0,
                        bid_count: 0,
                        settled_at: 0,
                    },
                );
            world.write_model(@BeaconCounter { id: BEACON_COUNTER_ID, current_round_id: round_id });
            world
                .emit_event(
                    @BeaconAuctionOpened {
                        round_id,
                        payment_token: config.payment_token,
                        reserve_price: config.reserve_price,
                        min_raise_bps: config.min_raise_bps,
                        bidding_duration_seconds: config.bidding_duration_seconds,
                        extension_seconds: config.extension_seconds,
                    },
                );
        }

        fn pull_bid(
            ref self: ContractState, token: ContractAddress, bidder: ContractAddress, amount: u128,
        ) {
            let escrow = get_contract_address();
            let token = IERC20AssetDispatcher { contract_address: token };
            let amount: u256 = amount.into();
            let before = token.balance_of(escrow);
            assert(token.transfer_from(bidder, escrow, amount), 'bid transfer failed');
            assert(token.balance_of(escrow) == before + amount, 'bid amount mismatch');
        }

        fn push_payment(
            ref self: ContractState,
            token: ContractAddress,
            recipient: ContractAddress,
            amount: u128,
        ) {
            let token = IERC20AssetDispatcher { contract_address: token };
            let amount: u256 = amount.into();
            let before = token.balance_of(recipient);
            assert(token.transfer(recipient, amount), 'payment transfer failed');
            assert(token.balance_of(recipient) == before + amount, 'payment amount mismatch');
        }
    }

    fn validate_rules(
        proceeds_recipient: ContractAddress,
        reserve_price: u128,
        min_raise_bps: u16,
        bidding_duration_seconds: u64,
        extension_seconds: u64,
    ) {
        assert(!proceeds_recipient.is_zero(), 'zero proceeds recipient');
        assert(reserve_price > 0, 'zero reserve price');
        assert(min_raise_bps <= BPS_DENOMINATOR, 'raise exceeds 100%');
        assert(bidding_duration_seconds > 0, 'zero bidding duration');
        assert(extension_seconds <= bidding_duration_seconds, 'extension exceeds duration');
    }

    /// The reserve opens a round; every later bid must raise the lead by the
    /// configured basis points, rounded up to the next base unit.
    fn minimum_bid(auction: BeaconAuction) -> u128 {
        if auction.status != BEACON_STATUS_BIDDING {
            return auction.reserve_price;
        }
        let leading: u256 = auction.leading_bid.into();
        let scaled = leading * auction.min_raise_bps.into();
        let denominator: u256 = BPS_DENOMINATOR.into();
        let mut raise = scaled / denominator;
        if scaled % denominator > 0 {
            raise += 1;
        }
        if raise == 0 {
            raise = 1;
        }
        let reserve: u256 = auction.reserve_price.into();
        let mut minimum = leading + raise;
        if minimum < reserve {
            minimum = reserve;
        }
        match minimum.try_into() {
            Option::Some(value) => value,
            Option::None => MAX_U128,
        }
    }

    fn rules_changed(admin: ContractAddress, config: BeaconConfig) -> BeaconRulesChanged {
        BeaconRulesChanged {
            admin,
            payment_token: config.payment_token,
            proceeds_recipient: config.proceeds_recipient,
            reserve_price: config.reserve_price,
            min_raise_bps: config.min_raise_bps,
            bidding_duration_seconds: config.bidding_duration_seconds,
            extension_seconds: config.extension_seconds,
        }
    }
}
