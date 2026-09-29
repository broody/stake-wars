FROM golang:1.25-alpine AS build

WORKDIR /src

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
        -o /out/stakewars-api ./cmd/server \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
        -o /out/stakewars-transaction-history ./cmd/transaction-history

FROM alpine:3.22 AS torii-download

ARG TARGETARCH
# Torii v1.8.16 with the graphql/integration fixes (query limits, schema
# hot-swap, batched lookups), published from broody/torii. Only amd64 is built.
ARG TORII_REPOSITORY=broody/torii
ARG TORII_VERSION=1.8.16-stakewars.1
ARG TORII_AMD64_SHA256=824520efacc9bfb0aac49087ae70917ad813f0a28c58c9ec3e483307620dd7f0

RUN apk add --no-cache ca-certificates curl \
    && case "$TARGETARCH" in \
        amd64) torii_arch="amd64"; torii_sha="$TORII_AMD64_SHA256" ;; \
        *) echo "No Torii ${TORII_VERSION} build for architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --silent --show-error \
        --output /tmp/torii.tar.gz \
        "https://github.com/${TORII_REPOSITORY}/releases/download/v${TORII_VERSION}/torii_v${TORII_VERSION}_linux_${torii_arch}.tar.gz" \
    && echo "$torii_sha  /tmp/torii.tar.gz" | sha256sum -c - \
    && mkdir -p /out \
    && tar -xzf /tmp/torii.tar.gz -C /out \
    && chmod 0755 /out/torii

FROM debian:trixie-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends bash ca-certificates gosu tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system stakewars \
    && useradd --system --gid stakewars --home-dir /nonexistent --shell /usr/sbin/nologin stakewars \
    && install -d -o stakewars -g stakewars /data /data/torii

COPY --from=build /out/stakewars-api /usr/local/bin/stakewars-api
COPY --from=build /out/stakewars-transaction-history /usr/local/bin/stakewars-transaction-history
COPY --from=torii-download /out/torii /usr/local/bin/torii
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --chmod=0755 stakewars-runtime.sh /usr/local/bin/stakewars-runtime

EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "-s", "--", "docker-entrypoint.sh"]
CMD ["stakewars-runtime"]
