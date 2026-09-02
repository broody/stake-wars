use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockERC20Control<TContractState> {
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::contract]
pub mod mock_erc20 {
    use core::num::traits::Zero;
    use stakewars::assets::IERC20Asset;
    use stakewars::tests::mock_tokens::IMockERC20Control;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, supply: u256) {
        assert(!owner.is_zero(), 'zero owner');
        self.balances.write(owner, supply);
    }

    #[abi(embed_v0)]
    impl ERC20Impl of IERC20Asset<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            self.move_tokens(get_caller_address(), recipient, amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            if spender != sender {
                let allowance = self.allowances.read((sender, spender));
                assert(allowance >= amount, 'insufficient allowance');
                self.allowances.write((sender, spender), allowance - amount);
            }
            self.move_tokens(sender, recipient, amount);
            true
        }
    }

    #[abi(embed_v0)]
    impl ControlImpl of IMockERC20Control<ContractState> {
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.write((get_caller_address(), spender), amount);
            true
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn move_tokens(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            assert(!recipient.is_zero(), 'zero recipient');
            let balance = self.balances.read(sender);
            assert(balance >= amount, 'insufficient balance');
            self.balances.write(sender, balance - amount);
            self.balances.write(recipient, self.balances.read(recipient) + amount);
        }
    }
}

#[starknet::interface]
pub trait IMockERC721Control<TContractState> {
    fn approve(ref self: TContractState, approved: ContractAddress, token_id: u256);
}

#[starknet::contract]
pub mod mock_erc721 {
    use core::num::traits::Zero;
    use stakewars::assets::{
        IERC721Asset, IERC721ReceiverDispatcher, IERC721ReceiverDispatcherTrait,
        IERC721_RECEIVER_ID, ISRC5Dispatcher, ISRC5DispatcherTrait,
    };
    use stakewars::tests::mock_tokens::IMockERC721Control;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::syscalls::get_class_hash_at_syscall;
    use starknet::{ContractAddress, SyscallResultTrait, get_caller_address};

    #[storage]
    struct Storage {
        owners: Map<u256, ContractAddress>,
        approvals: Map<u256, ContractAddress>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, token_id: u256) {
        assert(!owner.is_zero(), 'zero owner');
        self.owners.write(token_id, owner);
    }

    #[abi(embed_v0)]
    impl ERC721Impl of IERC721Asset<ContractState> {
        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            let owner = self.owners.read(token_id);
            assert(!owner.is_zero(), 'token not found');
            owner
        }

        fn safe_transfer_from(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            token_id: u256,
            data: Span<felt252>,
        ) {
            let operator = get_caller_address();
            assert(!to.is_zero(), 'zero recipient');
            assert(self.owners.read(token_id) == from, 'wrong owner');
            assert(operator == from || self.approvals.read(token_id) == operator, 'not approved');
            self.owners.write(token_id, to);
            self.approvals.write(token_id, zero_address());
            if get_class_hash_at_syscall(to).unwrap_syscall().is_non_zero() {
                assert(
                    ISRC5Dispatcher { contract_address: to }
                        .supports_interface(IERC721_RECEIVER_ID),
                    'unsupported receiver',
                );
                assert(
                    IERC721ReceiverDispatcher { contract_address: to }
                        .on_erc721_received(operator, from, token_id, data) == IERC721_RECEIVER_ID,
                    'rejected erc721',
                );
            }
        }
    }

    #[abi(embed_v0)]
    impl ControlImpl of IMockERC721Control<ContractState> {
        fn approve(ref self: ContractState, approved: ContractAddress, token_id: u256) {
            assert(self.owners.read(token_id) == get_caller_address(), 'not owner');
            self.approvals.write(token_id, approved);
        }
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}

#[starknet::interface]
pub trait IMockERC1155Control<TContractState> {
    fn set_approval_for_all(ref self: TContractState, operator: ContractAddress, approved: bool);
}

#[starknet::contract]
pub mod mock_erc1155 {
    use core::num::traits::Zero;
    use stakewars::assets::{
        IERC1155Asset, IERC1155ReceiverDispatcher, IERC1155ReceiverDispatcherTrait,
        IERC1155_RECEIVER_ID, ISRC5Dispatcher, ISRC5DispatcherTrait,
    };
    use stakewars::tests::mock_tokens::IMockERC1155Control;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::syscalls::get_class_hash_at_syscall;
    use starknet::{ContractAddress, SyscallResultTrait, get_caller_address};

    #[storage]
    struct Storage {
        balances: Map<(ContractAddress, u256), u256>,
        approvals: Map<(ContractAddress, ContractAddress), bool>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, token_id: u256, amount: u256) {
        assert(!owner.is_zero(), 'zero owner');
        self.balances.write((owner, token_id), amount);
    }

    #[abi(embed_v0)]
    impl ERC1155Impl of IERC1155Asset<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress, token_id: u256) -> u256 {
            self.balances.read((account, token_id))
        }

        fn safe_transfer_from(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            token_id: u256,
            value: u256,
            data: Span<felt252>,
        ) {
            let operator = get_caller_address();
            assert(operator == from || self.approvals.read((from, operator)), 'not approved');
            assert(!to.is_zero(), 'zero recipient');
            let balance = self.balances.read((from, token_id));
            assert(balance >= value, 'insufficient balance');
            self.balances.write((from, token_id), balance - value);
            self.balances.write((to, token_id), self.balances.read((to, token_id)) + value);
            if get_class_hash_at_syscall(to).unwrap_syscall().is_non_zero() {
                assert(
                    ISRC5Dispatcher { contract_address: to }
                        .supports_interface(IERC1155_RECEIVER_ID),
                    'unsupported receiver',
                );
                assert(
                    IERC1155ReceiverDispatcher { contract_address: to }
                        .on_erc1155_received(
                            operator, from, token_id, value, data,
                        ) == IERC1155_RECEIVER_ID,
                    'rejected erc1155',
                );
            }
        }
    }

    #[abi(embed_v0)]
    impl ControlImpl of IMockERC1155Control<ContractState> {
        fn set_approval_for_all(
            ref self: ContractState, operator: ContractAddress, approved: bool,
        ) {
            self.approvals.write((get_caller_address(), operator), approved);
        }
    }
}
