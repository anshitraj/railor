import { RailorMark } from "../brand";
import styles from "./price-loading-mark.module.css";

export function PriceLoadingMark({ size = 24 }: { size?: number }) {
  return <span aria-hidden="true" className={styles.mark}><RailorMark size={size} /></span>;
}
