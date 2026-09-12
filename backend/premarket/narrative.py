"""Prose: the brief lines, the narrative, news summaries. LLM when configured, templates otherwise.

The LLM may only write prose. Its JSON is validated against a schema and every number it emits must
already exist in the payload we gave it; otherwise the template is used.
"""

from __future__ import annotations

import json
import re
from typing import Any

from .models import Bias, Rating, Setup
from .providers.base import LLMProvider

NARRATIVE_SCHEMA = {
    "type": "object",
    "properties": {
        "narrative": {"type": "string"},
        "summary": {"type": "string"},
        "movers": {"type": "array", "items": {"type": "string"}},
        "sentiment": {"type": "number"},
    },
    "required": ["narrative", "summary", "movers"],
}

_NUM = re.compile(r"(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?![\w])")


def numbers_in(text: str) -> set[str]:
    return {m.group(0).replace(",", "").rstrip(".") for m in _NUM.finditer(text)}


def numbers_in_payload(payload: Any) -> set[str]:
    out: set[str] = set()

    def walk(x: Any) -> None:
        if isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
        elif isinstance(x, bool):
            return
        elif isinstance(x, (int, float)):
            s = f"{x}"
            out.add(s.rstrip("0").rstrip(".") if "." in s else s)
            out.add(f"{x:.0f}")
            out.add(f"{x:.1f}".rstrip("0").rstrip("."))
            out.add(f"{x:.2f}".rstrip("0").rstrip("."))
        elif isinstance(x, str):
            out.update(numbers_in(x))

    walk(payload)
    return out


def validate(data: dict[str, Any], schema: dict[str, Any], payload: Any) -> tuple[bool, str | None]:
    for k in schema.get("required", []):
        if k not in data:
            return False, f"missing field {k}"
    for k, spec in schema.get("properties", {}).items():
        if k in data:
            t = spec["type"]
            kinds: dict[str, Any] = {"string": str, "number": (int, float), "array": list, "object": dict}
            ok = kinds[t]
            if not isinstance(data[k], ok):
                return False, f"field {k} is not {t}"
    allowed = numbers_in_payload(payload)
    text = " ".join(str(v) for k, v in data.items() if k != "sentiment")
    for n in numbers_in(text):
        n2 = n.rstrip("0").rstrip(".") if "." in n else n
        if n2 and n2 not in allowed and n not in allowed and not re.fullmatch(r"\d{1,2}", n2):
            return False, f"number {n} not in payload"
    return True, None


def template_narrative(bias: Bias, rating: Rating, ideas: list[Setup]) -> str:
    fs = sorted(bias.factors, key=lambda f: -abs(f.weight * f.score))
    parts = [f"The window bias is {bias.label.lower()} at {bias.confidence}% confidence."]
    if fs:
        parts.append(fs[0].reason.split(" (heuristic")[0].rstrip(".") + ".")
    if len(fs) > 1:
        parts.append(f"Second, {fs[1].reason[0].lower() + fs[1].reason[1:].split(' (heuristic')[0].rstrip('.')}.")
    if bias.similar_mornings:
        parts.append(bias.similar_mornings.text)
    if ideas:
        parts.append(ideas[0].sentence)
    if bias.excluded:
        parts.append("Excluded factors: " + ", ".join(f"{e.label} ({e.why})" for e in bias.excluded) + ".")
    return " ".join(parts[:5])


def llm_prose(llm: LLMProvider, payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    system = (
        "You write a calm, plain-English morning brief for a futures day trader. Use only facts and numbers present in the payload. "
        "Never add levels, prices, times or statistics that are not in the payload. Never give a direction that contradicts payload.bias.label. "
        "narrative: 3-5 sentences on why the bias is what it is. summary: 'overnight in 60 seconds', 3-4 sentences. movers: up to 5 short lines on what could move the 9:00-12:00 window. sentiment: -1..1 for the headlines."
    )
    res = llm.complete_json(system, json.dumps(payload, default=str), NARRATIVE_SCHEMA)
    if not res.ok:
        return None, res.error or "llm unavailable"
    ok, why = validate(res.data, NARRATIVE_SCHEMA, payload)
    if not ok:
        return None, f"llm output rejected: {why}"
    return res.data, res.source
