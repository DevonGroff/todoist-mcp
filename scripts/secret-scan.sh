#!/usr/bin/env bash

set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks is required. Install it from https://github.com/gitleaks/gitleaks, then rerun npm run secrets:scan."
  exit 127
fi

gitleaks detect \
  --source . \
  --config .gitleaks.toml \
  --redact \
  --verbose
