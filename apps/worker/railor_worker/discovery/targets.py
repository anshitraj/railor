"""Companies not yet in the registry, to research from their own sites.

Name + official domain only — where to look, not what is true. Each run turns
a company's verified claims into a provider candidate an operator approves.
"""

COMPANY_TARGETS: tuple[tuple[str, str], ...] = (
    ("Adyen", "adyen.com"),
    ("Razorpay", "razorpay.com"),
    ("Revolut Business", "revolut.com"),
    ("Ebury", "ebury.com"),
    ("Convera", "convera.com"),
    ("Corpay", "corpay.com"),
    ("Flywire", "flywire.com"),
    ("TransferMate", "transfermate.com"),
    ("Remitly", "remitly.com"),
    ("Western Union", "westernunion.com"),
    ("TerraPay", "terrapay.com"),
    ("Tipalti", "tipalti.com"),
    ("OFX", "ofx.com"),
    ("WorldFirst", "worldfirst.com"),
    ("PingPong", "pingpongx.com"),
    ("Instarem", "instarem.com"),
    ("Veem", "veem.com"),
    ("Trolley", "trolley.com"),
    ("Paysend", "paysend.com"),
    ("Modulr", "modulrfinance.com"),
    ("ClearBank", "clear.bank"),
    ("Nuvei", "nuvei.com"),
    ("Zepz (WorldRemit)", "worldremit.com"),
    ("Mercury", "mercury.com"),
)
