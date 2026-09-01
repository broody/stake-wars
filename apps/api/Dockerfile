FROM golang:1.25-alpine AS build

WORKDIR /src

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
        -o /out/stakewars-api ./cmd/server \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
        -o /out/stakewars-beacon-backfill ./cmd/beacon-backfill \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
        -o /out/stakewars-beacon-round-repair ./cmd/beacon-round-repair \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
        -o /out/stakewars-beacon-bootstrap ./cmd/beacon-bootstrap

FROM alpine:3.22 AS torii-download

ARG TARGETARCH
ARG TORII_VERSION=1.8.16
ARG TORII_AMD64_SHA256=ab25b4667c6a91ca73efdbd3fec62440acdf7212b5b91b0e1333c6a92c573219
ARG TORII_ARM64_SHA256=aa0b3a66fc393c2269a264d0eb965704f9be1ee6114b8a5d8ff4b029c59d9005

RUN apk add --no-cache ca-certificates curl \
    && case "$TARGETARCH" in \
        amd64) torii_arch="amd64"; torii_sha="$TORII_AMD64_SHA256" ;; \
        arm64) torii_arch="arm64"; torii_sha="$TORII_ARM64_SHA256" ;; \
        *) echo "Unsupported Torii architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --silent --show-error \
        --output /tmp/torii.tar.gz \
        "https://github.com/dojoengine/torii/releases/download/v${TORII_VERSION}/torii_v${TORII_VERSION}_linux_${torii_arch}.tar.gz" \
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
COPY --from=build /out/stakewars-beacon-backfill /usr/local/bin/stakewars-beacon-backfill
COPY --from=build /out/stakewars-beacon-round-repair /usr/local/bin/stakewars-beacon-round-repair
COPY --from=build /out/stakewars-beacon-bootstrap /usr/local/bin/stakewars-beacon-bootstrap
COPY --from=torii-download /out/torii /usr/local/bin/torii
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --chmod=0755 stakewars-runtime.sh /usr/local/bin/stakewars-runtime

EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "-s", "--", "docker-entrypoint.sh"]
CMD ["stakewars-runtime"]
