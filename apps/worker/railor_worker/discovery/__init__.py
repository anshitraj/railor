"""Web discovery with Google Search grounding (google-genai).

Gemini searches the live web; every page it cites is resolved and fetched by
Railor itself; a second, ungrounded pass structures claims that must each carry
a verbatim quote; and a claim survives only if that quote is really on the page
Railor fetched. Nothing is published: verified claims about known providers go
to the change review queue, unknown companies become provider candidates an
operator approves.
"""

from .run import CorridorQuery, DiscoveryReport, run_company, run_corridor, run_provider

__all__ = ["CorridorQuery", "DiscoveryReport", "run_company", "run_corridor", "run_provider"]
