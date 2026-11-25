import "server-only";
import { getIntentOptions } from "../reference";
import { resolveDestinations, type Destination } from "./destinations";

/**
 * The destinations Railor can price today, from its reference data. A failed
 * lookup leaves the lists empty so a guide page still renders; the menus
 * simply omit the country links until the data is back.
 */
export async function loadGuideDestinations(): Promise<{ popular: Destination[]; all: Destination[] }> {
  try {
    const options = await getIntentOptions();
    return resolveDestinations(options.countries, options.currencies, options.currencyByCountry);
  } catch {
    return { popular: [], all: [] };
  }
}
