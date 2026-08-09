package config

import "testing"

func TestLoadUsesConfigurableImageLimit(t *testing.T) {
	t.Setenv("MAX_IMAGE_BYTES", "4194304")
	t.Setenv("APP_ENV", "production")

	configuration, err := Load()
	if err != nil {
		t.Fatal(err)
	}

	if configuration.MaxImageBytes != 4*1024*1024 {
		t.Fatalf("expected 4 MiB, got %d", configuration.MaxImageBytes)
	}
	if len(configuration.AllowedOrigins) != 2 {
		t.Fatalf("expected production origins only, got %v", configuration.AllowedOrigins)
	}
}

func TestLoadRejectsInvalidImageLimit(t *testing.T) {
	t.Setenv("MAX_IMAGE_BYTES", "0")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid image limit to fail")
	}
}

func TestLoadParsesAllowedOrigins(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "https://one.example, https://two.example")

	configuration, err := Load()
	if err != nil {
		t.Fatal(err)
	}

	if got := len(configuration.AllowedOrigins); got != 2 {
		t.Fatalf("expected 2 origins, got %d", got)
	}
}
