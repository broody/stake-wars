package api

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

const maxToriiHealthBodyBytes = 4 * 1024

// ToriiGateway exposes only Torii's GraphQL and health endpoints. In
// particular, Torii's raw SQL endpoint is never reachable through the API.
type ToriiGateway struct {
	target     *url.URL
	proxy      http.Handler
	httpClient *http.Client
}

// NewToriiGateway configures a same-machine reverse proxy to Torii.
func NewToriiGateway(rawURL string) (*ToriiGateway, error) {
	if strings.TrimSpace(rawURL) == "" {
		return nil, nil
	}

	target, err := url.Parse(rawURL)
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		return nil, fmt.Errorf("invalid Torii URL")
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ModifyResponse = func(response *http.Response) error {
		response.Header.Del("X-Torii-Host")
		response.Header.Del("Access-Control-Allow-Origin")
		response.Header.Del("Access-Control-Allow-Credentials")
		response.Header.Del("Access-Control-Expose-Headers")
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		slog.Error("Torii proxy failed", "error", err)
		writeProblem(w, http.StatusBadGateway, "Torii unavailable", "Torii could not serve the request")
	}

	return &ToriiGateway{
		target:     target,
		proxy:      http.StripPrefix("/torii", proxy),
		httpClient: &http.Client{Timeout: 2 * time.Second},
	}, nil
}

func (g *ToriiGateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/torii/graphql", "/torii/health":
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			g.proxy.ServeHTTP(deadlineClearingResponseWriter{ResponseWriter: w}, r)
			return
		}
		g.proxy.ServeHTTP(w, r)
	default:
		writeProblem(w, http.StatusNotFound, "not found", "Torii endpoint is not exposed")
	}
}

// deadlineClearingResponseWriter removes the API server's request deadlines
// after a WebSocket connection is hijacked, allowing long-lived GraphQL
// subscriptions while retaining normal HTTP timeouts for API requests.
type deadlineClearingResponseWriter struct {
	http.ResponseWriter
}

func (w deadlineClearingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	connection, buffered, err := http.NewResponseController(w.ResponseWriter).Hijack()
	if err != nil {
		return nil, nil, err
	}
	if err := connection.SetDeadline(time.Time{}); err != nil {
		_ = connection.Close()
		return nil, nil, err
	}
	return connection, buffered, nil
}

// Ready verifies that Torii's HTTP service is responding successfully.
func (g *ToriiGateway) Ready(ctx context.Context) error {
	healthURL := *g.target
	healthURL.Path = strings.TrimRight(healthURL.Path, "/") + "/health"
	healthURL.RawQuery = ""

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL.String(), nil)
	if err != nil {
		return err
	}
	response, err := g.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxToriiHealthBodyBytes))

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("Torii health returned HTTP %d", response.StatusCode)
	}
	return nil
}
