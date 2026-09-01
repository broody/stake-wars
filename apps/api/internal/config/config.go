package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultPort                      = "8080"
	defaultDatabasePath              = "./stakewars.db"
	defaultStarknetChainID           = "SN_MAIN"
	defaultMaxImageBytes             = int64(2 * 1024 * 1024)
	defaultChallengeTTL              = 5 * time.Minute
	defaultSessionTTL                = 15 * time.Minute
	defaultBeaconBiddingDuration     = 72 * time.Hour
	defaultBeaconAcceptanceDuration  = 15 * time.Minute
	defaultBeaconSettlementDuration  = 6 * time.Hour
	defaultBeaconReservePrice        = "100000000000000000"
	defaultBeaconMaxBids             = 32
	defaultBeaconWinnerPayloadDomain = "0x5354414b45574152535f424541434f4e5f5631"
	maxConfiguredImageBytes          = int64(100 * 1024 * 1024)
	productionEnvironmentName        = "production"
)

var productionOrigins = []string{
	"https://stakewars.gg",
	"https://play.stakewars.gg",
}

// Config contains runtime settings. Secrets are read from the environment and
// never persisted by this package.
type Config struct {
	Environment               string
	Port                      string
	DatabasePath              string
	StarknetRPCURL            string
	StarknetChainID           string
	ToriiURL                  string
	ToriiStakingPoolAddress   string
	MaxImageBytes             int64
	ChallengeTTL              time.Duration
	SessionTTL                time.Duration
	BeaconBiddingDuration     time.Duration
	BeaconAcceptanceDuration  time.Duration
	BeaconSettlementDuration  time.Duration
	BeaconCoordinatorURL      string
	BeaconCoordinatorToken    string
	BeaconPaymentToken        string
	BeaconReservePrice        string
	BeaconMaxBids             uint32
	BeaconWinnerPayloadDomain string
	AllowedOrigins            []string
	ControlSystemAddress      string
	ImageBucket               string
	ImagePublicURL            string
	S3Endpoint                string
	S3Region                  string
	S3AccessKeyID             string
	S3SecretAccessKey         string
}

