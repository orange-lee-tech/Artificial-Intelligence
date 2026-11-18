# Host Operational Baseline — 2026-11-18 15:39 CST

**Host:** Mac mini M4, `Mac16,10`  
**OS:** macOS 26.2, build `25C56`  
**Unified memory:** 16 GiB (17,179,869,184 bytes)  
**Storage:** TS900, APFS, mounted at `/Volumes/SSD`  
**Capture mode:** User-run read-only Terminal commands  
**Operating state:** DeepSeek Harness and desktop applications running; no Ollama model resident  
**Evidence class:** User-provided terminal output, not a generated collection file

## 1. Snapshot

| Metric | Observed |
|---|---:|
| `memory_pressure` system-wide free percentage | 57% |
| Current swap used | 470.50 MB |
| Swap total | 2,048 MB |
| Thermal warning | None recorded |
| Performance warning | None recorded |
| TS900 capacity | 954 GiB |
| TS900 used | 7.8 GiB |
| TS900 available | 946 GiB |
| TS900 capacity used | 1% |
| Ollama API `/api/ps` | `{"models":[]}` |

The 57% memory-pressure free percentage is not a promise that 57% of unified memory is available for model allocation. The snapshot must be interpreted with VM queues, wired memory, compressor, process footprint, Metal allocations, and swap trend.

## 2. VM statistics

Page size: 16 KiB.

| `vm_stat` field | Pages | Approx. GiB |
|---|---:|---:|
| Free | 9,106 | 0.139 |
| Active | 286,036 | 4.365 |
| Inactive | 288,252 | 4.398 |
| Speculative | 519 | 0.008 |
| Wired down | 153,700 | 2.345 |
| Purgeable | 11,386 | 0.174 |
| File-backed | 206,962 | 3.158 |
| Anonymous | 367,845 | 5.613 |
| Pages stored by compressor | 625,339 | 9.542 logical |
| Pages occupied by compressor | 276,479 | 4.219 physical |

The page categories are not all mutually exclusive and must not be naively summed into a model-available-memory figure. In particular, compressor stored pages are logical pages while compressor occupied pages describe physical compressor footprint.

## 3. Swap interpretation

At capture:

- Current swap used: 470.50 MB.
- Cumulative swapins: 44,582 pages.
- Cumulative swapouts: 102,568 pages.
- Cumulative pageouts: 67,561 pages.

The cumulative counters are since boot. They do not demonstrate active swap thrashing. A second time-separated sample is required to establish whether swap usage and swapout counters are still increasing under the normal desktop workload.

## 4. Visible process footprint

Selected process RSS from the user-provided `ps` output:

| Process | RSS |
|---|---:|
| Chrome Renderer (largest) | 828,368 KiB |
| DeepSeek Harness Renderer | 608,128 KiB |
| Chrome main process | 398,304 KiB |
| Chrome Renderer | 385,072 KiB |
| DeepSeek Harness main process | 254,400 KiB |
| Chrome Renderer | 218,240 KiB |
| Node process | 170,208 KiB |
| DeepSeek Harness main process / app host | 163,248 KiB |
| DSH Electron renderer | 153,232 KiB |
| Chrome Renderer | 158,832 KiB |

RSS is process-level and can include shared mappings; summing process RSS is not a reliable physical-memory accounting method. The desktop workload is nevertheless material and must remain represented in the model budget.

## 5. Services and residency

Ollama API response:

```json
{"models":[]}
```

No model was reported resident at the API endpoint.

Launch services showed:

- `com.ollama.ollama` registered with no PID in this snapshot;
- Ollama Electron application process present;
- DeepSeek Harness application running;
- DeepSeek Harness Computer Use launch job present.

No service was stopped or modified.

## 6. Thermal state

`pmset -g therm` reported:

- No thermal warning level recorded;
- No performance warning level recorded;
- No CPU power status recorded.

## 7. Interpretation and constraints

1. The host was in a normal desktop/DSH operating state, not a stripped-down headless state.
2. The 57% system-wide free percentage and absence of thermal warnings are encouraging; they do not authorize a model load.
3. Current swap usage is 470.50 MB. Without a time-separated delta, this cannot be classified as ongoing pressure.
4. The 4B model is not resident according to Ollama API; its installed files are unaffected.
5. TS900 has ample disk capacity for later experiments, but disk capacity does not establish safe unified-memory usage.
6. No runtime was installed, no checkpoint downloaded, and no production configuration changed during this capture.

## 8. Next read-only baseline step

Collect a second snapshot after 10–15 minutes of ordinary DSH/desktop activity, using:

```bash
date
sysctl vm.swapusage
memory_pressure
vm_stat
```

Compare current swap used, swapout counter, compressor occupied pages, and memory-pressure percentage. Do not launch a model between the two snapshots.

## 9. G6 status

This is an operational host baseline only. It does not close G6.2 exact checkpoint tensor accounting, G6.3 model memory-envelope proof, or G6.4 runtime I/O/Metal-overlap testing.

No model download or runtime installation is authorized by this report.
