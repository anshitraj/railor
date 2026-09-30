"""The only two things discovery asks of Gemini — and what it refuses to accept.

1. `grounded_search`: a question answered with Google Search grounding. Only the
   *citations* are kept (the pages Google actually returned); the prose answer is
   discarded, because unsourced prose is exactly what must never become data. An
   answer without grounding metadata is rejected outright.
2. `extract_claims`: structured claims from page text Railor fetched itself, each
   with a verbatim quote that verify.py checks against that text.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal, Protocol

from pydantic import BaseModel, Field

DEFAULT_MODEL = "gemini-2.5-flash"


class UngroundedAnswer(Exception):
    """The model answered from memory instead of searching."""


class ExtractionFailed(Exception):
    """Structured extraction was cut off or empty — a failure, not an empty result."""


@dataclass
class Citation:
    uri: str
    title: str


@dataclass
class GroundedResult:
    queries: list[str] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)


class Claim(BaseModel):
    provider_name: str = Field(description="The company the claim is about, as named on the page.")
    provider_website: str | None = Field(default=None, description="That company's own website domain if the page states or links it, e.g. wise.com. Never guess.")
    kind: Literal["coverage", "pricing", "limit", "requirement", "product", "speed"]
    statement: str = Field(description="The fact in one short plain sentence.")
    quote: str = Field(description="One contiguous sentence copied character for character from the source text that states this fact. No ellipses, no paraphrase.")
    source_id: int = Field(description="The [n] id of the source the quote comes from.")
    entity_country: str | None = Field(default=None, description="ISO-2 country of the sending/receiving business, only if stated.")
    destination_country: str | None = Field(default=None, description="ISO-2, only if stated.")
    destination_currency: str | None = Field(default=None, description="ISO-4217, only if stated.")
    source_asset: str | None = Field(default=None, description="e.g. USD, USDC — only if stated.")


class Extraction(BaseModel):
    claims: list[Claim] = Field(default_factory=list)


class GeminiLike(Protocol):
    def grounded_search(self, prompt: str) -> GroundedResult: ...
    def extract_claims(self, instructions: str, sources: list[tuple[int, str, str]]) -> list[Claim]: ...


class Gemini:
    """google-genai client: Gemini API key, or Vertex AI with application default credentials."""

    def __init__(self, model: str | None = None) -> None:
        from google import genai  # imported lazily: the rest of the worker runs without it

        self.model = model or os.getenv("RAILOR_DISCOVERY_MODEL") or DEFAULT_MODEL
        if os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() == "true":
            self.client = genai.Client(vertexai=True, project=os.getenv("GOOGLE_CLOUD_PROJECT"), location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"))
        else:
            key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not key:
                raise SystemExit("Web discovery needs GEMINI_API_KEY (or GOOGLE_GENAI_USE_VERTEXAI=true with application default credentials).")
            self.client = genai.Client(api_key=key)

    def _config(self, **kwargs):
        from google.genai import types

        return types.GenerateContentConfig(
            temperature=0,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            **kwargs,
        )

    def grounded_search(self, prompt: str) -> GroundedResult:
        from google.genai import types

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=self._config(tools=[types.Tool(google_search=types.GoogleSearch())]),
        )
        metadata = response.candidates[0].grounding_metadata if response.candidates else None
        chunks = (metadata.grounding_chunks or []) if metadata else []
        citations = [Citation(uri=c.web.uri, title=c.web.title or c.web.domain or "") for c in chunks if c.web and c.web.uri]
        if not citations:
            raise UngroundedAnswer("Gemini answered without searching the web; nothing from that answer is used.")
        return GroundedResult(queries=list(metadata.web_search_queries or []), citations=citations)

    def extract_claims(self, instructions: str, sources: list[tuple[int, str, str]]) -> list[Claim]:
        from google.genai import types

        blocks = "\n\n".join(f"[{sid}] {url}\n{text}" for sid, url, text in sources)
        response = self.client.models.generate_content(
            model=self.model,
            contents=f"{instructions}\n\nSOURCES\n\n{blocks}",
            # Copying quotes needs little reasoning; a small budget keeps runs fast and cheap.
            config=self._config(
                response_mime_type="application/json",
                response_schema=Extraction,
                max_output_tokens=24_000,
                thinking_config=types.ThinkingConfig(thinking_budget=1024),
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, Extraction):
            return parsed.claims
        candidate = response.candidates[0] if response.candidates else None
        reason = getattr(candidate, "finish_reason", None)
        if not response.text or (reason is not None and str(reason).split(".")[-1] not in ("STOP", "FINISH_REASON_UNSPECIFIED")):
            # Never let a failed extraction look like "the pages said nothing".
            raise ExtractionFailed(f"extraction did not complete (finish reason {reason}, {len(response.text or '')} chars)")
        return Extraction.model_validate_json(response.text).claims
