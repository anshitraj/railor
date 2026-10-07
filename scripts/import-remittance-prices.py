"""Import the latest survey quarter from World Bank's public RPW workbook.

Usage: python scripts/import-remittance-prices.py /path/to/rpw_dataset.xlsx [download_url]
No credentials or third-party Python dependencies. Keeps original survey
amounts, countries and dates; never extrapolates them into current quotes.
Source and CC BY 4.0 license: https://datacatalog.worldbank.org/search/dataset/0037898/remittance-prices-worldwide
"""
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://datacatalog.worldbank.org/search/dataset/0037898/remittance-prices-worldwide"

def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None

def date(value):
    for fmt in ("%d/%b/%Y", "%d/%B/%Y", "%d-%b-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(str(value), fmt).date().isoformat()
        except ValueError:
            pass
    numeric = number(value)
    if numeric and 40000 < numeric < 60000:
        return (dt.datetime(1899, 12, 30) + dt.timedelta(days=numeric)).date().isoformat()
    return None

def slug(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-") or hashlib.sha256(name.encode()).hexdigest()[:12]

def read_rows(book, sheet, strings):
    for _, row in ET.iterparse(book.open(sheet), events=("end",)):
        if row.tag != "{" + NS["s"] + "}row":
            continue
        result = {}
        for cell in row:
            val = cell.find("s:v", NS)
            if val is not None:
                result[re.sub(r"\d", "", cell.get("r", ""))] = strings[int(val.text)] if cell.get("t") == "s" else val.text
        yield result
        row.clear()

def main():
    path = Path(sys.argv[1])
    download_url = sys.argv[2] if len(sys.argv) > 2 else SOURCE
    quarter, records = (0, 0), []
    with zipfile.ZipFile(path) as book:
        strings = ["".join(si.itertext()) for si in ET.fromstring(book.read("xl/sharedStrings.xml"))]
        for row in read_rows(book, "xl/worksheets/sheet6.xml", strings):
            match = re.fullmatch(r"(\d{4})_(\d)Q", row.get("B", ""))
            if not match:
                continue
            current = tuple(map(int, match.groups()))
            if current > quarter:
                quarter, records = current, []
            if current == quarter:
                records.append(row)
    if not records:
        raise ValueError("No RPW survey rows found; workbook layout may have changed")
    providers, samples, skipped = {}, [], 0
    for row in records:
        name = row.get("O", "").strip()
        observed = date(row.get("AO"))
        if not name or not observed:
            skipped += 1
            continue
        key = slug(name)
        if key in providers and providers[key]["name"] != name:
            key += "-" + hashlib.sha256(name.encode()).hexdigest()[:6]
        providers[key] = {"slug": key, "name": name, "type": row.get("P", "Unknown")}
        for columns in (("T", "V", "W", "Y", "Z"), ("AA", "AC", "AD", "AF", "AG")):
            amount, currency, fee, margin, total = columns
            value, charge = number(row.get(amount)), number(row.get(fee))
            if value is None or value <= 0 or charge is None or charge < 0 or not re.fullmatch(r"[A-Z]{3}", row.get(currency, "")):
                continue
            transparent = row.get("AI", "").lower() == "yes"
            samples.append({"provider": key, "sourceCountry": row.get("C"), "sourceCountryName": row.get("D"), "destinationCountry": row.get("I"), "destinationCountryName": row.get("J"), "sourceCurrency": row[currency], "amount": value, "fee": charge, "fxMarginPct": number(row.get(margin)) if transparent else None, "totalCostPct": number(row.get(total)) if transparent else None, "transparent": transparent, "paymentMethod": row.get("Q", ""), "pickupMethod": row.get("AN", ""), "delivery": row.get("S", ""), "observedAt": observed})
    used = {sample["provider"] for sample in samples}
    providers = [providers[key] for key in sorted(used)]
    result = {"sourceUrl": SOURCE, "downloadUrl": download_url, "license": "CC BY 4.0", "attribution": "The World Bank, Remittance Prices Worldwide", "retrievedAt": dt.datetime.now(dt.timezone.utc).date().isoformat(), "period": f"{quarter[0]} Q{quarter[1]}", "workbookSha256": hashlib.sha256(path.read_bytes()).hexdigest(), "providerEntryCount": len(providers), "providers": providers, "samples": samples}
    target = ROOT / "packages/core/src/public-pricing/data/world-bank-remittances.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"period": result["period"], "providerEntries": len(providers), "samples": len(samples), "skippedUndatedRows": skipped, "bytes": target.stat().st_size}))

if __name__ == "__main__":
    main()
