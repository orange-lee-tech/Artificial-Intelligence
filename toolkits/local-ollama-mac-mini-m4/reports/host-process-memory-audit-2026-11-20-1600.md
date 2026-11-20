# Host Process and Memory Audit — 2026-11-20 16:00:31 CST

**Host:** Mac mini M4 (Mac16,10 from prior inventory)  
**OS:** macOS 26.2 (prior inventory)  
**Capture:** user-provided read-only Terminal output  
**Model admission:** HOLD; no Kimi download/load or MLX runtime install.

## 1. Boot continuity

- `uptime`: 3 days, 7:05.
- `kern.boottime`: Tue Nov 17 08:55:18 2026.
- Current capture: Fri Nov 20 16:00:31 CST.

This confirms the Nov 18 18:30 and Nov 20 15:55 captures are within the same boot, so cumulative VM counter deltas between them are valid (subject to the usual caveat that the counters are system-wide).

## 2. Current memory sample

| Metric | 16:00:31 |
|---|---:|
| Swap used | 817.62 MB |
| System-wide free percentage | 51% |
| Free pages (final `vm_stat` grep sample) | 5,194 |
| Wired pages (final `vm_stat` grep sample) | 124,215 |
| Compressor pages | 370,242 |
| Swapins | 54,629 |
| Swapouts | 135,024 |
| Pageouts | 163,794 |

The earlier `memory_pressure` section in the same command sequence reported free pages 5,417 and wired pages 124,124; the later `vm_stat` grep reported 5,194 and 124,215. These are sequential live reads. Compressor pages were 370,242 in both.

At 16 KiB/page, final `vm_stat` values correspond to:
- Free pages: 81.16 MiB.
- Wired pages: 1.895 GiB.
- Compressor occupancy: 5.649 GiB.

## 3. Short-interval change since 15:55:59

| Metric | 15:55:59 | 16:00:31 | Change |
|---|---:|---:|---:|
| Swap used | 833.62 MB | 817.62 MB | -16.00 MB |
| Free percentage | 51% | 51% | no change |
| Free pages | 4,930 | 5,194 | +264 (+4.13 MiB) |
| Wired pages | 127,588 | 124,215 | -3,373 (-52.70 MiB) |
| Compressor pages | 362,081 | 370,242 | +8,161 (+127.52 MiB) |
| Swapins | 53,910 | 54,629 | +719 (+11.23 MiB) |
| Swapouts | 135,024 | 135,024 | no increase |
| Pageouts | 163,357 | 163,794 | +437 (+6.83 MiB) |

The short interval is about 4 minutes 32 seconds. No new swapouts were observed and current swap used fell by 16 MB, while compressor occupancy increased by about 127.5 MiB. This is not enough to declare the system stable: the free percentage remains 51%, and compressor occupancy changed materially over a short interval. It also does not prove a leak or identify a cause.

## 4. Top resident processes

User supplied `ps -axo pid,ppid,rss,%cpu,%mem,comm | sort -nrk3 | head -35`. RSS values below are converted from KiB to MiB (1 MiB = 1,024 KiB).

| PID | Process | RSS MiB |
|---:|---|---:|
| 8135 | Chrome Helper (Aperitif Renderer) | 996.5 |
| 880 | DeepSeek Harness Helper (Renderer) | 525.7 |
| 8030 | Google Chrome main process | 322.3 |
| 35308 | Chrome Helper (Aperitif Renderer) | 322.0 |
| 48912 | WPS Office | 253.7 |
| 899 | DeepSeek Harness main process | 222.9 |
| 81790 | mediaanalysisd | 200.1 |
| 70421 | WeChat renderer | 178.0 |
| 11177 | WebKit WebContent | 167.3 |
| 1102 | DSH Electron renderer | 145.0 |
| 1414 | node@22 | 142.0 |
| 749 | WeChat main process | 141.8 |
| 785 | Finder | 140.9 |
| 80179 | WeChat renderer | 138.0 |
| 746 | DeepSeek Harness app process | 134.3 |
| 73226 | WPS cloud server | 119.8 |
| 750 | Safari | 117.4 |
| 8136 | Chrome Helper (Aperitif Renderer) | 110.6 |
| 1071 | DSH Electron | 109.3 |
| 70423 | WeChat renderer | 104.6 |
| 420 | WindowServer | 103.4 |
| 55665 | WeChat app extension | 101.9 |
| 752 | corespotlightd | 101.6 |
| 779 | Terminal | 96.0 |
| 8036 | Chrome Helper (Aperitif) | 92.1 |
| 73235 | WPS renderer | 88.7 |
| 70422 | WeChat renderer | 86.1 |
| 7928 | 蓝胖云 | 85.7 |
| 47915 | Music | 84.8 |
| 68302 | Chrome Helper (Aperitif Renderer) | 84.1 |
| 54067 | node@22 (child of DSH PID 899) | 76.0 |
| 7930 | FlClashCore | 73.8 |
| 2453 | SCIM Extension | 67.8 |
| 8046 | Chrome Helper (Aperitif Renderer) | 67.6 |

**Interpretation limits:** RSS is not unique physical footprint. Shared frameworks, mapped files and shared memory can be counted in more than one process. Do not sum process RSS and treat it as actual total physical memory or infer a leak from one sample. The list does show Chrome PID 8135 as the largest individual RSS process and DSH PID 880 as the second largest; both merit footprint-level inspection before any process is closed.

## 5. Ollama and DSH status

- `curl http://127.0.0.1:11434/api/ps` returned `{"models":[]}`: Ollama API responds and reports no resident models.
- `launchctl list` shows `com.ollama.ollama` with PID `-` and status 0; the Electron Ollama app job is listed separately (PID 14156).
- DeepSeek Harness is present: app PID 746, main process PID 899, renderer PID 880, Electron PID 1071, renderer PID 1102, plus child Node process PID 54067.
- Computer-use job PID 1398 is present.

This confirms no model is resident in Ollama at capture time. It does not prove Ollama is fully uninstalled or that no non-Ollama model server exists.

## 6. Admission and next step

- Kimi load / smoke test: **HOLD — NOT APPROVED**.
- No process was terminated.
- No service was restarted.
- No runtime was installed.
- No model was downloaded or loaded.
- No production configuration was changed.

Next read-only step: inspect physical-footprint summaries for the largest user processes (Chrome PID 8135, DSH PID 880, Chrome PID 8030, Chrome PID 35308, WPS PID 48912, DSH PID 899) with `vmmap -summary <pid>`, and use Chrome Task Manager to map PID 8135 to its tab/process. Do not terminate processes until their role and impact are understood.
