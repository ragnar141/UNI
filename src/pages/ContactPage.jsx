import "../styles/contactPage.css";

export default function ContactPage() {
  return (
    <div className="contactPage">
      <div className="contactPage__inner">
        <section className="contactCommunity">
          <p className="contactCommunity__lead">
            We use Instagram to share new material, announce courses, ask
            questions, and continue discussions around the project. It is also
            a place for people following the project to encounter one another.
          </p>

          <a
            className="contactCommunity__primaryLink"
            href="https://instagram.com/"
            target="_blank"
            rel="noreferrer"
          >
            Instagram <span aria-hidden="true">↗</span>
          </a>
        </section>

        <footer className="contactFooter">
          <div className="contactFooter__socials" aria-label="Other channels">
            <a href="https://youtube.com/" target="_blank" rel="noreferrer">
              YouTube ↗
            </a>

            <a href="https://reddit.com/" target="_blank" rel="noreferrer">
              Reddit ↗
            </a>
                        <a href="https://discord.com/" target="_blank" rel="noreferrer">
              Discord ↗
            </a>
          </div>

          <div className="contactFooter__email">
            <span className="contactFooter__label">Contact us</span>
            <a href="mailto:we@yourdomain.org">we@yourdomain.org</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
