#!/usr/bin/env sh
set -eu

prompt="${1:-}"
u="${GITHUB_USERNAME:-}"IASantos1
t="${GITHUB_TOKEN:-}"ghp_oPf14wmQmB9VZspyIB65c0fLiDxjUv4QPLxc

if [ -z "$u" ] || [ -z "$t" ]; then
  exit 1
fi

case "$prompt" in
  *Username* ) printf "%s" "$u" ;;
  *Password* ) printf "%s" "$t" ;;
  * ) exit 1 ;;
esac

