#!/usr/bin/env bash
# Build a Flutter release APK that talks to a chosen backend from a real Android device.
#
# Usage (from repo root, on WSL):
#   REMOTE=local ./scripts/build-android-lan-apk.sh
#   REMOTE=prod ./scripts/build-android-lan-apk.sh
#   ./scripts/build-android-lan-apk.sh                    # same as REMOTE=local
#   LH_BACKEND_URL=http://192.168.1.10:3000 ./scripts/build-android-lan-apk.sh
#   LH_LAN_HOST=192.168.1.10 LH_BACKEND_PORT=3000 ./scripts/build-android-lan-apk.sh
#
# REMOTE:
#   local — this machine's LAN IP (auto-detect or LH_LAN_HOST / LH_BACKEND_URL)
#   prod  — production HTTPS origin (WebSocket + HTTP on tlh.wdigitallabs.com)
#
# LH_BACKEND_URL always wins when set (any REMOTE).
# Override the prod default with LH_PROD_BACKEND_URL if needed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="${ROOT}/apps/mobile"
DEFAULT_PORT=3000
DEFAULT_PROD_BACKEND_URL="https://tlh.wdigitallabs.com"
REMOTE="${REMOTE:-local}"

fail() {
  echo "mobile:apk:lan: $*" >&2
  exit 1
}

is_wsl() {
  grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null
}

is_loopback() {
  case "$1" in
    127.*|::1) return 0 ;;
    *) return 1 ;;
  esac
}

# Prefer Wi-Fi/LAN (192.168 / 10) over Docker/WSL virtual ranges.
score_ip() {
  local ip="$1"
  if is_loopback "$ip"; then
    echo -100
    return
  fi
  case "$ip" in
    192.168.*) echo 100 ;;
    10.*) echo 80 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[0-1].*)
      case "$ip" in
        172.17.*|172.18.*|172.19.*) echo 10 ;;
        *) echo 40 ;;
      esac
      ;;
    *) echo 0 ;;
  esac
}

read_port_from_env_files() {
  # Prefer compose publish port (BACKEND_PORT) over Nest listen PORT so LAN APKs
  # target Docker apps (e.g. 3010) instead of the in-container/host default 3000.
  local file line value
  for file in \
    "${ROOT}/infra/local/.env" \
    "${ROOT}/apps/backend/.env"; do
    [[ -f "$file" ]] || continue
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%%#*}"
      line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      [[ -z "$line" ]] && continue
      case "$line" in
        BACKEND_PORT=*)
          value="${line#*=}"
          value="${value%\"}"
          value="${value#\"}"
          value="${value%\'}"
          value="${value#\'}"
          if [[ "$value" =~ ^[0-9]+$ ]] && ((value > 0 && value < 65536)); then
            echo "$value"
            return 0
          fi
          ;;
      esac
    done <"$file"
  done
  for file in \
    "${ROOT}/apps/backend/.env" \
    "${ROOT}/infra/local/.env"; do
    [[ -f "$file" ]] || continue
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%%#*}"
      line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      [[ -z "$line" ]] && continue
      case "$line" in
        PORT=*)
          value="${line#*=}"
          value="${value%\"}"
          value="${value#\"}"
          value="${value%\'}"
          value="${value#\'}"
          if [[ "$value" =~ ^[0-9]+$ ]] && ((value > 0 && value < 65536)); then
            echo "$value"
            return 0
          fi
          ;;
      esac
    done <"$file"
  done
  echo "$DEFAULT_PORT"
}

collect_linux_ips() {
  ip -4 -o addr show scope global 2>/dev/null \
    | awk '{print $4}' \
    | cut -d/ -f1 \
    || true
}

collect_windows_lan_ips() {
  if ! is_wsl || ! command -v powershell.exe >/dev/null 2>&1; then
    return 0
  fi
  powershell.exe -NoProfile -Command \
    "Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        \$_.IPAddress -notlike '127.*' -and
        \$_.IPAddress -notlike '169.254.*' -and
        \$_.PrefixOrigin -ne 'WellKnown'
      } | Select-Object -ExpandProperty IPAddress" 2>/dev/null \
    | tr -d '\r' \
    | sed '/^$/d' \
    || true
}

pick_best_host() {
  local best="" best_score=-1 ip score
  while IFS= read -r ip; do
    [[ -z "$ip" ]] && continue
    [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
    score="$(score_ip "$ip")"
    if ((score > best_score)); then
      best_score="$score"
      best="$ip"
    fi
  done
  if ((best_score > 0)); then
    echo "$best"
  fi
}

wsl_guest_ip() {
  collect_linux_ips | while IFS= read -r ip; do
    case "$ip" in
      172.*) echo "$ip" ;;
    esac
  done | pick_best_host
}

normalize_remote() {
  local value
  value="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    local|prod) echo "$value" ;;
    *) fail "REMOTE must be 'local' or 'prod' (got: ${1:-})" ;;
  esac
}

