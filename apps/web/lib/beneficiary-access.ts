import { PaymentError } from "@railor/core";
import { BENEFICIARIES_AVAILABLE, BENEFICIARIES_UNAVAILABLE_MESSAGE } from "./product-features";

export function assertBeneficiariesAvailable() {
  if (!BENEFICIARIES_AVAILABLE) throw new PaymentError("beneficiaries_disabled", BENEFICIARIES_UNAVAILABLE_MESSAGE, 403);
}
