# A1/D1 validation summary

Generated: 2026-11-17T05:25:15.800Z

| Case | Verdict | ms | Exit | Description |
| --- | --- | --- | --- | --- |
| T1 | PASS | 159 | 0 | Plugin load and config registration (dump-config) |
| T2 | PASS | 533 | 0 | agent/inbox/inserted runs before the first model request |
| T3 | PASS | 547 | 0 | LOCAL_FIRST produces zero cloud requests |
| T4 | PASS | 61 | 0 | llm/stream without next() produces zero adapter egress |
| T5 | PASS | 466 | 0 | Local timeout retry stays on the local provider |
| T6 | PASS | 847 | 0 | No reservation / unknown price refuses the cloud request |
| T7 | PASS | 1244 | 0 | Per-request and daily caps refuse the cloud request |
| T8 | PASS | 278 | 0 | Concurrent reservations are atomic and cap-exact |
| T9 | PASS | 66 | 0 | Explicit subagent provider is still budget constrained |
| T10 | PASS | 445 | 0 | Crash and dispose clean up state correctly |

Total: 10, PASS: 10, non-PASS: 0
