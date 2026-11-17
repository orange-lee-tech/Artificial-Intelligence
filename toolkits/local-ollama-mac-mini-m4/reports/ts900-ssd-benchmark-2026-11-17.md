# TS900 SSD Benchmark — 2026-11-17

**Host:** Mac mini M4, 16 GiB unified memory, macOS 26.2  
**Volume:** /Volumes/SSD — external USB, APFS  
**Device:** disk7s1, whole disk disk7  
**Gate:** G5 — PRECHECK PASS; first run recorded as PRELIMINARY / NOT VALIDATED; corrected non-zero-data rerun required

## 1. Read-only preflight

User-provided inspection:

| Property | Observed value |
|---|---|
| Capacity | 1,023,999,787,008 bytes (~1.0 TB) |
| Filesystem | APFS |
| df available before benchmark | 946 GiB |
| Device location / protocol | External / USB |
| Solid state | Yes |
| Read-only | No |
| SMART | Not Supported |
| dd / iostat | Available |
| fio | Not installed |
| Workspace and model store | Present |

No files were written or removed during preflight.

## 2. First benchmark run — preserve raw output, treat as provisional

The initial script completed a 24 GiB test and verified cleanup. It used dd if=/dev/zero to create the test file. User-provided measurements:

| Metric | Result |
|---|---:|
| Sequential write + sync | 27.020 s |
| Reported sequential write | 909.5 MiB/s |
| Sequential read with F_NOCACHE | 29.503 s |
| Reported sequential read | 833.0 MiB/s |
| 4 KiB random read | 5,741.3 IOPS |
| 4 KiB average / P50 / P95 | 0.174 / 0.212 / 0.250 ms |
| 64 KiB random read | 2,997.0 IOPS |
| 64 KiB average / P50 / P95 | 0.333 / 0.395 / 0.457 ms |

Cleanup was explicitly confirmed. Available capacity returned to 946 GiB; the test temporary directory and file were removed. No model directory or model blob was touched.

**Validity limitation:** the file contained only zero bytes. For an APFS benchmark, zero-filled test data is not sufficiently representative and may be affected by filesystem-level zero/sparse/compression optimizations. The script did not inspect physical allocation (st_blocks) or verify non-zero entropy. Consequently:
- retain these numbers as raw first-run observations only;
- do not cite them as validated physical SSD throughput or as evidence of Expert Streaming suitability;
- the random-read numbers are also from the zero-filled file and require rerun.

## 3. Corrected benchmark implementation

The script at [scripts/mac/benchmark-ts900.sh](../scripts/mac/benchmark-ts900.sh) has been revised after the first run:

- uses /dev/urandom instead of /dev/zero to create non-zero, high-entropy data;
- measures a 1 GiB random-source-to-/dev/null ceiling check;
- writes a 24 GiB test file and runs sync;
- checks logical file size and allocated blocks via st_blocks, requiring at least 95% allocation before trusting read results;
- enables Darwin F_NOCACHE for sequential and random reads, and aborts if that fails;
- retains 4 KiB and 64 KiB random-read tests;
- keeps the same mount/free-space/Ollama-residency guards and removes only its own temporary file/directory.

The write measurement includes random-data generation and sync; compare it with the random-source ceiling check when interpreting the result. If random-source generation is slower than the storage path, the write figure is a lower bound for the SSD rather than a pure device write speed.

## 4. Required next run

1. Confirm ollama ps is empty.
2. Download the updated script from branch pacs/local-model-toolkit-m4-16gb (do not reuse an older local copy).
3. Run bash -n and execute it.
4. Preserve the random-source throughput, write+sync, allocated fraction, sequential cache-bypass read, random IOPS/latency, and cleanup output.
5. Update this report with the rerun results and compare against the first-run observations.

## 5. Interpretation boundary

Even a validated sequential/random benchmark is only a storage-device characterization. It does not by itself establish MoE Expert Streaming compatibility or model-level tokens/s. Actual performance depends on expert tensor sizes/layout, runtime read scheduling, prefetch, cache hit rate, page alignment, concurrency, and CPU/GPU execution overlap. The selected runtime must be tested with the exact model architecture/checkpoint.

**No model files were deleted, no large model was downloaded, and no production configuration was changed.**
