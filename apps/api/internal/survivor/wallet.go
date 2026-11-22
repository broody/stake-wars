package survivor

import "context"

// Wallets a client may report besides Outis. Outis is never taken from the
// client, because the API can check it onchain.
var reportedWallets = map[string]bool{"argentX": true, "braavos": true, "bramble": true, "xverse": true}

// DetectWallet returns the WalletKind for one submission. A wallet whose
// account class is Outis is "outis". Otherwise the client's reported wallet
// ID is used when it is one of the supported wallets, and anything else is
// recorded as unknown.
func DetectWallet(isOutis func(context.Context, string) (bool, error), reported string) WalletKind {
	return func(ctx context.Context, wallet string) (string, error) {
		outis, err := isOutis(ctx, wallet)
		if err != nil {
			return "", err
		}
		if outis {
			return "outis", nil
		}
		if reportedWallets[reported] {
			return reported, nil
		}
		return "", nil
	}
}
