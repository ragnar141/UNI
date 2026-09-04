import { useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles/timelineExit.css";

export default function LibraryGatewayPage() {
  useEffect(() => {
    let cancelled = false;
    let idleId = null;
    let timeoutId = null;

    const warmLibrary = () => {
      if (!cancelled) {
        import("../components/timeline.jsx");
      }
    };

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(warmLibrary, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(warmLibrary, 350);
    }

    return () => {
      cancelled = true;

      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <div className="standardPage libraryGateway">
      <div className="libraryGateway__inner">
        <header className="libraryGateway__header">

          <p className="libraryGateway__lead">
                  Our Library is an ever-expanding archive of texts. It currently brings together public-domain works from antiquity through 400 CE that are available in English, alongside selected historical and mythological figures and Eastern metaphysical concepts. The material is organized chronologically and geographically.
          </p>
        </header>

        <div className="libraryGateway__meta">
          <span>Best experience — laptop or larger monitor</span>
          <span>Supported — tablet</span>
          <span>Preferred input — mouse / cursor</span>
        </div>

        <section className="libraryGateway__audit">
          <h2>Help audit the Library</h2>

          <p>
          The Library is built and maintained with extensive assistance from LLMs. Our datasets have undergone multiple rounds of automated checking, but they still need a human touch. We are looking for volunteer archivists, historians, researchers, and careful readers willing to help it grow and help identify errors, weak sourcing, misclassification, invented connections, or any AI slop that may have slipped through.

          </p>

        </section>

        <div className="libraryGateway__footer">
          <p className="libraryGateway__video">Video tutorial — coming soon</p>

          <Link className="libraryGateway__enter" to="/library/archive">
            Enter Library <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
