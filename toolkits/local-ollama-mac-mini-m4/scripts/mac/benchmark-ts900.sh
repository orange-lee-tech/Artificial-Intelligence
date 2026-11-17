#!/bin/bash
set -euo pipefail

VOL="/Volumes/SSD"
WORK="$VOL/AI-Workspace"
MODEL_DIR="$WORK/models"
TEST_DIR=""
TEST_FILE=""

cleanup() {
  if [ -n "${TEST_FILE:-}" ] && [ -f "$TEST_FILE" ]; then
    rm -f "$TEST_FILE"
  fi
  if [ -n "${TEST_DIR:-}" ] && [ -d "$TEST_DIR" ]; then
    rmdir "$TEST_DIR" 2>/dev/null || echo "Cleanup note: temporary directory remains: $TEST_DIR"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ ! -d "$WORK" ] || [ ! -d "$MODEL_DIR" ]; then
  echo "ERROR: expected workspace/model directory missing; refusing to write."
  exit 1
fi
if ! mount | grep -F "on $VOL (" | grep -q 'apfs'; then
  echo "ERROR: $VOL is not mounted as APFS; refusing to write."
  exit 1
fi

FREE_KB=$(df -Pk "$VOL" | awk 'NR==2 {print $4}')
if ! [[ "$FREE_KB" =~ ^[0-9]+$ ]] || [ "$FREE_KB" -lt $((40 * 1024 * 1024)) ]; then
  echo "ERROR: less than 40 GiB free or unable to determine free space; refusing to write."
  exit 1
fi

if command -v ollama >/dev/null 2>&1; then
  OLLAMA_PS=$(ollama ps 2>/dev/null || true)
  if printf '%s\n' "$OLLAMA_PS" | awk 'NR>1 && NF {found=1} END {exit !found}'; then
    echo "ERROR: an Ollama model is still resident. Stop the active model, verify 'ollama ps' is empty, then rerun."
    printf '%s\n' "$OLLAMA_PS"
    exit 1
  fi
fi

TEST_DIR=$(mktemp -d "$WORK/.pacs-ts900-bench.XXXXXX")
TEST_FILE="$TEST_DIR/seq-24GiB.bin"

echo "========== TS900 BENCHMARK =========="
echo "Volume: $VOL"
echo "Temporary directory: $TEST_DIR"
echo "Test file: $TEST_FILE"
echo "Test size: 24 GiB"
echo "Free space before test:"
df -h "$VOL"
echo

python3 - "$TEST_FILE" <<'PY'
import fcntl
import os
import random
import subprocess
import sys
import time

path = sys.argv[1]
size = 24 * 1024**3
mib = 1024**2

print("========== SEQUENTIAL WRITE + FLUSH ==========")
t0 = time.perf_counter()
subprocess.run(["/bin/dd", "if=/dev/zero", f"of={path}", "bs=8m", "count=3072"], check=True)
subprocess.run(["/bin/sync"], check=True)
write_s = time.perf_counter() - t0
print(f"write_size_GiB: {size / 1024**3:.2f}")
print(f"write_plus_sync_seconds: {write_s:.3f}")
print(f"write_plus_sync_MiB_s: {size / mib / write_s:.1f}")

actual = os.stat(path).st_size
if actual != size:
    raise SystemExit(f"ERROR: test file size mismatch: expected {size}, got {actual}")

print("\n========== SEQUENTIAL READ (CACHE BYPASS) ==========")
fd = os.open(path, os.O_RDONLY)
try:
    # Darwin F_NOCACHE = 48. Refuse to report a potentially cache-inflated read result.
    try:
        fcntl.fcntl(fd, 48, 1)
    except OSError as exc:
        raise SystemExit(f"ERROR: macOS F_NOCACHE could not be enabled; read benchmark aborted: {exc}")

    t0 = time.perf_counter()
    total = 0
    while True:
        chunk = os.read(fd, 8 * mib)
        if not chunk:
            break
        total += len(chunk)
    read_s = time.perf_counter() - t0
    if total != size:
        raise SystemExit(f"ERROR: short sequential read: expected {size}, got {total}")
    print(f"read_size_GiB: {total / 1024**3:.2f}")
    print(f"read_seconds: {read_s:.3f}")
    print(f"read_MiB_s: {total / mib / read_s:.1f}")

    def random_read(block_size, operations=10000):
        rng = random.Random(20261117 + block_size)
        slots = size // block_size
        latencies = []
        total_bytes = 0
        t0 = time.perf_counter()
        for _ in range(operations):
            offset = rng.randrange(slots) * block_size
            t1 = time.perf_counter_ns()
            data = os.pread(fd, block_size, offset)
            elapsed_ns = time.perf_counter_ns() - t1
            if len(data) != block_size:
                raise SystemExit(f"ERROR: short random read at offset {offset}")
            latencies.append(elapsed_ns / 1e6)
            total_bytes += len(data)
        wall_elapsed = time.perf_counter() - t0
        latency_sum = sum(latencies)
        ordered = sorted(latencies)
        p50 = ordered[len(ordered) // 2]
        p95 = ordered[int(len(ordered) * 0.95) - 1]
        iops = operations / wall_elapsed
        print(f"block_size_KiB: {block_size / 1024:.0f}")
        print(f"operations: {operations}")
        print(f"iops: {iops:.1f}")
        print(f"avg_latency_ms: {latency_sum / operations:.3f}")
        print(f"p50_latency_ms: {p50:.3f}")
        print(f"p95_latency_ms: {p95:.3f}")
        print(f"payload_MiB: {total_bytes / mib:.1f}")
        print()

    print("\n========== RANDOM READ (CACHE BYPASS) ==========")
    random_read(4 * 1024)
    random_read(64 * 1024)
finally:
    os.close(fd)
PY

cleanup
TEST_FILE=""
TEST_DIR=""
trap - EXIT

echo
echo "========== CLEANUP VERIFIED =========="
echo "Temporary benchmark file and directory removed."
df -h "$VOL"
echo "========== END =========="
