#!/usr/bin/env python3
"""Export canonical PACS skills into documented platform directory/package layouts.

Uses only the Python standard library. This script packages instructions; it does
not install platforms, enable plugins, connect tools, or grant permissions.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / "capabilities"


def parse_frontmatter(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not match:
        raise ValueError(f"{path}: missing YAML frontmatter")
    frontmatter = match.group(1)
    name_match = re.search(r"^name:\s*([a-z0-9][a-z0-9-]*)\s*$", frontmatter, re.M)
    desc_match = re.search(r'^description:\s*"([^"\n]+)"\s*$', frontmatter, re.M)
    if not name_match or not desc_match:
        raise ValueError(f"{path}: required name/description metadata missing")
    name, description = name_match.group(1), desc_match.group(1)
    if len(description) > 200:
        raise ValueError(f"{path}: description exceeds 200 characters")
    return name, description


def copy_skill(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    output = args.output.expanduser().resolve()

    sources = sorted(SKILLS_ROOT.glob("C*/SKILL.md"))
    if not sources:
        raise SystemExit(f"No PACS skills found under {SKILLS_ROOT}")

    seen: set[str] = set()
    manifest: list[dict[str, str]] = []
    for source in sources:
        name, description = parse_frontmatter(source)
        if name in seen:
            raise SystemExit(f"Duplicate skill name: {name}")
        seen.add(name)
        manifest.append({
            "name": name,
            "description": description,
            "source": source.relative_to(ROOT).as_posix(),
        })

        # Neutral source package.
        copy_skill(source, output / "portable" / "skills" / name / "SKILL.md")

        # TRAE project-level Skill root (project must be trusted in TRAE).
        copy_skill(source, output / "trae" / ".trae" / "skills" / name / "SKILL.md")

        # DeepSeek Harness project-level Skill root.
        copy_skill(source, output / "deepseek-harness" / ".dsh" / "skills" / name / "SKILL.md")

        # Claude custom Skill ZIP: folder at ZIP root, file named skill.md.
        zip_path = output / "claude" / f"{name}.zip"
        zip_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(source, arcname=f"{name}/skill.md")

    (output / "manifest.json").write_text(
        json.dumps({"pacs_version": "0.1.1", "skills": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output / "README.md").write_text(
        "# PACS Skill Export\n\n"
        "- claude/: one ZIP per Skill; upload each ZIP through the supported Skills interface.\n"
        "- trae/: copy the .trae directory into a trusted project root.\n"
        "- deepseek-harness/: copy the .dsh directory into a project root with Skill Provider/Loader enabled.\n"
        "- portable/: canonical Skill source copies for manual adaptation.\n\n"
        "Exports do not connect tools, configure approvals, or verify account-level feature availability.\n",
        encoding="utf-8",
    )
    print(f"Exported {len(manifest)} PACS skills to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
