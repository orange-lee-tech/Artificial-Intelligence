# Host Operational Follow-up — 2026-11-20 15:55 CST

**Host:** Mac mini M4, `Mac16,10` (from earlier host inventory; not re-queried in this capture)  
**Unified memory:** 16 GiB (earlier host inventory; not re-queried in this capture)  
**Capture:** user-provided read-only Terminal output  
**Previous comparison sample:** 2026-11-18 18:30:13 CST  
**Elapsed wall time:** 45 h 25 m 46 s  
**Model/runtime residency:** not established by this memory-only capture; no process list or Ollama `/api/ps` was included.

## 1. 2026-11-20 snapshot

| Metric | Value |
|---|---:|
| `vm.swapusage` total | 2,048.00 MB |
| `vm.swapusage` used | 833.62 MB |
| `vm.swapusage` free | 1,214.38 MB |
| `memory_pressure` system-wide free percentage | 51% |
| Free pages (`vm_stat` grep sample) | 4,930 |
| Wired pages (`vm_stat` grep sample) | 127,588 |
| Pages occupied by compressor (`vm_stat` grep sample) | 362,081 |
| Swapins | 53,910 |
| Swapouts | 135,024 |
| Pageouts | 163,357 |

The earlier `memory_pressure` section in the same command sequence reported free pages 4,661, wired pages 127,582 and compressor pages 362,082. The subsequent `vm_stat` read reported 4,930 / 127,588 / 362,081 respectively. These are sequential live samples, not contradictory records.

At 16 KiB/page, using the final `vm_stat` grep values:

- Free pages: 77.03 MiB.
- Wired pages: 1.946838 GiB.
- Compressor occupancy: 5.524918 GiB.

## 2. Comparison with 2026-11-18 18:30

| Metric | 2026-11-18 18:30 | 2026-11-20 15:55 | Change |
|---|---:|---:|---:|
| Swap used | 446.50 MB | 833.62 MB | +387.12 MB |
| System-wide free percentage | 56% | 51% | -5 percentage points |
| Free pages | 10,352 | 4,930 | -5,422 pages (-84.72 MiB) |
| Wired pages | 149,110 | 127,588 | -21,522 pages (-336.28 MiB) |
| Compressor pages | 288,694 | 362,081 | +73,387 pages (+1,146.67 MiB / +1.1198 GiB) |
| Swapins | 46,423 | 53,910 | +7,487 pages (+116.98 MiB) |
| Swapouts | 102,568 | 135,024 | +32,456 pages (+507.13 MiB) |
| Pageouts | 70,520 | 163,357 | +92,837 pages (+1,450.58 MiB) |

**Cumulative-counter qualification:** swapins, swapouts and pageouts are cumulative counters. Their deltas describe this interval only if the Mac did not reboot between captures. The supplied output does not include uptime or boot time, so that assumption has not yet been verified. Point-in-time swap-used, free-percentage and page-occupancy comparisons do not depend on this assumption.

Pageouts are not equivalent to swapouts; do not add them together or describe all pageouts as swap writes.

## 3. Interpretation

This sample is materially less favorable than the 2026-11-18 sample:

- Current swap used is up 387.12 MB.
- System-wide free percentage fell by 5 percentage points.
- Free pages fell by about 84.72 MiB.
- Compressor occupancy rose by about 1.12 GiB.
- If the host did not reboot, cumulative swapouts increased by 32,456 pages (about 507.13 MiB).

These measurements indicate materially increased memory-management activity and reduced headroom compared with the prior snapshot. They do **not** identify which process caused it, prove that all of the change is harmful, or establish whether the load is transient or persistent. The two samples are separated by more than 45 hours, and workload equivalence is unknown.

The 51% system-wide free percentage is not a direct model-allocatable-memory measurement. Do not infer a precise free unified-memory budget by multiplying this percentage by 16 GiB.

## 4. Admission decision

- Host memory trend versus 2026-11-18: **ADVERSE / INVESTIGATE**.
- Kimi model load or smoke test: **HOLD — NOT APPROVED**.
- 2 GiB expert pool plan: remains a static design target only; not permission to load.
- Provisional 5 GiB non-model reserve: **NOT VALIDATED**.
- Cause of the increased pressure: **UNKNOWN — current process inventory required**.
- Whether cumulative counter deltas span one boot: **NOT VERIFIED**.
- Model download, runtime installation, model execution, service restart and production configuration change: **not performed by this evidence review**.

## 5. Next read-only diagnostic

Before another memory trend sample, identify the current memory consumers and verify boot continuity. Capture `date`, `uptime`, `sysctl kern.boottime`, `memory_pressure`, `vm_stat`, the top resident processes, and Ollama's resident-model list. Do not terminate processes or change services as part of this diagnostic.

