import { providerWordmark } from "../../lib/provider-wordmarks";
import { ProviderLogo } from "./provider-logo";
import styles from "./provider-wordmark.module.css";

export function ProviderWordmark({ slug, name, src, size = "regular", decorative = false }: {
  slug: string;
  name: string;
  src?: string;
  size?: "compact" | "regular" | "large" | "strip";
  decorative?: boolean;
}) {
  const logo = providerWordmark(slug);
  const qualifier = logo && name.toLowerCase().startsWith(logo.name.toLowerCase())
    ? name.slice(logo.name.length)
    : "";
  return (
    <span className={styles.brand} data-size={size} aria-hidden={decorative || undefined}>
      {logo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- bundled, optimised brand assets */}
          <img src={`/brand/provider-wordmarks/${logo.file}`} alt={decorative ? "" : qualifier ? logo.name : name} width={logo.width} height={logo.height} decoding="async" />
          {qualifier && <span className={styles.qualifier}>{qualifier}</span>}
        </>
      ) : (
        <><ProviderLogo slug={slug} name={name} src={src} size={size === "compact" ? 18 : 24} /><span>{name}</span></>
      )}
    </span>
  );
}
