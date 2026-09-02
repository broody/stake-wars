use starknet::ContractAddress;

#[starknet::interface]
pub trait IAdmin<TContractState> {
    fn initialize(
        ref self: TContractState,
        staking_pool: ContractAddress,
        minimum_stake: u128,
        challenge_period_seconds: u64,
        sector_limit: u32,
    );
    fn set_paused(ref self: TContractState, paused: bool);
    fn set_rules(
        ref self: TContractState,
        minimum_stake: u128,
        challenge_period_seconds: u64,
        sector_limit: u32,
    );
    fn set_staking_pool(ref self: TContractState, staking_pool: ContractAddress);
    fn transfer_admin(ref self: TContractState, new_admin: ContractAddress);
}

#[starknet::interface]
pub trait IRoles<TContractState> {
    fn has_role(self: @TContractState, role: felt252, account: ContractAddress) -> bool;
    fn get_role_admin(self: @TContractState, role: felt252) -> felt252;
    fn grant_role(ref self: TContractState, role: felt252, account: ContractAddress);
    fn revoke_role(ref self: TContractState, role: felt252, account: ContractAddress);
    fn renounce_role(ref self: TContractState, role: felt252, account: ContractAddress);
}

#[dojo::contract]
pub mod admin {
    use core::num::traits::Zero;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use dojo::world::IWorldDispatcherTrait;
    use openzeppelin_access::accesscontrol::{AccessControlComponent, DEFAULT_ADMIN_ROLE};
    use openzeppelin_introspection::src5::SRC5Component;
    use stakewars::models::{CONFIG_ID, GameConfig, MAX_SECTORS};
    use starknet::{ContractAddress, get_caller_address};
    use super::{IAdmin, IRoles};

    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    fn dojo_init(ref self: ContractState) {
        self.accesscontrol.initializer();
        let config: GameConfig = self.world_default().read_model(CONFIG_ID);
        if config.initialized {
            self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, config.admin);
        }
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct ConfigInitialized {
        #[key]
        pub admin: ContractAddress,
        pub staking_pool: ContractAddress,
        pub minimum_stake: u128,
        pub challenge_period_seconds: u64,
        pub sector_limit: u32,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct PauseChanged {
        #[key]
        pub admin: ContractAddress,
        pub paused: bool,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct RulesChanged {
        #[key]
        pub admin: ContractAddress,
        pub minimum_stake: u128,
        pub challenge_period_seconds: u64,
        pub sector_limit: u32,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct StakingPoolChanged {
        #[key]
        pub admin: ContractAddress,
        pub previous_pool: ContractAddress,
        pub new_pool: ContractAddress,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct AdminTransferred {
        #[key]
        pub previous_admin: ContractAddress,
        pub new_admin: ContractAddress,
    }

    #[abi(embed_v0)]
    impl AdminImpl of IAdmin<ContractState> {
        fn initialize(
            ref self: ContractState,
            staking_pool: ContractAddress,
            minimum_stake: u128,
            challenge_period_seconds: u64,
            sector_limit: u32,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let config: GameConfig = world.read_model(CONFIG_ID);

            assert(!config.initialized, 'already initialized');
            assert(
                world.dispatcher.is_owner(dojo::utils::bytearray_hash(@"stakewars"), caller),
                'not world owner',
            );
            assert(!staking_pool.is_zero(), 'zero staking pool');
            validate_rules(minimum_stake, challenge_period_seconds, sector_limit);

            world
                .write_model(
                    @GameConfig {
                        id: CONFIG_ID,
                        initialized: true,
                        admin: caller,
                        staking_pool,
                        minimum_stake,
                        challenge_period_seconds,
                        sector_limit,
                        paused: false,
                    },
                );
            self.accesscontrol.initializer();
            self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, caller);
            world
                .emit_event(
                    @ConfigInitialized {
                        admin: caller,
                        staking_pool,
                        minimum_stake,
                        challenge_period_seconds,
                        sector_limit,
                    },
                );
        }

        fn set_paused(ref self: ContractState, paused: bool) {
            let mut world = self.world_default();
            let mut config = self.assert_admin();
            config.paused = paused;
            world.write_model(@config);
            world.emit_event(@PauseChanged { admin: config.admin, paused });
        }

        fn set_rules(
            ref self: ContractState,
            minimum_stake: u128,
            challenge_period_seconds: u64,
            sector_limit: u32,
        ) {
            validate_rules(minimum_stake, challenge_period_seconds, sector_limit);
            let mut world = self.world_default();
            let mut config = self.assert_admin();
            assert(sector_limit >= config.sector_limit, 'cannot reduce sector limit');
            config.minimum_stake = minimum_stake;
            config.challenge_period_seconds = challenge_period_seconds;
            config.sector_limit = sector_limit;
            world.write_model(@config);
            world
                .emit_event(
                    @RulesChanged {
                        admin: config.admin, minimum_stake, challenge_period_seconds, sector_limit,
                    },
                );
        }

        fn set_staking_pool(ref self: ContractState, staking_pool: ContractAddress) {
            assert(!staking_pool.is_zero(), 'zero staking pool');
            let mut world = self.world_default();
            let mut config = self.assert_admin();
            assert(config.paused, 'pause required');
            let previous_pool = config.staking_pool;
            config.staking_pool = staking_pool;
            world.write_model(@config);
            world
                .emit_event(
                    @StakingPoolChanged {
                        admin: config.admin, previous_pool, new_pool: staking_pool,
                    },
                );
        }

        fn transfer_admin(ref self: ContractState, new_admin: ContractAddress) {
            assert(!new_admin.is_zero(), 'zero admin');
            let mut world = self.world_default();
            let mut config = self.assert_admin();
            let previous_admin = config.admin;
            if previous_admin != new_admin {
                self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, new_admin);
                self.accesscontrol._revoke_role(DEFAULT_ADMIN_ROLE, previous_admin);
            }
            config.admin = new_admin;
            world.write_model(@config);
            world.emit_event(@AdminTransferred { previous_admin, new_admin });
        }
    }

    #[abi(embed_v0)]
    impl RolesImpl of IRoles<ContractState> {
        fn has_role(self: @ContractState, role: felt252, account: ContractAddress) -> bool {
            if role == DEFAULT_ADMIN_ROLE {
                let config: GameConfig = self.world_default().read_model(CONFIG_ID);
                return config.initialized && config.admin == account;
            }
            self.accesscontrol.is_role_effective(role, account)
        }

        fn get_role_admin(self: @ContractState, role: felt252) -> felt252 {
            let _ = role;
            DEFAULT_ADMIN_ROLE
        }

        fn grant_role(ref self: ContractState, role: felt252, account: ContractAddress) {
            assert(role != DEFAULT_ADMIN_ROLE, 'default admin managed');
            assert(!account.is_zero(), 'zero role account');
            self.assert_admin();
            self.accesscontrol._grant_role(role, account);
        }

        fn revoke_role(ref self: ContractState, role: felt252, account: ContractAddress) {
            assert(role != DEFAULT_ADMIN_ROLE, 'default admin managed');
            self.assert_admin();
            self.accesscontrol._revoke_role(role, account);
        }

        fn renounce_role(ref self: ContractState, role: felt252, account: ContractAddress) {
            assert(role != DEFAULT_ADMIN_ROLE, 'default admin managed');
            assert(account == get_caller_address(), 'not role account');
            self.accesscontrol._revoke_role(role, account);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"stakewars")
        }

        fn assert_admin(self: @ContractState) -> GameConfig {
            let world = self.world_default();
            let config: GameConfig = world.read_model(CONFIG_ID);
            assert(config.initialized, 'not initialized');
            assert(config.admin == get_caller_address(), 'not admin');
            config
        }
    }
    use AccessControlComponent::InternalTrait as AccessControlInternalTrait;

    fn validate_rules(minimum_stake: u128, challenge_period_seconds: u64, sector_limit: u32) {
        assert(minimum_stake > 0, 'zero minimum stake');
        assert(challenge_period_seconds > 0, 'zero challenge period');
        assert(sector_limit > 0, 'zero sector limit');
        assert(sector_limit <= MAX_SECTORS, 'too many sectors');
    }
}
