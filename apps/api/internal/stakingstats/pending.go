package stakingstats

import (
	"math/big"
)

// pendingIntent is one delegation-pool member's outstanding exit request.
type pendingIntent struct {
	Pool        string
	Identifier  string
	Token       string
	Staker      string
	Amount      *big.Int
	IntentBlock uint64
}

// pendingBook folds the exit-intent log into the outstanding exits at a block.
type pendingBook struct {
	intents   map[string]*pendingIntent
	watermark position
}

func newPendingBook() *pendingBook {
	return &pendingBook{intents: make(map[string]*pendingIntent)}
}

func (b *pendingBook) apply(row exitIntentRow) {
	if !row.Position.after(b.watermark) {
		return
	}
	b.watermark = row.Position
	key := row.Pool + "|" + row.Identifier
	if row.Amount.Sign() == 0 {
		delete(b.intents, key)
		return
	}
	current, ok := b.intents[key]
	if !ok {
		current = &pendingIntent{
			Pool: row.Pool, Identifier: row.Identifier, IntentBlock: row.Position.Block,
		}
		b.intents[key] = current
	}
	current.Token = row.Token
	if row.Staker != "" {
		current.Staker = row.Staker
	}
	current.Amount = new(big.Int).Set(row.Amount)
	if row.ResetsClock {
		current.IntentBlock = row.Position.Block
	}
}

// totals returns pending STRK and 18-decimal normalized BTC.
func (b *pendingBook) totals(strkToken string, decimals func(string) (uint8, bool)) (strk, btc *big.Int) {
	strk, btc = new(big.Int), new(big.Int)
	for _, intent := range b.intents {
		if intent.Token == strkToken {
			strk.Add(strk, intent.Amount)
			continue
		}
		if tokenDecimals, ok := decimals(intent.Token); ok {
			btc.Add(btc, normalizeAmount(intent.Amount, tokenDecimals))
		}
	}
	return strk, btc
}

func (b *pendingBook) list() []*pendingIntent {
	result := make([]*pendingIntent, 0, len(b.intents))
	for _, intent := range b.intents {
		result = append(result, intent)
	}
	return result
}
