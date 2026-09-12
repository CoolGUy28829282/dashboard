"""LLM providers. The rules provider is the always-available fallback (lexicon + templates).

Every provider returns JSON validated against the schema by the caller (premarket.narrative), which also
enforces that no number appears in the output that was not in the input payload.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from .. import config
from .base import LLMResult


class RulesLLM:
    name = "rules"

    def complete_json(self, system: str, user: str, json_schema: dict[str, Any]) -> LLMResult:
        return LLMResult(False, {}, "rules", "no LLM key configured; template used")


class AnthropicLLM:
    name = "anthropic"

    def complete_json(self, system: str, user: str, json_schema: dict[str, Any]) -> LLMResult:
        key = config.env("ANTHROPIC_API_KEY")
        if not key:
            return LLMResult(False, {}, "anthropic", "ANTHROPIC_API_KEY missing")
        model = config.env("ANTHROPIC_MODEL", "claude-sonnet-5")
        body = {
            "model": model,
            "max_tokens": 1200,
            "system": system + "\nRespond with a single JSON object matching this schema:\n" + json.dumps(json_schema),
            "messages": [{"role": "user", "content": user}],
        }
        try:
            r = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json=body,
                timeout=60,
            )
            r.raise_for_status()
            text = "".join(p.get("text", "") for p in r.json()["content"])
            return LLMResult(True, _extract_json(text), f"anthropic:{model}")
        except Exception as exc:  # noqa: BLE001
            return LLMResult(False, {}, "anthropic", str(exc))


class OpenAICompatibleLLM:
    name = "openai"

    def complete_json(self, system: str, user: str, json_schema: dict[str, Any]) -> LLMResult:
        base = config.env("OPENAI_BASE_URL", "http://localhost:11434/v1").rstrip("/")
        key = config.env("OPENAI_API_KEY", "ollama")
        model = config.env("OPENAI_MODEL", "llama3.1")
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system + "\nRespond with a single JSON object matching this schema:\n" + json.dumps(json_schema)},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        }
        try:
            r = httpx.post(f"{base}/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=body, timeout=120)
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
            return LLMResult(True, _extract_json(text), f"openai:{model}")
        except Exception as exc:  # noqa: BLE001
            return LLMResult(False, {}, "openai", str(exc))


def _extract_json(text: str) -> dict[str, Any]:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object in LLM output")
    return dict(json.loads(text[start : end + 1]))
