"""ISO codes → names for search prompts. "IN" alone reads as Indiana to a search engine."""

COUNTRIES = {
    "AE": "United Arab Emirates", "AR": "Argentina", "AU": "Australia", "BD": "Bangladesh", "BH": "Bahrain",
    "BR": "Brazil", "CA": "Canada", "CH": "Switzerland", "CL": "Chile", "CN": "China", "CO": "Colombia",
    "DE": "Germany", "EG": "Egypt", "ES": "Spain", "FR": "France", "GB": "United Kingdom", "GH": "Ghana",
    "HK": "Hong Kong", "ID": "Indonesia", "IE": "Ireland", "IL": "Israel", "IN": "India", "IT": "Italy",
    "JP": "Japan", "KE": "Kenya", "KR": "South Korea", "KW": "Kuwait", "LK": "Sri Lanka", "MA": "Morocco",
    "MX": "Mexico", "MY": "Malaysia", "NG": "Nigeria", "NL": "Netherlands", "NP": "Nepal", "NZ": "New Zealand",
    "OM": "Oman", "PE": "Peru", "PH": "Philippines", "PK": "Pakistan", "PL": "Poland", "PT": "Portugal",
    "QA": "Qatar", "SA": "Saudi Arabia", "SE": "Sweden", "SG": "Singapore", "TH": "Thailand", "TR": "Turkey",
    "TZ": "Tanzania", "UG": "Uganda", "US": "United States", "VN": "Vietnam", "ZA": "South Africa",
}

CURRENCIES = {
    "AED": "UAE dirham", "AUD": "Australian dollar", "BDT": "Bangladeshi taka", "BRL": "Brazilian real",
    "CAD": "Canadian dollar", "CHF": "Swiss franc", "CNY": "Chinese yuan", "EGP": "Egyptian pound",
    "EUR": "euro", "GBP": "British pound", "HKD": "Hong Kong dollar", "IDR": "Indonesian rupiah",
    "INR": "Indian rupee", "JPY": "Japanese yen", "KES": "Kenyan shilling", "MXN": "Mexican peso",
    "MYR": "Malaysian ringgit", "NGN": "Nigerian naira", "PHP": "Philippine peso", "PKR": "Pakistani rupee",
    "SAR": "Saudi riyal", "SGD": "Singapore dollar", "THB": "Thai baht", "TRY": "Turkish lira",
    "USD": "US dollar", "VND": "Vietnamese dong", "ZAR": "South African rand",
    "USDC": "USDC stablecoin", "USDT": "USDT stablecoin", "EURC": "EURC stablecoin",
}


def country(code: str) -> str:
    code = code.upper()
    return f"{COUNTRIES[code]} ({code})" if code in COUNTRIES else code


def currency(code: str) -> str:
    code = code.upper()
    return f"{CURRENCIES[code]} ({code})" if code in CURRENCIES else code
