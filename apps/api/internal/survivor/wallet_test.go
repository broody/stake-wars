package survivor

import (
	"context"
	"errors"
	"testing"
)

func TestDetectWalletTrustsOnlyTheChainForOutis(t *testing.T) {
	outisClass := func(_ context.Context, wallet string) (bool, error) { return wallet == "0xoutis", nil }
	for _, tc := range []struct{ wallet, reported, want string }{
		{"0xoutis", "", "outis"},
		{"0xoutis", "braavos", "outis"},
		{"0xother", "outis", ""},
		{"0xother", "braavos", "braavos"},
		{"0xother", "argentX", "argentX"},
		{"0xother", "xverse", "xverse"},
		{"0xother", "metamask", ""},
		{"0xother", "", ""},
	} {
		got, err := DetectWallet(outisClass, tc.reported)(t.Context(), tc.wallet)
		if err != nil || got != tc.want {
			t.Errorf("%s reporting %q: got %q, %v; want %q", tc.wallet, tc.reported, got, err, tc.want)
		}
	}
	unavailable := errors.New("rpc down")
	failing := func(context.Context, string) (bool, error) { return false, unavailable }
	if _, err := DetectWallet(failing, "braavos")(t.Context(), "0xother"); !errors.Is(err, unavailable) {
		t.Fatal("a failed class check must not fall back to the reported wallet", err)
	}
}
