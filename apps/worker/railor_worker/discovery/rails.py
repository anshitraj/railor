"""Named payment rails, verified from their operators' own pages.

A rail is only recorded when a page Railor fetched itself — preferably the
operator's or central bank's official site — contains a sentence naming it.
That sentence and its URL are stored with the rail; no description is written
from memory. The target list is names to look for, not facts: a target that
cannot be verified is reported and skipped.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .gemini import GeminiLike, UngroundedAnswer
from .names import country as country_name
from .verify import FetchedPage, fetch_cited_pages, normalize, registrable_domain


@dataclass(frozen=True)
class RailTarget:
    code: str
    name: str
    country: str
    category: str  # payment_method enum
    operator_domain: str
    aliases: tuple[str, ...] = ()


# Live rails missing from the vocabulary (2026-09). Operator domains are where to look, not evidence.
RAIL_TARGETS: tuple[RailTarget, ...] = (
    RailTarget("NPP_AU", "New Payments Platform", "AU", "bank_transfer_local", "auspayplus.com.au", ("NPP",)),
    RailTarget("BLIK", "BLIK", "PL", "wallet_transfer", "blik.com"),
    RailTarget("IDEAL", "iDEAL", "NL", "bank_transfer_local", "ideal.nl"),
    RailTarget("BIZUM", "Bizum", "ES", "wallet_transfer", "bizum.com"),
    RailTarget("CODI", "CoDi", "MX", "bank_transfer_local", "banxico.org.mx", ("Cobro Digital",)),
    RailTarget("RAAST", "Raast", "PK", "bank_transfer_local", "sbp.org.pk"),
    RailTarget("FPX", "FPX", "MY", "bank_transfer_local", "paynet.my", ("Financial Process Exchange",)),
    RailTarget("GCASH", "GCash", "PH", "wallet_transfer", "gcash.com"),
    RailTarget("MAYA", "Maya", "PH", "wallet_transfer", "maya.ph"),
    RailTarget("BKASH", "bKash", "BD", "wallet_transfer", "bkash.com"),
    RailTarget("MTN_MOMO_GH", "MTN Mobile Money", "GH", "wallet_transfer", "mtn.com.gh", ("MoMo",)),
    RailTarget("WAVE_SN", "Wave", "SN", "wallet_transfer", "wave.com"),
    RailTarget("PESALINK", "PesaLink", "KE", "bank_transfer_local", "ipsl.co.ke"),
    RailTarget("PAYSHAP", "PayShap", "ZA", "bank_transfer_local", "payshap.co.za"),
    RailTarget("CIPS", "Cross-border Interbank Payment System", "CN", "wire", "cips.com.cn", ("CIPS",)),
    RailTarget("LYNX", "Lynx", "CA", "wire", "payments.ca"),
    RailTarget("YAPE", "Yape", "PE", "wallet_transfer", "yape.com.pe"),
    RailTarget("NEQUI", "Nequi", "CO", "wallet_transfer", "nequi.com.co"),
    RailTarget("BRE_B", "Bre-B", "CO", "bank_transfer_local", "banrep.gov.co"),
    RailTarget("INSTAPAY_EG", "InstaPay", "EG", "bank_transfer_local", "ipn.eg"),
    RailTarget("AANI", "Aani", "AE", "bank_transfer_local", "aani.ae"),
)

_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")


@dataclass
class RailResult:
    target: RailTarget
    page: FetchedPage | None = None
    quote: str | None = None
    official: bool = False
    reason: str | None = None


def _paragraphs(text: str) -> list[str]:
    """
    Re-joins lines that HTML extraction broke mid-sentence, while keeping
    headings and navigation separate: a line continues onto the next only if it
    has no closing punctuation and either ends on a lowercase word ("payments in")
    or the next line starts lowercase.
    """
    blocks: list[str] = []
    current = ""
    for raw in text.splitlines():
        line = " ".join(raw.split())
        if not line:
            if current:
                blocks.append(current)
                current = ""
            continue
        last_word = current.split()[-1] if current else ""
        continues = current and current[-1] not in ".!?" and (line[0].islower() or last_word[:1].islower())
        if continues:
            current = f"{current} {line}"
        else:
            if current:
                blocks.append(current)
            current = line
    if current:
        blocks.append(current)
    return blocks


_DESCRIBES = ("payment", "transfer", "instant", "real-time", "real time", "system", "platform", "wallet", "settlement", "clearing", "money")


def naming_sentence(text: str, names: tuple[str, ...]) -> str | None:
    """
    The best whole sentence on the page that names the rail and says what it is:
    verbatim, capitalised start, closing punctuation, 40–350 characters, and at
    least one descriptive payments word (a headline that merely mentions the name
    doesn't count).
    """
    pattern = re.compile(r"(?<![\w-])(" + "|".join(re.escape(normalize(n)) for n in names) + r")(?![\w-])")
    best: tuple[int, str] | None = None
    for sentence in (s for block in _paragraphs(text) for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"“(])", block)):
        sentence = sentence.strip()
        if not 40 <= len(sentence) <= 350 or not sentence[0].isupper() and not sentence[0].isdigit() or sentence[-1] not in ".!?":
            continue
        lowered = normalize(sentence)
        if not pattern.search(lowered):
            continue
        score = sum(w in lowered for w in _DESCRIBES)
        if not score:
            continue
        # Navigation and titles glued onto a sentence ("Home News Blog …", "What is X | Y") read badly.
        first = sentence.split()[:8]
        if " | " in sentence:
            score -= 2
        if len(sentence) > 240:
            score -= 2
        if sum(w[:1].isupper() for w in first) >= 6:
            score -= 2
        if best is None or score > best[0]:
            best = (score, sentence)
    return best[1] if best and best[0] > 0 else None


def verify_rail(target: RailTarget, gemini: GeminiLike, *, user_agent: str, max_pages: int = 4) -> RailResult:
    prompt = (
        "Search the web now and cite official sources. "
        f"What is {target.name}, the payment system in {country_name(target.country)}? "
        f"Cite its operator's or the central bank's official website (for example {target.operator_domain})."
    )
    try:
        grounded = gemini.grounded_search(prompt)
    except UngroundedAnswer as exc:
        return RailResult(target, reason=str(exc))
    # The operator's own pages first.
    citations = sorted(grounded.citations, key=lambda c: registrable_domain(c.title or "") != registrable_domain(target.operator_domain))
    pages, skipped = fetch_cited_pages(citations, user_agent=user_agent, max_pages=max_pages)
    names = (target.name, *target.aliases)
    operator = registrable_domain(target.operator_domain)
    ordered = sorted(pages, key=lambda p: not (registrable_domain(p.url) == operator or registrable_domain(p.url).endswith("." + operator)))
    for page in ordered:
        quote = naming_sentence(page.text, names)
        if quote:
            domain = registrable_domain(page.url)
            return RailResult(target, page, quote, official=domain == operator or domain.endswith("." + operator))
    reasons = "; ".join(f"{s.url[:60]}: {s.reason}" for s in skipped[:3])
    return RailResult(target, reason=f"no fetched page names {target.name}" + (f" ({reasons})" if reasons else ""))


def save_rail(result: RailResult) -> str:
    """Insert or re-verify a rail. Only rails whose country Railor indexes are stored."""
    from ..db import connection

    t = result.target
    with connection() as conn:
        if not conn.execute("select 1 from countries where code = %s", (t.country,)).fetchone():
            return "country not indexed"
        conn.execute(
            """
            insert into named_rails (code, name, country_code, category, description, source_url, source_quote, verified_at)
            values (%s, %s, %s, %s, %s, %s, %s, now())
            on conflict (code) do update
               set source_url = excluded.source_url, source_quote = excluded.source_quote, verified_at = now()
            """,
            (t.code, t.name, t.country, t.category, result.quote, result.page.url, result.quote),
        )
        conn.commit()
    return "saved"
