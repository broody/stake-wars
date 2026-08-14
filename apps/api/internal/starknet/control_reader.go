package starknet

import (
	"context"
	"fmt"
	"math/big"
)

// ControlReader is the authoritative contract-read boundary used for upload
// authorization and reconciliation decisions.
type ControlReader interface {
	ControlPointStatus(ctx context.Context, controlPointID uint32) (ControlPointStatus, error)
	OperatorStatus(ctx context.Context, operator string) (OperatorStatus, error)
	CanManageImage(
		ctx context.Context,
		controlPointID uint32,
		operator string,
		ownershipGeneration uint64,
	) (bool, error)
}

type ControlPointStatus struct {
	ID                  uint32
	Controller          string
	AllocatedStake      string
	OwnershipGeneration uint64
	RequiredStake       string
	Stale               bool
	NeedsSync           bool
}

type OperatorStatus struct {
	Operator             string
	LiveDelegatedAmount  string
	TotalAllocated       string
	AvailableStake       string
	Generation           uint64
	ControlledPointCount uint32
	NeedsSync            bool
}

type RPCControlReader struct {
	controlSystem string
	rpc           *rpcClient
}

func NewControlReader(rpcURL, controlSystem string) (*RPCControlReader, error) {
	address, err := normalizeAddress(controlSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid control system address: %w", err)
	}
	return &RPCControlReader{controlSystem: address, rpc: newRPCClient(rpcURL)}, nil
}

func (r *RPCControlReader) ControlPointStatus(
	ctx context.Context,
	controlPointID uint32,
) (ControlPointStatus, error) {
	result, err := r.rpc.call(
		ctx,
		r.controlSystem,
		"get_control_point_status",
		[]string{uintHex(uint64(controlPointID))},
	)
	if err != nil {
		return ControlPointStatus{}, err
	}
	if len(result) != 7 {
		return ControlPointStatus{}, fmt.Errorf("unexpected control point status length %d", len(result))
	}

	id, err := parseUint(result[0], 32)
	if err != nil {
		return ControlPointStatus{}, fieldError("id", err)
	}
	controller, err := normalizeContractAddress(result[1])
	if err != nil {
		return ControlPointStatus{}, fieldError("controller", err)
	}
	allocatedStake, err := parseUintString(result[2], 128)
	if err != nil {
		return ControlPointStatus{}, fieldError("allocated_stake", err)
	}
	generation, err := parseUint(result[3], 64)
	if err != nil {
		return ControlPointStatus{}, fieldError("ownership_generation", err)
	}
	requiredStake, err := parseUintString(result[4], 128)
	if err != nil {
		return ControlPointStatus{}, fieldError("required_stake", err)
	}
	stale, err := parseBool(result[5])
	if err != nil {
		return ControlPointStatus{}, fieldError("stale", err)
	}
	needsSync, err := parseBool(result[6])
	if err != nil {
		return ControlPointStatus{}, fieldError("needs_sync", err)
	}

	return ControlPointStatus{
		ID:                  uint32(id),
		Controller:          controller,
		AllocatedStake:      allocatedStake,
		OwnershipGeneration: generation,
		RequiredStake:       requiredStake,
		Stale:               stale,
		NeedsSync:           needsSync,
	}, nil
}

func (r *RPCControlReader) OperatorStatus(
	ctx context.Context,
	operator string,
) (OperatorStatus, error) {
	operator, err := normalizeAddress(operator)
	if err != nil {
		return OperatorStatus{}, fmt.Errorf("invalid operator: %w", err)
	}
	result, err := r.rpc.call(ctx, r.controlSystem, "get_operator_status", []string{operator})
	if err != nil {
		return OperatorStatus{}, err
	}
	if len(result) != 7 {
		return OperatorStatus{}, fmt.Errorf("unexpected operator status length %d", len(result))
	}

	returnedOperator, err := normalizeContractAddress(result[0])
	if err != nil {
		return OperatorStatus{}, fieldError("operator", err)
	}
	live, err := parseUintString(result[1], 128)
	if err != nil {
		return OperatorStatus{}, fieldError("live_delegated_amount", err)
	}
	allocated, err := parseUintString(result[2], 128)
	if err != nil {
		return OperatorStatus{}, fieldError("total_allocated", err)
	}
	available, err := parseUintString(result[3], 128)
	if err != nil {
		return OperatorStatus{}, fieldError("available_stake", err)
	}
	generation, err := parseUint(result[4], 64)
	if err != nil {
		return OperatorStatus{}, fieldError("generation", err)
	}
	pointCount, err := parseUint(result[5], 32)
	if err != nil {
		return OperatorStatus{}, fieldError("controlled_point_count", err)
	}
	needsSync, err := parseBool(result[6])
	if err != nil {
		return OperatorStatus{}, fieldError("needs_sync", err)
	}

	return OperatorStatus{
		Operator:             returnedOperator,
		LiveDelegatedAmount:  live,
		TotalAllocated:       allocated,
		AvailableStake:       available,
		Generation:           generation,
		ControlledPointCount: uint32(pointCount),
		NeedsSync:            needsSync,
	}, nil
}

func (r *RPCControlReader) CanManageImage(
	ctx context.Context,
	controlPointID uint32,
	operator string,
	ownershipGeneration uint64,
) (bool, error) {
	operator, err := normalizeAddress(operator)
	if err != nil {
		return false, fmt.Errorf("invalid operator: %w", err)
	}
	result, err := r.rpc.call(
		ctx,
		r.controlSystem,
		"can_manage_image",
		[]string{
			uintHex(uint64(controlPointID)),
			operator,
			uintHex(ownershipGeneration),
		},
	)
	if err != nil {
		return false, err
	}
	if len(result) != 1 {
		return false, fmt.Errorf("unexpected image authorization length %d", len(result))
	}
	return parseBool(result[0])
}

func normalizeContractAddress(value string) (string, error) {
	normalized, number, err := parseHexFelt(value)
	if err != nil {
		return "", err
	}
	if number.BitLen() > 251 {
		return "", fmt.Errorf("contract address exceeds Starknet address range")
	}
	return normalized, nil
}

func parseUintString(value string, bits int) (string, error) {
	number, err := parseUintBig(value, bits)
	if err != nil {
		return "", err
	}
	return number.String(), nil
}

func parseUint(value string, bits int) (uint64, error) {
	number, err := parseUintBig(value, bits)
	if err != nil {
		return 0, err
	}
	return number.Uint64(), nil
}

func parseUintBig(value string, bits int) (*big.Int, error) {
	_, number, err := parseHexFelt(value)
	if err != nil {
		return nil, err
	}
	if number.BitLen() > bits {
		return nil, fmt.Errorf("value exceeds u%d", bits)
	}
	return number, nil
}

func parseBool(value string) (bool, error) {
	number, err := parseUint(value, 1)
	if err != nil {
		return false, err
	}
	if number > 1 {
		return false, fmt.Errorf("boolean must be 0 or 1")
	}
	return number == 1, nil
}

func uintHex(value uint64) string {
	return fmt.Sprintf("0x%x", value)
}

func fieldError(field string, err error) error {
	return fmt.Errorf("decode %s: %w", field, err)
}
