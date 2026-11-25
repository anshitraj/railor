import { Mail } from "lucide-react";
import { contactEmail } from "../../../lib/security";
import styles from "./help.module.css";

/** How to reach a person. Until a contact address is configured, it says so instead of showing a dead link. */
export function HelpContact({ signedIn }: { signedIn: boolean }) {
  const email = contactEmail();
  return (
    <section id="contact" className={styles.contact} aria-labelledby="contact-title">
      <span className={styles.contactIcon}><Mail size={20} aria-hidden /></span>
      <div>
        <h2 id="contact-title">Still need help?</h2>
        <p>
          {email
            ? <>Write to us and tell us the route, the amount and what you saw. {signedIn ? "We will reply to the email on your account." : "We reply by email."}</>
            : "Direct support is opening soon. Until then, the articles above cover most questions."}
        </p>
      </div>
      {email ? <a className={`${styles.contactButton} press`} href={`mailto:${email}?subject=${encodeURIComponent("Railor help")}`}>Email us</a> : null}
    </section>
  );
}
