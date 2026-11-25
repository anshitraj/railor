export const marqueeProviders = [
  { slug: "wise", file: "wise.svg", name: "Wise", width: 88, height: 20 },
  { slug: "remitly", file: "remitly.svg", name: "Remitly", width: 135, height: 32 },
  { slug: "xoom", file: "xoom.svg", name: "Xoom", width: 300, height: 105 },
  { slug: "revolut", file: "revolut.svg", name: "Revolut", width: 145, height: 32 },
  { slug: "skydo", file: "skydo.svg", name: "Skydo", width: 112, height: 33 },
  { slug: "payzoll", file: "payzoll.webp", name: "PayZoll", width: 460, height: 120 },
  { slug: "razorpay", file: "razorpay.svg", name: "Razorpay", width: 316, height: 67 },
  { slug: "xflow", file: "xflow.svg", name: "Xflow", width: 97, height: 28 },
  { slug: "dashx", file: "dashx.svg", name: "DashX", width: 94, height: 40 },
  { slug: "infinity", file: "infinity.png", name: "Infinity", width: 177, height: 38 },
  { slug: "airwallex", file: "airwallex.webp", name: "Airwallex", width: 460, height: 63 },
  { slug: "circle", file: "circle.avif", name: "Circle", width: 391, height: 100 },
  { slug: "world-remit", file: "world-remit.png", name: "WorldRemit", width: 475, height: 109 },
] as const;

const additionalWordmarks = [
  { slug: "instarem", file: "instarem.webp", name: "Instarem", width: 460, height: 78 },
  { slug: "ofx", file: "ofx.svg", name: "OFX", width: 74, height: 30 },
  { slug: "aspora", file: "aspora.webp", name: "Aspora", width: 439, height: 92 },
];

const providerWordmarks = new Map([...marqueeProviders, ...additionalWordmarks].map((logo) => [logo.slug, logo]));

export function providerWordmark(slug: string) {
  return providerWordmarks.get(slug.replace(/^market:/, "").toLowerCase());
}
