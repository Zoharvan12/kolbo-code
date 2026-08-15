#!/usr/bin/env python3
"""Lint a compiled AI-video prompt against its shot card and model adapter."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


TAG_RE = re.compile(r"@[A-Za-z][A-Za-z0-9_.:-]*(?:\s+\d+)?")
SHOT_RE = re.compile(r"(?im)^\s*(?:SHOT|SEGMENT)\s+(\d+)\b")
RANGE_RE = re.compile(
    r"(?i)(\d+(?:\.\d+)?)\s*s\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*s"
)


class Report:
    def __init__(self) -> None:
        self.items: list[dict[str, str]] = []

    def add(self, level: str, code: str, message: str) -> None:
        self.items.append({"level": level, "code": code, "message": message})

    def error(self, code: str, message: str) -> None:
        self.add("error", code, message)

    def warn(self, code: str, message: str) -> None:
        self.add("warning", code, message)

    @property
    def errors(self) -> int:
        return sum(item["level"] == "error" for item in self.items)

    @property
    def warnings(self) -> int:
        return sum(item["level"] == "warning" for item in self.items)


def load_text(path: Path, report: Report) -> str:
    try:
        return path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        report.error("read_failed", f"Could not read prompt: {exc}")
        return ""


def load_card(path: Path | None, report: Report) -> dict[str, Any] | None:
    if path is None:
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        report.error("invalid_shot_card", f"Could not load shot card: {exc}")
        return None
    if not isinstance(data, dict):
        report.error("invalid_shot_card", "Shot card must contain a JSON object.")
        return None
    return data


def expected_tags(card: dict[str, Any] | None) -> set[str]:
    if not card:
        return set()
    tags: set[str] = set()
    for asset in card.get("active_assets", []):
        if isinstance(asset, dict) and isinstance(asset.get("tag"), str):
            tags.add(asset["tag"])
    return tags


def check_adapter(
    prompt: str, card: dict[str, Any] | None, model: str, report: Report
) -> None:
    if model != "seedance-2.5":
        return
    if len(prompt) > 30_000:
        report.error(
            "seedance_prompt_length",
            f"Prompt has {len(prompt)} characters; Seedance 2.5 adapter ceiling is 30,000.",
        )
    shot_numbers = [int(value) for value in SHOT_RE.findall(prompt)]
    if len(shot_numbers) > 30:
        report.error(
            "seedance_shot_count",
            f"Prompt contains {len(shot_numbers)} shot/segment headings; adapter ceiling is 30.",
        )
    if card:
        duration = card.get("duration_seconds")
        if isinstance(duration, (int, float)) and not 4 <= duration <= 30:
            report.error(
                "seedance_duration",
                f"Shot-card duration is {duration}s; Seedance 2.5 adapter expects 4-30s.",
            )


def check_contradictions(prompt: str, report: Report) -> None:
    continuous = re.search(
        r"(?i)\b(one|single)\s+(?:unbroken\s+)?continuous\s+take\b|\bno\s+cuts?\b",
        prompt,
    )
    cuts = re.search(r"(?i)\b(hard|match|smash|jump|whip)\s+cut\b|\bhard\s+cuts\b", prompt)
    if continuous and cuts:
        report.error(
            "continuous_take_cut_conflict",
            "Prompt requests a continuous/no-cut take and also specifies an editorial cut.",
        )

    no_music = re.search(r"(?i)\b(?:no|without)\s+(?:source\s+)?music\b", prompt)
    positive_music = re.search(
        r"(?i)\b(?:music|score|song)\s+(?:plays|continues|swells|throughout)\b|"
        r"@[Aa]udio\s+\d+\s+(?:plays|continues)",
        prompt,
    )
    if no_music and positive_music:
        report.error(
            "music_policy_conflict",
            "Prompt both forbids music and directs music or a song to play.",
        )

    realtime = re.search(r"(?i)\breal[- ]time\b|\bnormal\s+speed\b", prompt)
    slow_motion = re.search(r"(?i)\bslow[- ]motion\b|\bslow[- ]mo\b", prompt)
    if realtime and slow_motion:
        report.warn(
            "speed_policy_conflict",
            "Prompt contains both real-time/normal-speed and slow-motion instructions; scope them explicitly.",
        )


def check_stale_language(prompt: str, report: Report) -> None:
    patterns = [
        r"(?i)\bsame\s+as\s+(?:before|above|previous)\b",
        r"(?i)\bas\s+(?:before|above)\b",
        r"(?i)\bcontinues?\s+from\s+(?:the\s+)?previous\s+shot\b",
        r"(?i)\bunchanged\s+from\s+(?:the\s+)?previous\b",
    ]
    if any(re.search(pattern, prompt) for pattern in patterns):
        report.warn(
            "implicit_continuity",
            "Replace stale phrases such as 'same as before' with explicit visible state for this generation island.",
        )


def check_tags(prompt: str, card: dict[str, Any] | None, report: Report) -> tuple[set[str], set[str]]:
    found = {value.rstrip(".,;:!?") for value in TAG_RE.findall(prompt)}
    expected = expected_tags(card)
    for tag in sorted(expected - found):
        report.error("missing_active_asset", f"Shot-card asset is absent from prompt: {tag}")
    for tag in sorted(found - expected):
        if expected and not re.fullmatch(r"@[Ii]mage\s+\d+|@[Aa]udio\s+\d+|@[Vv]ideo\s+\d+", tag):
            report.warn(
                "unregistered_prompt_asset",
                f"Prompt tag is not listed in shot-card active_assets: {tag}",
            )
    if len(found) > 50:
        report.error(
            "reference_count",
            f"Prompt has {len(found)} distinct references; current Kolbo Seedance contract ceiling is 50.",
        )
    return found, expected


def check_timing(prompt: str, card: dict[str, Any] | None, report: Report) -> None:
    duration = card.get("duration_seconds") if card else None
    for start_text, end_text in RANGE_RE.findall(prompt):
        start, end = float(start_text), float(end_text)
        if end <= start:
            report.error("invalid_time_range", f"Prompt time range {start:g}s-{end:g}s is not increasing.")
        if isinstance(duration, (int, float)) and end > duration:
            report.error(
                "timecode_overflow",
                f"Prompt time range ends at {end:g}s, beyond shot-card duration {duration:g}s.",
            )


def check_dialogue_card(card: dict[str, Any] | None, report: Report) -> None:
    if not card:
        return
    dialogue = card.get("dialogue", [])
    if not isinstance(dialogue, list):
        report.error("invalid_dialogue", "Shot-card dialogue must be a list.")
        return
    intervals: list[tuple[float, float, int, dict[str, Any]]] = []
    for index, item in enumerate(dialogue):
        if not isinstance(item, dict):
            report.error("invalid_dialogue", f"Dialogue item {index} must be an object.")
            continue
        start, end = item.get("start_seconds"), item.get("end_seconds")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            report.error("invalid_dialogue_time", f"Dialogue item {index} needs numeric start/end seconds.")
            continue
        intervals.append((float(start), float(end), index, item))
    intervals.sort()
    for previous, current in zip(intervals, intervals[1:]):
        if current[0] < previous[1] and not (
            previous[3].get("allow_overlap") or current[3].get("allow_overlap")
        ):
            report.error(
                "dialogue_overlap",
                f"Dialogue items {previous[2]} and {current[2]} overlap without allow_overlap.",
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt", type=Path, help="Compiled prompt text file")
    parser.add_argument("--shot-card", type=Path, help="Shot card JSON used to compile the prompt")
    parser.add_argument("--model", default="seedance-2.5", help="Model adapter name")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    report = Report()
    prompt = load_text(args.prompt, report)
    card = load_card(args.shot_card, report)
    check_adapter(prompt, card, args.model, report)
    check_contradictions(prompt, report)
    check_stale_language(prompt, report)
    found, expected = check_tags(prompt, card, report)
    check_timing(prompt, card, report)
    check_dialogue_card(card, report)

    result = {
        "prompt": str(args.prompt.resolve()),
        "model": args.model,
        "valid": report.errors == 0,
        "characters": len(prompt),
        "references_found": sorted(found),
        "references_expected": sorted(expected),
        "errors": report.errors,
        "warnings": report.warnings,
        "items": report.items,
    }
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"Prompt: {result['prompt']}")
        print(
            f"Model: {args.model} | {len(prompt)} chars | {len(found)} reference(s)"
        )
        for item in report.items:
            print(f"[{item['level'].upper()}] {item['code']} - {item['message']}")
        print(f"Result: {report.errors} error(s), {report.warnings} warning(s).")
    return 1 if report.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
