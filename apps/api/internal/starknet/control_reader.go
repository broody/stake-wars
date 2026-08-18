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
	ID                       uint32
	Controller               string
	CaptureForce             string
	OwnershipGeneration      uint64
	ControlledSince          uint64
	RequiredStake            string
	ActiveChallengeID        uint64
	ChallengeLeadChangeCount uint32
	ChallengeDeadline        uint64
	Stale                    bool
	NeedsSync                bool
}

type OperatorStatus struct {
	Operator             string
	LiveDelegatedAmount  string
	PointForce           string
	ChallengeForce       string
	SpentForce           string
	AvailableForce       string
	Generation           uint64
	ControlledPointCount uint32
	ActiveChallengeCount uint32
	Retired              bool
	Exiting              bool
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
	if len(result) != 11 {
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
	captureForce, err := parseUintString(result[2], 128)
	if err != nil {
		return ControlPointStatus{}, fieldError("capture_force", err)
	}
	generation, err := parseUint(result[3], 64)
	if err != nil {
		return ControlPointStatus{}, fieldError("ownership_generation", err)
	}
	controlledSince, err := parseUint(result[4], 64)
	if err != nil {
		return ControlPointStatus{}, fieldError("controlled_since", err)
	}
	requiredStake, err := parseUintString(result[5], 128)
	if err != nil {
		return ControlPointStatus{}, fieldError("required_stake", err)
	}
	activeChallengeID, err := parseUint(result[6], 64)
	if err != nil {
		return ControlPointStatus{}, fieldError("active_challenge_id", err)
	}
	challengeLeadChangeCount, err := parseUint(result[7], 32)
	if err != nil {
		return ControlPointStatus{}, fieldError("challenge_lead_change_count", err)
	}
	challengeDeadline, err := parseUint(result[8], 64)
	if err != nil {
		return ControlPointStatus{}, fieldError("challenge_deadline", err)
	}
	stale, err := parseBool(result[9])
	if err != nil {
		return ControlPointStatus{}, fieldError("stale", err)
	}
	needsSync, err := parseBool(result[10])
	if err != nil {
		return ControlPointStatus{}, fieldError("needs_sync", err)
	}

	return ControlPointStatus{
		ID:                       uint32(id),
		Controller:               controller,
		CaptureForce:             captureForce,
		OwnershipGeneration:      generation,
		ControlledSince:          controlledSince,
		RequiredStake:            requiredStake,
		ActiveChallengeID:        activeChallengeID,
		ChallengeLeadChangeCount: uint32(challengeLeadChangeCount),
		ChallengeDeadline:        challengeDeadline,
		Stale:                    stale,
		NeedsSync:                needsSync,
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
	if len(result) != 12 {
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
	pointForce, err := parseUintString(result[2], 128)
	if err != nil {
		return OperatorStatus{}, fieldError("point_force", err)
	}
	challengeForce, err := parseUintString(result[3], 128)
	if err != nil {
		return OperatorStatus{}, fieldError("challenge_force", err)
	}
	spentForce, err := parseUintString(result[4], 128)
	if err != nil {
		return OperatorStatus{}, fieldError("spent_force", err)
	}
	availableForce, err := parseUintString(result[5], 128)
	if err != nil {
		return OperatorStatus{}, fieldError("available_force", err)
	}
	generation, err := parseUint(result[6], 64)
	if err != nil {
		return OperatorStatus{}, fieldError("generation", err)
	}
	pointCount, err := parseUint(result[7], 32)
	if err != nil {
		return OperatorStatus{}, fieldError("controlled_point_count", err)
	}
	activeChallengeCount, err := parseUint(result[8], 32)
	if err != nil {
		return OperatorStatus{}, fieldError("active_challenge_count", err)
	}
	retired, err := parseBool(result[9])
	if err != nil {
		return OperatorStatus{}, fieldError("retired", err)
	}
	exiting, err := parseBool(result[10])
	if err != nil {
		return OperatorStatus{}, fieldError("exiting", err)
	}
	needsSync, err := parseBool(result[11])
	if err != nil {
		return OperatorStatus{}, fieldError("needs_sync", err)
	}

	return OperatorStatus{
		Operator:             returnedOperator,
		LiveDelegatedAmount:  live,
		PointForce:           pointForce,
		ChallengeForce:       challengeForce,
		SpentForce:           spentForce,
		AvailableForce:       availableForce,
		Generation:           generation,
		ControlledPointCount: uint32(pointCount),
		ActiveChallengeCount: uint32(activeChallengeCount),
		Retired:              retired,
		Exiting:              exiting,
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
