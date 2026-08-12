package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestToriiGatewayProxiesGraphQLAndBlocksSQL(t *testing.T) {
	var receivedPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Torii-Host", "internal-machine")
		_, _ = w.Write([]byte(`{"data":{"ok":true}}`))
	}))
	defer upstream.Close()

	gateway, err := NewToriiGateway(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}

	graphqlRequest := httptest.NewRequest(http.MethodPost, "/torii/graphql", strings.NewReader(`{"query":"query { models { totalCount } }"}`))
	graphqlResponse := httptest.NewRecorder()
	gateway.ServeHTTP(graphqlResponse, graphqlRequest)
	if graphqlResponse.Code != http.StatusOK || receivedPath != "/graphql" {
		t.Fatalf("unexpected GraphQL proxy response %d at %q", graphqlResponse.Code, receivedPath)
	}
	if value := graphqlResponse.Header().Get("X-Torii-Host"); value != "" {
		t.Fatalf("internal Torii host leaked through proxy: %q", value)
	}

	receivedPath = ""
	sqlRequest := httptest.NewRequest(http.MethodPost, "/torii/sql", nil)
	sqlResponse := httptest.NewRecorder()
	gateway.ServeHTTP(sqlResponse, sqlRequest)
	if sqlResponse.Code != http.StatusNotFound {
		t.Fatalf("expected SQL to be blocked, got %d", sqlResponse.Code)
	}
	if receivedPath != "" {
		t.Fatalf("SQL request reached Torii at %q", receivedPath)
	}
}

func TestToriiGatewayReadiness(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Fatalf("unexpected readiness path %q", r.URL.Path)
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer upstream.Close()

	gateway, err := NewToriiGateway(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	if err := gateway.Ready(context.Background()); err == nil {
		t.Fatal("expected unhealthy Torii to fail readiness")
	}
}
