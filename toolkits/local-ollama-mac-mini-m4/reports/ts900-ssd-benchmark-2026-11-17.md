# TS900 SSD Benchmark — Preflight

**Date:** 2026-11-17  
**Host:** Mac mini M4, 16 GiB unified memory, macOS 26.2  
**Volume:** `/Volumes/SSD`  
**Gate:** G5 — PRECHECK PASS; throughput tests NOT YET RUN

## User-provided read-only inspection

| Property | Observed value |
|---|---|
| Device identifier | `disk7s1` |
| Whole disk | `disk7` |
| Volume name | `SSD` |
| Mount point | `/Volumes/SSD` |
| Device location | External |
| Protocol | USB |
| Solid state | Yes |
| Capacity | 1,023,999,787,008 bytes (~1.0 TB) |
| Filesystem | APFS |
| APFS container free | 1,015,381,737,472 bytes |
| `df` available | 946 GiB |
| Volume used | 8.4 GB |
| Read-only | No |
| SMART | Not Supported |
| `dd` | `/bin/dd` available |
| `iostat` | `/usr/sbin/iostat` available |
| `fio` | Not found |
| Workspace | `/Volumes/SSD/AI-Workspace` exists |
| Model store | `/Volumes/SSD/AI-Workspace/models` exists |

## Interpretation

- The external APFS SSD is mounted and reports sufficient free space for a bounded temporary-file benchmark.
- SMART being unavailable through this USB device path is not evidence of drive failure; health telemetry cannot be assessed from this output.
- No benchmark has been run yet. No files were written, modified, or deleted during preflight.
- Do not install fio solely for this initial test. Use native tools and a dedicated temporary directory outside the model-store directory.
- A sequential test file larger than the host's 16 GiB unified memory, combined with cache-bypassing reads where supported, reduces the risk of reporting memory-cache throughput as SSD throughput.
- The benchmark should include sequential write/read and bounded random 4 KiB / 64 KiB reads, with exact test-file cleanup limited to the directory created by the test.

## Planned safe test

1. Recheck mount point and available capacity immediately before writing.
2. Create one uniquely named temporary directory under `AI-Workspace`, not under `models`.
3. Use a 24 GiB test file; write it, flush it, then read it with file caching disabled using macOS `F_NOCACHE` if available.
4. Run bounded random-read samples against the same test file.
5. Record elapsed time, throughput, IOPS/latency, and `iostat` observations if available.
6. Remove only the exact temporary directory created by the benchmark and confirm free space returns.

**No benchmark result, sustained-throughput claim, or expert-streaming suitability conclusion is established by this preflight.**
