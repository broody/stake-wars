package survivor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"time"
)

// The existing Fly Machine also serves Torii. Only one short-lived verifier may
// run at once, and it never holds the SQLite connection while simulating.
const (
	maxReplayBytes = 224000 // two bytes per tick or menu choice, through one hour
	simulationHz   = 30
	maxTicks       = 60 * 60 * simulationHz
)

var verifierSlot = make(chan struct{}, 1)

func verifyReplay(ctx context.Context, seed uint32, replay []byte, elapsedMS int64) (RunResult, error) {
	if len(replay) < 2 || len(replay)%2 != 0 || len(replay) > maxReplayBytes {
		return RunResult{}, ErrReplay
	}
	var ticks int64
	for i := 0; i < len(replay); i += 2 {
		if replay[i] != 255 {
			ticks++
		}
	}
	if ticks == 0 || ticks > maxTicks || ticks*1000 > (elapsedMS+1000)*simulationHz {
		return RunResult{}, ErrReplay
	}
	select {
	case verifierSlot <- struct{}{}:
		defer func() { <-verifierSlot }()
	default:
		return RunResult{}, ErrBusy
	}
	path := os.Getenv("SURVIVOR_VERIFIER_PATH")
	if path == "" {
		path = "generated/survivor-verifier.cjs"
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", "--max-old-space-size=48", path, fmt.Sprint(seed))
	cmd.Env = []string{}
	cmd.Stdin = bytes.NewReader(replay)
	out, err := cmd.Output()
	if err != nil {
		var status *exec.ExitError
		if errors.As(err, &status) && status.ExitCode() == 2 {
			return RunResult{}, ErrReplay
		}
		return RunResult{}, fmt.Errorf("run Survivor verifier: %w", err)
	}
	result := RunResult{Destroyed: -1, DurationSeconds: -1}
	if err = json.Unmarshal(out, &result); err != nil || result.Destroyed < 0 ||
		result.DurationSeconds != int(ticks/simulationHz) || result.Upgrades == nil {
		return RunResult{}, errors.New("invalid verifier result")
	}
	return result, nil
}
