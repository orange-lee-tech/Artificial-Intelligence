#!/usr/bin/env python3
"""Validate the approved Phase 2 static cloud-spend configuration.

This does not enforce runtime billing or egress restrictions.
"""
import json
import sys
from pathlib import Path

PERIODS = [
    ("night", "00:00", 50),
    ("morning", "07:00", 50),
    ("afternoon", "12:00", 100),
    ("evening", "18:00", 50),
]


def validate(policy):
    errors = []
    if policy.get("currency") != "CNY":
        errors.append("currency must be CNY")
    if policy.get("daily_cap_fen") != 200:
        errors.append("daily cap must equal 200 fen")
    if policy.get("per_request_cap_fen") != 20:
        errors.append("request cap must equal 20 fen")
    if not isinstance(policy.get("timezone"), str) or not policy["timezone"].strip():
        errors.append("target-host timezone is required")
    periods = policy.get("periods")
    if not isinstance(periods, list) or len(periods) != 4:
        errors.append("exactly four periods required")
    else:
        for index, expected in enumerate(PERIODS):
            item = periods[index]
            actual = (
                item.get("name"),
                item.get("start"),
                item.get("base_cap_fen"),
            ) if isinstance(item, dict) else None
            if actual != expected:
                errors.append(f"period {index} differs from approved schedule")
    if policy.get("rollover") != {
        "enabled": True,
        "scope": "same_local_day_only",
        "method": "cumulative_accrual",
    }:
        errors.append("rollover must use same-day cumulative accrual")
    if policy.get("unknown_cost_action") != "deny":
        errors.append("unknown cost must be denied")
    if policy.get("cloud_routing") != "adaptive_local_first":
        errors.append("routing must be adaptive_local_first")
    return errors


def accrued_limit(period_index):
    return min(200, sum(slot[2] for slot in PERIODS[:period_index + 1]))


def main():
    if len(sys.argv) != 2:
        print("usage: python3 tools/check-cloud-spend-policy.py POLICY.json", file=sys.stderr)
        return 2
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    problems = validate(config)
    if [accrued_limit(i) for i in range(4)] != [50, 100, 200, 200]:
        problems.append("cumulative accrual invariant violated")
    if problems:
        for problem in problems:
            print("FAIL:", problem, file=sys.stderr)
        return 1
    print("PASS: approved static policy and same-day cumulative allowance")
    print("NOT_TESTED: live egress, price/FX, concurrent reservations, provider billing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
