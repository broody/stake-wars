#!/bin/sh
set -eu

# Fly Volumes are mounted as root. Give the application ownership of the mount
# before dropping privileges so SQLite can create its database and WAL files.
chown stakewars:stakewars /data
install -d -o stakewars -g stakewars "${TORII_DB_DIR:-/data/torii}"

exec gosu stakewars "$@"
