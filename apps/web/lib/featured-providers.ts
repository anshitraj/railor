/** Who each well-known provider is for, in one plain line. Prices and eligibility always come from the live check. */
export type Audience = "Personal" | "Freelancers" | "Business";

export const FEATURED_PROVIDERS: Array<{ slug: string; name: string; summary: string; for: Audience[] }> = [
  { slug: "wise", name: "Wise", summary: "International transfers at the mid-market rate, with the fee shown upfront.", for: ["Personal", "Freelancers", "Business"] },
  { slug: "remitly", name: "Remitly", summary: "A money transfer app for sending to family abroad, to banks or mobile wallets.", for: ["Personal"] },
  { slug: "xoom", name: "Xoom", summary: "PayPal’s international money transfer service for bank deposits and pickups.", for: ["Personal"] },
  { slug: "revolut", name: "Revolut", summary: "An app-based account with currency exchange and international transfers.", for: ["Personal", "Business"] },
  { slug: "skydo", name: "Skydo", summary: "Helps Indian freelancers and exporters collect payments from overseas clients.", for: ["Freelancers", "Business"] },
  { slug: "payzoll", name: "PayZoll", summary: "Collects international payments in currencies and stablecoins, settled in INR.", for: ["Freelancers", "Business"] },
  { slug: "airwallex", name: "Airwallex", summary: "Business accounts for paying and getting paid in many currencies.", for: ["Business"] },
  { slug: "razorpay", name: "Razorpay", summary: "Indian payments company with options to receive international bank transfers.", for: ["Freelancers", "Business"] },
  { slug: "circle", name: "Circle", summary: "Issuer of the USDC and EURC stablecoins, with payment APIs for businesses.", for: ["Business"] },
];