resolve_backend_url() {
  REMOTE="$(normalize_remote "$REMOTE")"

  if [[ -n "${LH_BACKEND_URL:-}" ]]; then
    BACKEND_URL="${LH_BACKEND_URL%/}"
    DETECT_SOURCE="LH_BACKEND_URL (REMOTE=${REMOTE})"
    DETECT_HOST=""
    DETECT_PORT=""
    return 0
  fi

  if [[ "$REMOTE" == "prod" ]]; then
    BACKEND_URL="${LH_PROD_BACKEND_URL:-$DEFAULT_PROD_BACKEND_URL}"
    BACKEND_URL="${BACKEND_URL%/}"
    DETECT_SOURCE="REMOTE=prod"
    DETECT_HOST=""
    DETECT_PORT=""
    return 0
  fi

  local port="${LH_BACKEND_PORT:-${PORT:-}}"
  if [[ -z "$port" ]]; then
    port="$(read_port_from_env_files)"
  fi
  if ! [[ "$port" =~ ^[0-9]+$ ]] || ((port <= 0 || port >= 65536)); then
    fail "invalid backend port: ${port}"
  fi

  local host="${LH_LAN_HOST:-}"
  local source
  if [[ -n "$host" ]]; then
    source="LH_LAN_HOST"
  else
    host="$(
      {
        collect_windows_lan_ips
        collect_linux_ips
      } | pick_best_host
    )"
    source="auto-detect"
  fi

  if [[ -z "$host" ]]; then
    fail "could not detect a LAN host. Set LH_BACKEND_URL or LH_LAN_HOST."
  fi
  if is_loopback "$host"; then
    fail "refusing loopback host ${host}. Set LH_LAN_HOST to this machine's Wi-Fi/LAN IP."
  fi

  BACKEND_URL="http://${host}:${port}"
  DETECT_SOURCE="REMOTE=local (${source})"
  DETECT_HOST="$host"
  DETECT_PORT="$port"
}

print_notes() {
  echo
  echo "Device backend URL baked into APK:"
  echo "  ${BACKEND_URL}  (${DETECT_SOURCE})"
  echo

  if [[ "$REMOTE" == "prod" ]] && [[ -z "${LH_BACKEND_URL:-}" ]]; then
    echo "Production target:"
    echo "  HTTPS API + WebSocket on ${BACKEND_URL}"
    echo "  (override with LH_PROD_BACKEND_URL or LH_BACKEND_URL)"
    return 0
  fi

  echo "REQUIRED before the phone can connect (otherwise: service unavailable):"
  echo "  1. Phone and this PC on the same Wi-Fi/LAN."
  echo "  2. Backend listening on 0.0.0.0 (Nest default), not loopback-only."
  echo "  3. If using Docker apps profile, set BIND_HOST=0.0.0.0 in infra/local/.env"
  echo "     (Redis will also be published; local-dev only)."

  if is_wsl && [[ -n "${DETECT_HOST:-}" ]] && [[ ! "$DETECT_HOST" =~ ^172\. ]]; then
    local guest
    guest="$(wsl_guest_ip || true)"
    if [[ -n "${DETECT_PORT:-}" ]]; then
      echo
      echo "  4. WSL2 REQUIRED: APK targets the Windows LAN IP. Run once in elevated PowerShell:"
      echo "     # Docker apps (BIND_HOST=127.0.0.1): forward LAN → Windows loopback publish port"
      echo "     netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=${DETECT_PORT} connectaddress=127.0.0.1 connectport=${DETECT_PORT}"
      if [[ -n "$guest" ]]; then
        echo "     # Host Nest on WSL (not Docker): use guest IP instead of 127.0.0.1"
        echo "     # netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=${DETECT_PORT} connectaddress=${guest} connectport=${DETECT_PORT}"
      fi
      echo "     New-NetFirewallRule -DisplayName \"LH backend ${DETECT_PORT}\" -Direction Inbound -Protocol TCP -LocalPort ${DETECT_PORT} -Action Allow"
      echo
      echo "  Verify from WSL that Nest answers locally:"
      if command -v curl >/dev/null 2>&1; then
        if curl -sS -o /dev/null --connect-timeout 2 "http://127.0.0.1:${DETECT_PORT}/" || \
           curl -sS -o /dev/null --connect-timeout 2 "http://127.0.0.1:${DETECT_PORT}/health" || \
           true; then
          if timeout 2 bash -c "echo >/dev/tcp/127.0.0.1/${DETECT_PORT}" 2>/dev/null; then
            echo "     TCP ${DETECT_PORT} on 127.0.0.1: OPEN"
          else
            echo "     TCP ${DETECT_PORT} on 127.0.0.1: CLOSED — start the backend before installing."
          fi
        fi
      elif timeout 2 bash -c "echo >/dev/tcp/127.0.0.1/${DETECT_PORT}" 2>/dev/null; then
        echo "     TCP ${DETECT_PORT} on 127.0.0.1: OPEN"
      else
        echo "     TCP ${DETECT_PORT} on 127.0.0.1: CLOSED — start the backend before installing."
      fi
    fi
  fi
}

[[ -f "${MOBILE}/pubspec.yaml" ]] || fail "Flutter app not found at ${MOBILE}"
command -v flutter >/dev/null 2>&1 || fail "flutter not found on PATH"

resolve_backend_url
print_notes

echo
echo "Building release APK…"
(
  cd "$MOBILE"
  flutter build apk --release --dart-define="LH_BACKEND_URL=${BACKEND_URL}"
)

APK="${MOBILE}/build/app/outputs/flutter-apk/app-release.apk"
echo
echo "APK ready:"
echo "  ${APK}"
echo "  Install: adb install -r \"${APK}\""
echo "  Backend: ${BACKEND_URL}"
