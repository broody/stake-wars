FROM golang:1.25-alpine AS build

WORKDIR /src

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/stakewars-api \
    ./cmd/server

FROM alpine:3.22

RUN apk add --no-cache ca-certificates su-exec \
    && addgroup -S stakewars \
    && adduser -S -G stakewars stakewars \
    && mkdir -p /data \
    && chown stakewars:stakewars /data

COPY --from=build /out/stakewars-api /usr/local/bin/stakewars-api
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["stakewars-api"]
