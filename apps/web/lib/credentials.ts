import "server-only";
import { decryptJson, encryptJson, secretsConfigured } from "@railor/core";

/**
 * Provider credentials at rest. Thin names over @railor/core's AES-256-GCM
 * helpers, which beneficiary details and webhook secrets share, so there is
 * exactly one encryption implementation (and one key) in the product.
 */
export const credentialsConfigured = secretsConfigured;
export const encryptCredentials = encryptJson;
export const decryptCredentials = decryptJson;
