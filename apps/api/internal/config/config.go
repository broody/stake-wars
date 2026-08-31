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
	defaultPort                       = "8080"
	defaultDatabasePath               = "./stakewars.db"
	defaultStarknetChainID            = "SN_MAIN"
	defaultMaxImageBytes              = int64(2 * 1024 * 1024)
	defaultChallengeTTL               = 5 * time.Minute
	defaultSessionTTL                 = 15 * time.Minute
	defaultArbiterBiddingDuration     = 72 * time.Hour
	defaultArbiterAcceptanceDuration  = 15 * time.Minute
	defaultArbiterSettlementDuration  = 6 * time.Hour
	defaultArbiterReservePrice        = "100000000000000000"
	defaultArbiterMaxBids             = 32
	defaultArbiterWinnerPayloadDomain = "0x5354414b45574152535f415242495445525f5631"
	maxConfiguredImageBytes           = int64(100 * 1024 * 1024)
	productionEnvironmentName         = "production"
)

var productionOrigins = []string{
	"https://stakewars.gg",
	"https://play.stakewars.gg",
}

// Config contains runtime settings. Secrets are read from the environment and
// never persisted by this package.
type Config struct {
	Environment                string
	Port                       string
	DatabasePath               string
	StarknetRPCURL             string
	StarknetChainID            string
	ToriiURL                   string
	ToriiStakingPoolAddress    string
	MaxImageBytes              int64
	ChallengeTTL               time.Duration
	SessionTTL                 time.Duration
	ArbiterBiddingDuration     time.Duration
	ArbiterAcceptanceDuration  time.Duration
	ArbiterSettlementDuration  time.Duration
	ArbiterCoordinatorURL      string
	ArbiterCoordinatorToken    string
	ArbiterPaymentToken        string
	ArbiterReservePrice        string
	ArbiterMaxBids             uint32
	ArbiterWinnerPayloadDomain string
	AllowedOrigins             []string
	ControlSystemAddress       string
	ImageBucket                string
	ImagePublicURL             string
	S3Endpoint                 string
	S3Region                   string
	S3AccessKeyID              string
	S3SecretAccessKey          string
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

	arbiterBiddingDuration, err := durationValue("ARBITER_BIDDING_DURATION", defaultArbiterBiddingDuration)
	if err != nil {
		return Config{}, err
	}
	arbiterAcceptanceDuration, err := durationValue("ARBITER_ACCEPTANCE_DURATION", defaultArbiterAcceptanceDuration)
	if err != nil {
		return Config{}, err
	}
	arbiterSettlementDuration, err := durationValue("ARBITER_SETTLEMENT_DURATION", defaultArbiterSettlementDuration)
	if err != nil {
		return Config{}, err
	}
	if arbiterAcceptanceDuration <= 0 || arbiterAcceptanceDuration%time.Second != 0 ||
		arbiterSettlementDuration <= 0 || arbiterSettlementDuration%time.Second != 0 {
		return Config{}, fmt.Errorf("Arbiter acceptance and settlement durations must be positive whole seconds")
	}
	arbiterCoordinatorURL := strings.TrimRight(strings.TrimSpace(os.Getenv("ARBITER_COORDINATOR_URL")), "/")
	arbiterCoordinatorToken := strings.TrimSpace(os.Getenv("ARBITER_COORDINATOR_TOKEN"))
	arbiterPaymentToken := strings.TrimSpace(os.Getenv("ARBITER_PAYMENT_TOKEN"))
	configuredCoordinatorValues := 0
	for _, value := range []string{arbiterCoordinatorURL, arbiterCoordinatorToken, arbiterPaymentToken} {
		if value != "" {
			configuredCoordinatorValues++
		}
	}
	if configuredCoordinatorValues != 0 && configuredCoordinatorValues != 3 {
		return Config{}, fmt.Errorf("ARBITER_COORDINATOR_URL, ARBITER_COORDINATOR_TOKEN, and ARBITER_PAYMENT_TOKEN must be configured together")
	}
	if arbiterCoordinatorURL != "" {
		parsed, err := url.Parse(arbiterCoordinatorURL)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return Config{}, fmt.Errorf("ARBITER_COORDINATOR_URL must be an absolute HTTP(S) URL")
		}
		if len(arbiterCoordinatorToken) < 32 {
			return Config{}, fmt.Errorf("ARBITER_COORDINATOR_TOKEN must contain at least 32 characters")
		}
	}
	arbiterMaxBidsValue, err := int64Value("ARBITER_MAX_BIDS", defaultArbiterMaxBids)
	if err != nil || arbiterMaxBidsValue < 1 || arbiterMaxBidsValue > 256 {
		return Config{}, fmt.Errorf("ARBITER_MAX_BIDS must be between 1 and 256")
	}
	if arbiterBiddingDuration <= 0 || arbiterBiddingDuration%time.Second != 0 {
		return Config{}, fmt.Errorf("ARBITER_BIDDING_DURATION must be a positive whole number of seconds")
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
		Environment:                environment,
		Port:                       valueOrDefault("PORT", defaultPort),
		DatabasePath:               valueOrDefault("DATABASE_PATH", defaultDatabasePath),
		StarknetRPCURL:             strings.TrimSpace(os.Getenv("STARKNET_RPC_URL")),
		StarknetChainID:            valueOrDefault("STARKNET_CHAIN_ID", defaultStarknetChainID),
		ToriiURL:                   toriiURL,
		ToriiStakingPoolAddress:    strings.TrimSpace(os.Getenv("TORII_STAKING_POOL_ADDRESS")),
		MaxImageBytes:              maxImageBytes,
		ChallengeTTL:               challengeTTL,
		SessionTTL:                 sessionTTL,
		ArbiterBiddingDuration:     arbiterBiddingDuration,
		ArbiterAcceptanceDuration:  arbiterAcceptanceDuration,
		ArbiterSettlementDuration:  arbiterSettlementDuration,
		ArbiterCoordinatorURL:      arbiterCoordinatorURL,
		ArbiterCoordinatorToken:    arbiterCoordinatorToken,
		ArbiterPaymentToken:        arbiterPaymentToken,
		ArbiterReservePrice:        valueOrDefault("ARBITER_RESERVE_PRICE", defaultArbiterReservePrice),
		ArbiterMaxBids:             uint32(arbiterMaxBidsValue),
		ArbiterWinnerPayloadDomain: valueOrDefault("ARBITER_WINNER_PAYLOAD_DOMAIN", defaultArbiterWinnerPayloadDomain),
		AllowedOrigins:             origins,
		ControlSystemAddress:       strings.TrimSpace(os.Getenv("CONTROL_SYSTEM_ADDRESS")),
		ImageBucket:                imageBucket,
		ImagePublicURL:             imagePublicURL,
		S3Endpoint:                 s3Endpoint,
		S3Region:                   valueOrDefault("AWS_REGION", "auto"),
		S3AccessKeyID:              s3AccessKeyID,
		S3SecretAccessKey:          s3SecretAccessKey,
	}, nil
}

func (c Config) ArbiterCoordinatorEnabled() bool {
	return c.ArbiterCoordinatorURL != ""
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