// Load reads and validates runtime configuration from the environment.
func Load() (Config, error) {
	environment := valueOrDefault("APP_ENV", "development")

	maxImageBytes, err := int64Value("MAX_IMAGE_BYTES", defaultMaxImageBytes)
	if err != nil {
		return Config{}, err
	}
	if maxImageBytes <= 0 || maxImageBytes > maxConfiguredImageBytes {
		return Config{}, fmt.Errorf("MAX_IMAGE_BYTES must be between 1 and %d", maxConfiguredImageBytes)
	}

	challengeTTL, err := durationValue("AUTH_CHALLENGE_TTL", defaultChallengeTTL)
	if err != nil {
		return Config{}, err
	}
	if challengeTTL <= 0 {
		return Config{}, fmt.Errorf("AUTH_CHALLENGE_TTL must be positive")
	}

	sessionTTL, err := durationValue("AUTH_SESSION_TTL", defaultSessionTTL)
	if err != nil {
		return Config{}, err
	}
	if sessionTTL <= 0 {
		return Config{}, fmt.Errorf("AUTH_SESSION_TTL must be positive")
	}

	beaconBiddingDuration, err := durationValue("BEACON_BIDDING_DURATION", defaultBeaconBiddingDuration)
	if err != nil {
		return Config{}, err
	}
	beaconAcceptanceDuration, err := durationValue("BEACON_ACCEPTANCE_DURATION", defaultBeaconAcceptanceDuration)
	if err != nil {
		return Config{}, err
	}
	beaconSettlementDuration, err := durationValue("BEACON_SETTLEMENT_DURATION", defaultBeaconSettlementDuration)
	if err != nil {
		return Config{}, err
	}
	if beaconAcceptanceDuration <= 0 || beaconAcceptanceDuration%time.Second != 0 ||
		beaconSettlementDuration <= 0 || beaconSettlementDuration%time.Second != 0 {
		return Config{}, fmt.Errorf("Beacon acceptance and settlement durations must be positive whole seconds")
	}
	beaconCoordinatorURL := strings.TrimRight(strings.TrimSpace(os.Getenv("BEACON_COORDINATOR_URL")), "/")
	beaconCoordinatorToken := strings.TrimSpace(os.Getenv("BEACON_COORDINATOR_TOKEN"))
	beaconPaymentToken := strings.TrimSpace(os.Getenv("BEACON_PAYMENT_TOKEN"))
	configuredCoordinatorValues := 0
	for _, value := range []string{beaconCoordinatorURL, beaconCoordinatorToken, beaconPaymentToken} {
		if value != "" {
			configuredCoordinatorValues++
		}
	}
	if configuredCoordinatorValues != 0 && configuredCoordinatorValues != 3 {
		return Config{}, fmt.Errorf("BEACON_COORDINATOR_URL, BEACON_COORDINATOR_TOKEN, and BEACON_PAYMENT_TOKEN must be configured together")
	}
	if beaconCoordinatorURL != "" {
		parsed, err := url.Parse(beaconCoordinatorURL)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return Config{}, fmt.Errorf("BEACON_COORDINATOR_URL must be an absolute HTTP(S) URL")
		}
		if len(beaconCoordinatorToken) < 32 {
			return Config{}, fmt.Errorf("BEACON_COORDINATOR_TOKEN must contain at least 32 characters")
		}
	}
	beaconMaxBidsValue, err := int64Value("BEACON_MAX_BIDS", defaultBeaconMaxBids)
	if err != nil || beaconMaxBidsValue < 1 || beaconMaxBidsValue > 256 {
		return Config{}, fmt.Errorf("BEACON_MAX_BIDS must be between 1 and 256")
	}
	if beaconBiddingDuration <= 0 || beaconBiddingDuration%time.Second != 0 {
		return Config{}, fmt.Errorf("BEACON_BIDDING_DURATION must be a positive whole number of seconds")
	}

	origins := productionOrigins
	if environment != productionEnvironmentName {
		origins = append(append([]string{}, productionOrigins...), "http://localhost:3000")
	}
	if rawOrigins := os.Getenv("ALLOWED_ORIGINS"); rawOrigins != "" {
		origins = splitNonEmpty(rawOrigins)
		if len(origins) == 0 {
			return Config{}, fmt.Errorf("ALLOWED_ORIGINS must contain at least one origin")
		}
	}

	toriiURL := strings.TrimSpace(os.Getenv("TORII_URL"))
	if toriiURL != "" {
		parsed, err := url.Parse(toriiURL)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return Config{}, fmt.Errorf("TORII_URL must be an absolute HTTP(S) URL")
		}
	}

	imageBucket := strings.TrimSpace(os.Getenv("IMAGE_BUCKET"))
	imagePublicURL := strings.TrimRight(strings.TrimSpace(os.Getenv("IMAGE_PUBLIC_URL")), "/")
	s3Endpoint := strings.TrimRight(strings.TrimSpace(os.Getenv("S3_ENDPOINT")), "/")
	s3AccessKeyID := strings.TrimSpace(os.Getenv("AWS_ACCESS_KEY_ID"))
	s3SecretAccessKey := strings.TrimSpace(os.Getenv("AWS_SECRET_ACCESS_KEY"))
	storageRequested := imageBucket != "" || imagePublicURL != "" || s3Endpoint != ""
	if storageRequested && (s3AccessKeyID == "" || s3SecretAccessKey == "" ||
		imageBucket == "" || imagePublicURL == "" || s3Endpoint == "") {
		return Config{}, fmt.Errorf("IMAGE_BUCKET, IMAGE_PUBLIC_URL, S3_ENDPOINT, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY must be configured together")
	}
	for name, value := range map[string]string{
		"IMAGE_PUBLIC_URL": imagePublicURL,
		"S3_ENDPOINT":      s3Endpoint,
	} {
		if value == "" {
			continue
		}
		parsed, err := url.Parse(value)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return Config{}, fmt.Errorf("%s must be an absolute HTTP(S) URL", name)
		}
	}

	return Config{
		Environment:               environment,
		Port:                      valueOrDefault("PORT", defaultPort),
		DatabasePath:              valueOrDefault("DATABASE_PATH", defaultDatabasePath),
		StarknetRPCURL:            strings.TrimSpace(os.Getenv("STARKNET_RPC_URL")),
		StarknetChainID:           valueOrDefault("STARKNET_CHAIN_ID", defaultStarknetChainID),
		ToriiURL:                  toriiURL,
		ToriiStakingPoolAddress:   strings.TrimSpace(os.Getenv("TORII_STAKING_POOL_ADDRESS")),
		MaxImageBytes:             maxImageBytes,
		ChallengeTTL:              challengeTTL,
		SessionTTL:                sessionTTL,
		BeaconBiddingDuration:     beaconBiddingDuration,
		BeaconAcceptanceDuration:  beaconAcceptanceDuration,
		BeaconSettlementDuration:  beaconSettlementDuration,
		BeaconCoordinatorURL:      beaconCoordinatorURL,
		BeaconCoordinatorToken:    beaconCoordinatorToken,
		BeaconPaymentToken:        beaconPaymentToken,
		BeaconReservePrice:        valueOrDefault("BEACON_RESERVE_PRICE", defaultBeaconReservePrice),
		BeaconMaxBids:             uint32(beaconMaxBidsValue),
		BeaconWinnerPayloadDomain: valueOrDefault("BEACON_WINNER_PAYLOAD_DOMAIN", defaultBeaconWinnerPayloadDomain),
		AllowedOrigins:            origins,
		ControlSystemAddress:      strings.TrimSpace(os.Getenv("CONTROL_SYSTEM_ADDRESS")),
		ImageBucket:               imageBucket,
		ImagePublicURL:            imagePublicURL,
		S3Endpoint:                s3Endpoint,
		S3Region:                  valueOrDefault("AWS_REGION", "auto"),
		S3AccessKeyID:             s3AccessKeyID,
		S3SecretAccessKey:         s3SecretAccessKey,
	}, nil
}

func (c Config) BeaconCoordinatorEnabled() bool {
	return c.BeaconCoordinatorURL != ""
}

func (c Config) ImageStorageEnabled() bool {
	return c.ImageBucket != ""
}

func valueOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func int64Value(key string, fallback int64) (int64, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", key, err)
	}
	return parsed, nil
}

func durationValue(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", key, err)
	}
	return parsed, nil
}

func splitNonEmpty(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
