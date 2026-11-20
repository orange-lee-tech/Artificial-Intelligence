# Host Operational Follow-up — 2026-11-18 18:30 CST

**Host:** Mac mini M4, `Mac16,10`  
**OS:** macOS 26.2, build `25C56`  
**Unified memory:** 16 GiB; page size 16 KiB  
**Capture:** user-run read-only Terminal commands  
**Previous sample:** 2026-11-18 15:39 CST, recorded in [Host Operational Baseline](host-operational-baseline-2026-11-18.md)  
**Model/runtime:** no Kimi model was loaded; no runtime was installed by this audit.

## 1. Second snapshot

| Metric | 15:39 CST | 18:30 CST |
|---|---:|---:|
| `memory_pressure` system-wide free percentage | 57% | 56% |
| Current swap used | 470.50 MB | 446.50 MB |
| Free pages | 9,106 | 10,352 |
| Wired pages | 153,700 | 149,110 |
| Pages occupied by compressor | 276,479 | 288,694 |
| Cumulative swapins | 44,582 | 46,423 |
| Cumulative swapouts | 102,568 | 102,568 |
| Cumulative pageouts | 67,561 | 70,520 |

At 16 KiB/page, the 18:30 sample corresponds to:

- Free pages: 161.75 MiB.
- Wired pages: 2.275238 GiB.
- Pages occupied by compressor: 4.405121 GiB.
- Purgeable pages: 209.48 MiB.

The 18:30 `vm_stat` grep snapshot reported 10,352 free pages and 149,110 wired pages. The immediately preceding `memory_pressure` output showed 10,333 and 149,100 respectively; these small differences are normal sampling movement during the command sequence. The compressor and swap counters were unchanged between those two outputs.

## 2. Changes between samples

- Current swap used decreased by 24.00 MB.
- Cumulative swapins increased by 1,841 pages (28.77 MiB read back from swap).
- Cumulative swapouts did not increase.
- Compressor occupancy increased by 12,215 pages (190.86 MiB).
- Free pages increased by 1,246 pages (19.47 MiB).
- Wired pages decreased by 4,590 pages (71.72 MiB).
- Cumulative pageouts increased by 2,959 pages (46.23 MiB). Pageouts are not the same counter as swapouts and must not be reported as additional swap writes.

## 3. Interpretation

**No new swapouts were observed between the two samples, and current swap use fell.** This is evidence against active swap-out growth during this interval.

Compressor occupancy nevertheless increased by about 191 MiB, while the reported system-wide free percentage moved from 57% to 56%. This indicates some change in compression/working-set composition, but it does not by itself establish harmful memory pressure or a stable long-term plateau.

The `memory_pressure` free percentage is not directly convertible to model-allocatable unified memory. Likewise, the raw free-page count is not the whole reclaimable budget: inactive/file-backed/purgeable pages and compressor accounting have distinct semantics. Do not sum VM page categories naively.

The cumulative counters are since boot. The two-point difference is useful for this interval only; it is not a per-second rate and does not predict the additional allocations caused by MLX, Metal, model loading or prefill.

## 4. Admission decision

- Ordinary desktop host snapshot: **FOLLOW-UP CAPTURED**.
- Evidence of new swapouts during this interval: **NONE OBSERVED**.
- Compressor occupancy trend: **INCREASED ~190.86 MiB**; plateau not established.
- Provisional 5 GiB non-model reserve: **NOT YET PROVEN**.
- Kimi 16 GiB hardware admission: **NOT APPROVED**.
- Model download, runtime installation, model execution, service restart and production configuration change: **NOT PERFORMED**.

A further 10–15 minute sample under unchanged ordinary desktop workload can determine whether compressor occupancy continues to rise. It is not a substitute for a later isolated MLX/Metal peak measurement.

## 5. Exact user-provided 18:30 values

```
date: 2026-11-18 18:30:13 CST
vm.swapusage: total=2048.00M used=446.50M free=1601.50M
memory_pressure system-wide free percentage: 56%
Pages free: 10352
Pages wired down: 149110
Pages occupied by compressor: 288694
Swapins: 46423
Swapouts: 102568
Pageouts: 70520
```

The user-provided 18:30 command output does not include an Ollama `/api/ps` or process-residency check, so model residency during the entire 15:39–18:30 interval is not independently established. This audit itself only performed metadata/source review; it did not load Kimi, install a runtime, or change production configuration.
