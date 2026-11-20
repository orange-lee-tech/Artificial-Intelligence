# TS900 SSD Benchmark — 2026-11-17

**Host:** Mac mini M4, 16 GiB unified memory, macOS 26.2  
**Volume:** /Volumes/SSD — external USB, APFS  
**Device:** disk7s1, whole disk disk7  
**Gate:** G5 — VALID NON-ZERO-DATA SINGLE-RUN BASELINE CAPTURED; repeated/sustained/thermal characterization NOT TESTED

## 1. Read-only preflight

User-provided inspection:

| Property | Observed value |
|---|---|
| Capacity | 1,023,999,787,008 bytes (~1.0 TB) |
| Filesystem | APFS |
| df available before and after test | 946 GiB |
| Device location / protocol | External / USB |
| Solid state | Yes |
| Read-only | No |
| SMART | Not Supported |
| dd / iostat | Available |
| fio | Not installed |
| Workspace and model store | Present |

No files were written or removed during preflight.

## 2. First benchmark run — provisional only

The initial 24 GiB test used dd if=/dev/zero. Raw user-provided results:

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

Cleanup was explicitly confirmed and available capacity returned to 946 GiB. Because the file contained only zero bytes and physical allocation/entropy were not checked, these values remain historical observations only and are not used as the validated baseline.

## 3. Corrected non-zero-data benchmark — valid single-run baseline

The corrected script used /dev/urandom to write a 24 GiB high-entropy test file, checked actual allocation using st_blocks, and used Darwin F_NOCACHE for sequential and random reads.

User-provided results:

### Data-source check

| Metric | Result |
|---|---:|
| /dev/urandom to /dev/null | 1 GiB in 1.614 s |
| Random-source ceiling | 633.4 MiB/s |

The source ceiling is higher than the measured write+sync rate (408.9 MiB/s), so the random source did not obviously cap the observed write rate. However, the write result remains an end-to-end measurement including random-data generation, dd, APFS, USB, and sync; it is not a controller-only write specification.

### Sequential I/O

| Metric | Result |
|---|---:|
| Test file logical size | 25,769,803,776 bytes (24 GiB) |
| Allocated bytes reported by st_blocks | 25,778,192,384 bytes |
| Allocated fraction | 1.0003 |
| Sequential write + sync | 60.102 s |
| Effective write + sync | 408.9 MiB/s |
| Sequential cache-bypass read | 29.444 s |
| Effective read | 834.7 MiB/s |

The allocated fraction of 1.0003 is consistent with a fully allocated file plus allocation/block accounting overhead; it is not a sparse zero-file result. The high-entropy source also avoids the all-zero data pattern of the first run.

### Random reads — one outstanding pread at a time

| Metric | 4 KiB | 64 KiB |
|---|---:|---:|
| Operations | 10,000 | 10,000 |
| IOPS | 5,492.1 | 2,983.6 |
| Average per-operation latency | 0.182 ms | 0.335 ms |
| P50 | 0.205 ms | 0.393 ms |
| P95 | 0.288 ms | 0.451 ms |
| Payload throughput (derived) | ~21.5 MiB/s | ~186.5 MiB/s |

Random-read results are single-threaded, queue-depth-1 application-level pread measurements with F_NOCACHE. They are not maximum device IOPS at higher queue depths and are not direct measurements of the runtime's expert-tensor access pattern.

### Cleanup and safety

- Script reported CLEANUP VERIFIED.
- Temporary directory and 24 GiB test file were removed.
- Available space returned to 946 GiB.
- The test directory was outside the model store.
- No model blobs, model manifests, Ollama configuration, DSH configuration, or production services were modified.

## 4. Interpretation

1. The corrected run is a valid non-zero-data, cache-bypass single-run baseline for this external USB/APFS storage path.
2. The measured sequential read rate (834.7 MiB/s) is the most useful current bulk-read reference for expert-weight streaming experiments.
3. The effective write+sync rate is 408.9 MiB/s. The random source ceiling (633.4 MiB/s) is above that rate, but the result still includes source-generation and filesystem/sync overhead.
4. The random-read latency figures are encouraging as a QD1 sample, but the benchmark does not model expert tensor sizes, coalescing, prefetch, concurrent reads, or runtime cache behavior.
5. One run does not establish sustained thermal performance, repeatability, USB link negotiation, or SSD health. SMART is unavailable through the current USB path.

**G5 disposition:** baseline captured; do not describe this as a full sustained/endurance qualification. It is sufficient to proceed to a read-only SSD Expert Streaming Runtime compatibility audit and then a bounded runtime-level I/O pilot. No 35B/48B/50B model download is authorized by this benchmark alone.

## 5. Reproducible implementation

Script: [scripts/mac/benchmark-ts900.sh](../scripts/mac/benchmark-ts900.sh)

The corrected script:
- checks the APFS mount, free space, and Ollama model residency;
- uses /dev/urandom, not /dev/zero;
- measures a 1 GiB random-source ceiling check;
- writes a 24 GiB file and runs sync;
- verifies logical size and at least 95% allocated blocks;
- enables Darwin F_NOCACHE for sequential and random reads;
- runs 10,000 single-threaded 4 KiB and 64 KiB random reads;
- cleans only its own uniquely named temporary file and directory.

## 6. Next gate — G6 Runtime compatibility audit

Proceed without downloading a large model:
1. Inspect the selected runtime's source, license, maintenance state, dependencies, installation scripts, and network/file-system behavior.
2. Verify that it implements actual SSD expert paging (not merely CPU expert offload or model loading from SSD).
3. Map supported MoE architectures, tensor names/shapes, quantization formats, expert layout, and checkpoint conversion requirements.
4. Determine whether the runtime exposes cache limits, prefetch, bounded queueing, cancellation, and memory-pressure safeguards.
5. Use the measured 834.7 MiB/s sequential read and QD1 random-read latency as storage context only; require a runtime-level benchmark using representative expert tensor sizes before estimating tokens/s.
6. Keep the first pilot isolated, single-request, and single-model. Do not change Ollama or DSH production configuration.

**No model files were deleted, no large model was downloaded, and no production configuration was changed.**
