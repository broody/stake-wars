use starknet::account::Call;

#[starknet::interface]
pub trait IMockAccount<TContractState> {
    fn execute(ref self: TContractState, calls: Span<Call>);
}

/// Test-only account used to exercise real nested calls and transaction rollback.
#[starknet::contract]
pub mod mock_account {
    use starknet::SyscallResultTrait;
    use starknet::account::Call;
    use starknet::syscalls::call_contract_syscall;
    use super::IMockAccount;
    #[storage]
    struct Storage {}
    #[abi(embed_v0)]
    impl AccountImpl of IMockAccount<ContractState> {
        fn execute(ref self: ContractState, calls: Span<Call>) {
            for call in calls {
                call_contract_syscall(*call.to, *call.selector, *call.calldata).unwrap_syscall();
            }
        }
    }
}
