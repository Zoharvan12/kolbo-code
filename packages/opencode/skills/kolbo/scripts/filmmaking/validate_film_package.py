#!/usr/bin/env python3
"""Validate a Kolbo Filmmaker production package using only the Python stdlib."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable


VALID_MODES = {
    "text-to-video",
    "image-to-video",
    "reference-to-video",
    "first-last-frame",
    "video-to-video",
}
VALID_DENSITIES = {"strict", "anchored", "exploratory"}


class Report:
    def __init__(self) -> None:
        self.items: list[dict[str, str]] = []

    def add(self, level: str, code: str, path: str, message: str) -> None:
        self.items.append(
            {"level": level, "code": code, "path": path, "message": message}
        )

    def error(self, code: str, path: str, message: str) -> None:
        self.add("error", code, path, message)

    def warn(self, code: str, path: str, message: str) -> None:
        self.add("warning", code, path, message)

    @property
    def error_count(self) -> int:
        return sum(item["level"] == "error" for item in self.items)

    @property
    def warning_count(self) -> int:
        return sum(item["level"] == "warning" for item in self.items)


def load_json(path: Path, report: Report) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        report.error("missing_file", str(path), "Required file does not exist.")
    except json.JSONDecodeError as exc:
        report.error(
            "invalid_json",
            str(path),
            f"JSON parse error at line {exc.lineno}, column {exc.colno}: {exc.msg}",
        )
    except OSError as exc:
        report.error("read_failed", str(path), f"Could not read file: {exc}")
    return None


def require_fields(
    obj: Any, fields: Iterable[str], path: str, report: Report
) -> None:
    if not isinstance(obj, dict):
        report.error("wrong_type", path, "Expected a JSON object.")
        return
    for field in fields:
        if field not in obj or obj[field] in (None, "", []):
            report.error("missing_field", f"{path}.{field}", "Required field is empty.")


def collect_registry_tags(bible: dict[str, Any]) -> set[str]:
    tags: set[str] = set()

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"tag", "canonical_tag"} and isinstance(child, str):
                    if child.startswith("@"):
                        tags.add(child)
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    for section in ("characters", "locations", "assets"):
        walk(bible.get(section, []))
    return tags


def json_files(folder: Path) -> list[Path]:
    return sorted(path for path in folder.glob("*.json") if path.is_file())


def validate_bible(bible: Any, path: Path, report: Report) -> tuple[str, set[str]]:
    require_fields(
        bible,
        [
            "schema_version",
            "project_id",
            "title",
            "story",
            "characters",
            "locations",
            "assets",
            "audio_policy",
        ],
        str(path),
        report,
    )
    if not isinstance(bible, dict):
        return "", set()
    project_id = str(bible.get("project_id", ""))
    tags = collect_registry_tags(bible)
    if not tags:
        report.warn(
            "empty_asset_registry",
            str(path),
            "No @ asset tags were found in characters, locations, or assets.",
        )
    for section in ("characters", "locations", "assets"):
        if not isinstance(bible.get(section), list):
            report.error(
                "wrong_type", f"{path}.{section}", "Expected this registry to be a list."
            )
    return project_id, tags


def validate_scene_cards(
    paths: list[Path], project_id: str, registry_tags: set[str], report: Report
) -> set[str]:
    scene_ids: set[str] = set()
    for path in paths:
        card = load_json(path, report)
        if card is None:
            continue
        require_fields(
            card,
            ["project_id", "scene_id", "slugline", "story_job", "structure"],
            str(path),
            report,
        )
        if not isinstance(card, dict):
            continue
        scene_id = str(card.get("scene_id", ""))
        if scene_id in scene_ids:
            report.error("duplicate_scene_id", str(path), f"Duplicate scene_id: {scene_id}")
        scene_ids.add(scene_id)
        if project_id and card.get("project_id") != project_id:
            report.error(
                "project_mismatch",
                str(path),
                f"Scene project_id must be {project_id!r}.",
            )
        location_tag = card.get("location_tag")
        if location_tag and location_tag not in registry_tags:
            report.error(
                "unknown_asset_tag",
                f"{path}.location_tag",
                f"Tag is absent from production-bible.json: {location_tag}",
            )
        structure = card.get("structure")
        if isinstance(structure, dict):
            for key in ("goal", "obstacle", "tactic", "reversal", "audience_value_shift"):
                if not structure.get(key):
                    report.warn(
                        "incomplete_scene_engine",
                        f"{path}.structure.{key}",
                        "Dramatic structure field is empty.",
                    )
    return scene_ids


def validate_timed_blocks(
    blocks: Any, duration: float, path: str, report: Report, label: str
) -> None:
    if not isinstance(blocks, list):
        report.error("wrong_type", path, f"{label} must be a list.")
        return
    intervals: list[tuple[float, float, int, dict[str, Any]]] = []
    for index, block in enumerate(blocks):
        item_path = f"{path}[{index}]"
        if not isinstance(block, dict):
            report.error("wrong_type", item_path, "Timed block must be an object.")
            continue
        start = block.get("start_seconds")
        end = block.get("end_seconds")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            report.error("invalid_timecode", item_path, "Start and end must be numbers.")
            continue
        if start < 0 or end <= start:
            report.error("invalid_timecode", item_path, "Require 0 <= start < end.")
        if end > duration:
            report.error(
                "timecode_overflow",
                item_path,
                f"End {end}s exceeds shot duration {duration}s.",
            )
        intervals.append((float(start), float(end), index, block))
    if label == "Dialogue":
        ordered = sorted(intervals)
        for previous, current in zip(ordered, ordered[1:]):
            if current[0] < previous[1] and not (
                previous[3].get("allow_overlap") or current[3].get("allow_overlap")
            ):
                report.error(
                    "dialogue_overlap",
                    path,
                    f"Dialogue items {previous[2]} and {current[2]} overlap without allow_overlap.",
                )


def validate_shot_cards(
    paths: list[Path],
    project_id: str,
    scene_ids: set[str],
    registry_tags: set[str],
    report: Report,
) -> set[str]:
    shot_ids: set[str] = set()
    for path in paths:
        card = load_json(path, report)
        if card is None:
            continue
        require_fields(
            card,
            [
                "project_id",
                "scene_id",
                "shot_id",
                "editorial_job",
                "generation_mode",
                "control_density",
                "duration_seconds",
                "active_assets",
                "first_frame",
                "final_state",
            ],
            str(path),
            report,
        )
        if not isinstance(card, dict):
            continue
        shot_id = str(card.get("shot_id", ""))
        if shot_id in shot_ids:
            report.error("duplicate_shot_id", str(path), f"Duplicate shot_id: {shot_id}")
        shot_ids.add(shot_id)
        if project_id and card.get("project_id") != project_id:
            report.error(
                "project_mismatch", str(path), f"Shot project_id must be {project_id!r}."
            )
        scene_id = str(card.get("scene_id", ""))
        if scene_ids and scene_id not in scene_ids:
            report.error(
                "unknown_scene_id", str(path), f"No scene card exists for {scene_id!r}."
            )
        mode = card.get("generation_mode")
        if mode not in VALID_MODES:
            report.error(
                "invalid_generation_mode",
                f"{path}.generation_mode",
                f"Use one of: {', '.join(sorted(VALID_MODES))}.",
            )
        density = card.get("control_density")
        if density not in VALID_DENSITIES:
            report.error(
                "invalid_control_density",
                f"{path}.control_density",
                f"Use one of: {', '.join(sorted(VALID_DENSITIES))}.",
            )
        duration = card.get("duration_seconds")
        if not isinstance(duration, (int, float)) or duration <= 0:
            report.error("invalid_duration", f"{path}.duration_seconds", "Use a positive number.")
            duration_value = 0.0
        else:
            duration_value = float(duration)
        if card.get("model") == "seedance-2.5" and duration_value and not 4 <= duration_value <= 30:
            report.error(
                "seedance_duration",
                f"{path}.duration_seconds",
                "Seedance 2.5 adapter expects 4-30 seconds per generation.",
            )
        assets = card.get("active_assets")
        if isinstance(assets, list):
            seen: set[str] = set()
            for index, asset in enumerate(assets):
                tag = asset.get("tag") if isinstance(asset, dict) else None
                if not isinstance(tag, str) or not tag.startswith("@"):
                    report.error(
                        "invalid_asset_reference",
                        f"{path}.active_assets[{index}]",
                        "Every active asset needs a @tag.",
                    )
                    continue
                if tag in seen:
                    report.warn(
                        "duplicate_asset_reference",
                        f"{path}.active_assets[{index}]",
                        f"Asset is listed more than once: {tag}",
                    )
                seen.add(tag)
                if tag not in registry_tags:
                    report.error(
                        "unknown_asset_tag",
                        f"{path}.active_assets[{index}]",
                        f"Tag is absent from production-bible.json: {tag}",
                    )
        else:
            report.error("wrong_type", f"{path}.active_assets", "Expected a list.")
        if "action_timing" in card and duration_value:
            validate_timed_blocks(
                card["action_timing"], duration_value, f"{path}.action_timing", report, "Action"
            )
        dialogue = card.get("dialogue", [])
        if dialogue and duration_value:
            validate_timed_blocks(
                dialogue, duration_value, f"{path}.dialogue", report, "Dialogue"
            )
    return shot_ids


def validate_continuity(
    path: Path, project_id: str, shot_ids: set[str], report: Report
) -> None:
    if not path.exists():
        report.warn(
            "missing_continuity_ledger",
            str(path),
            "Add continuity-ledger.json before generating a multi-shot sequence.",
        )
        return
    ledger = load_json(path, report)
    if ledger is None:
        return
    require_fields(ledger, ["project_id", "entries"], str(path), report)
    if not isinstance(ledger, dict):
        return
    if project_id and ledger.get("project_id") != project_id:
        report.error(
            "project_mismatch", str(path), f"Ledger project_id must be {project_id!r}."
        )
    entries = ledger.get("entries")
    if not isinstance(entries, list):
        report.error("wrong_type", f"{path}.entries", "Expected a list.")
        return
    ledger_ids: set[str] = set()
    for index, entry in enumerate(entries):
        item_path = f"{path}.entries[{index}]"
        require_fields(entry, ["shot_id", "entering", "leaving", "handoff_proof"], item_path, report)
        if not isinstance(entry, dict):
            continue
        shot_id = str(entry.get("shot_id", ""))
        if shot_id in ledger_ids:
            report.error("duplicate_ledger_entry", item_path, f"Duplicate shot_id: {shot_id}")
        ledger_ids.add(shot_id)
        if shot_ids and shot_id not in shot_ids:
            report.error("unknown_shot_id", item_path, f"No shot card exists for {shot_id!r}.")
    missing = shot_ids - ledger_ids
    for shot_id in sorted(missing):
        report.warn(
            "missing_ledger_entry",
            str(path),
            f"Shot has no explicit entering/leaving handoff: {shot_id}",
        )


def render_text(report: Report, package: Path, counts: dict[str, int]) -> str:
    lines = [f"Kolbo Filmmaker package: {package}"]
    lines.append(
        "Validated "
        + ", ".join(f"{value} {key}" for key, value in counts.items())
        + "."
    )
    for item in report.items:
        lines.append(
            f"[{item['level'].upper()}] {item['code']} - {item['path']}: {item['message']}"
        )
    lines.append(f"Result: {report.error_count} error(s), {report.warning_count} warning(s).")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path, help="Production package folder")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    package = args.package.resolve()
    report = Report()
    if not package.is_dir():
        report.error("missing_package", str(package), "Package folder does not exist.")
        counts = {"scene card(s)": 0, "shot card(s)": 0, "registered tag(s)": 0}
    else:
        bible_path = package / "production-bible.json"
        bible = load_json(bible_path, report)
        project_id, tags = validate_bible(bible, bible_path, report) if bible is not None else ("", set())
        scene_paths = json_files(package / "scene-cards")
        shot_paths = json_files(package / "shot-cards")
        if not scene_paths:
            report.warn("no_scene_cards", str(package / "scene-cards"), "No scene cards found.")
        if not shot_paths:
            report.warn("no_shot_cards", str(package / "shot-cards"), "No shot cards found.")
        scene_ids = validate_scene_cards(scene_paths, project_id, tags, report)
        shot_ids = validate_shot_cards(shot_paths, project_id, scene_ids, tags, report)
        validate_continuity(package / "continuity-ledger.json", project_id, shot_ids, report)
        counts = {
            "scene card(s)": len(scene_paths),
            "shot card(s)": len(shot_paths),
            "registered tag(s)": len(tags),
        }

    if args.json:
        print(
            json.dumps(
                {
                    "package": str(package),
                    "valid": report.error_count == 0,
                    "counts": counts,
                    "errors": report.error_count,
                    "warnings": report.warning_count,
                    "items": report.items,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        print(render_text(report, package, counts))
    return 1 if report.error_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
