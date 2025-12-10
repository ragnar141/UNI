import React, {
  forwardRef,
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
} from "react";
import "../styles/timeline.css";

// Helper to encode data for Netlify form POST
const encode = (data) => new URLSearchParams(data).toString();

const FatherCard = forwardRef(function FatherCard(
  {
    d,
    left = 16,
    top = 16,
    showMore = false,
    setShowMore = () => {},
    onClose = () => {},
    connections = [],
    onNavigate,
  },
  ref
) {
  if (!d) return null;

  const elRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const closedOnceRef = useRef(false);
  const [openNotes, setOpenNotes] = useState({});

  // Contribution state (mirrors TextCard)
  const [contribType, setContribType] = useState(null); // "youtube" | "pdf" | ...
  const [contribUrl, setContribUrl] = useState("");
  const [contribNote, setContribNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // "success" | "error" | null

  const contributionLabels = {
    youtube: "YouTube",
    pdf: "PDF / scan",
    substack: "Substack",
    reddit: "Reddit",
    museum: "Museum page",
    article: "Article / blog",
    other: "Random page",
  };

  const contributionOrder = [
    "pdf",
    "youtube",
    "substack",
    "reddit",
    "museum",
    "article",
    "other",
  ];

  const activeTypeLabel = contribType ? contributionLabels[contribType] : "";

  useImperativeHandle(ref, () => ({
    startClose: () => {
      if (!isClosing) setIsClosing(true);
    },
  }));

  // Always scroll the card to the top when the subject changes
  useEffect(() => {
    if (elRef.current) {
      elRef.current.scrollTop = 0;
      if (typeof elRef.current.scrollTo === "function") {
        elRef.current.scrollTo({ top: 0 });
      }
    }

    // reset contribution state when father changes
    setContribType(null);
    setContribUrl("");
    setContribNote("");
    setSubmitStatus(null);
  }, [d?.id]);

  // Animate out then call onClose
  useEffect(() => {
    if (!isClosing || !elRef.current) return;
    const el = elRef.current;

    el.classList.remove("tl-slideIn");
    el.classList.add("tl-slideOut");

    const handleDone = () => {
      if (closedOnceRef.current) return;
      closedOnceRef.current = true;
      onClose?.();
    };
    el.addEventListener("animationend", handleDone, { once: true });
    return () => el.removeEventListener("animationend", handleDone);
  }, [isClosing, onClose]);

  // Close on Esc (capture; ignore when search list is open)
  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key || e.code;
      if (key !== "Escape" && key !== "Esc") return;
      if (document.body.classList.contains("sb-open")) return;
      e.preventDefault();
      e.stopPropagation();
      setIsClosing(true);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  // Title & small utils
  const title = d.name || "";
  const indexStr = (d.index ?? "").toString().trim();

  const dateBits = [];
  if (d.dob) dateBits.push(`Born/Emerged: ${d.dob}`);
  if (d.dod) dateBits.push(`Died/Dissolved: ${d.dod}`);
  let metaLine = "";
  if (dateBits.length) {
    metaLine = dateBits.join(", ");
    if (d.location) metaLine += ` in ${d.location}`;
  } else if (d.location) {
    metaLine = `Location: ${d.location}`;
  }

  const splitTags = (s) =>
    String(s || "")
      .split(/[;,]/) // accept commas/semicolons
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => t !== "-"); // treat "-" as NA

  const Row = ({ label, value, className }) =>
    value ? (
      <div className={`textCard-row ${className || ""}`}>
        {label && <span className="textCard-label">{label}</span>}
        <span className="textCard-value">{value}</span>
      </div>
    ) : null;

  const SymbolicTagRow = ({ label, value }) => {
    const tags = splitTags(value);
    if (!tags.length) return null;
    const colors = Array.isArray(d.colors) && d.colors.length ? d.colors : [];
    const colorFor = (i) =>
      colors[i] || colors[colors.length - 1] || d.color || "#444";
    return (
      <div className="textCard-row is-tags">
        <span className="textCard-label">{label}</span>
        <div className="textCard-tags">
          {tags.map((t, i) => (
            <span
              key={i}
              className="textCard-tag"
              style={{ borderColor: colorFor(i), color: colorFor(i) }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // ---- Connections grouping ----
  const figureConnections = [];
  const textConnections = [];

  if (Array.isArray(connections)) {
    connections.forEach((conn, idx) => {
      const targets = Array.isArray(conn.targets) ? conn.targets : [];
      const hasFigure = targets.some((t) => t.type === "father");
      const hasText = targets.some((t) => t.type === "text");

      if (hasFigure) figureConnections.push({ conn, idx });
      if (hasText) textConnections.push({ conn, idx });
    });
  }

  const renderConnectionList = (entries) =>
    entries.map(({ conn, idx }) => {
      const targets = Array.isArray(conn.targets) ? conn.targets : [];

      // Check if any target has its own note
      const hasTargetNotes = targets.some(
        (t) => t && t.note && t.note !== "-"
      );

      return (
        <li key={idx} className="textCard-connectionItem">
          <span>{conn.textBefore}</span>
          {targets.map((t, i) => {
            const isLast = i === targets.length - 1;
            const isFirst = i === 0;
            const needsComma = !isFirst && targets.length > 2 && !isLast;
            const needsAnd = !isFirst && isLast;

            const noteKey = `${idx}-${i}`;
            const hasNote = t && t.note && t.note !== "-";

            return (
              <React.Fragment key={`${t.type}-${t.id}-${i}`}>
                {needsComma && ", "}
                {needsAnd && !needsComma && " and "}
                {needsAnd && needsComma && " and "}
                {!needsComma && !needsAnd && !isFirst && ", "}

                {/* Group target name + i-button so they stay on the same line */}
                <span className="textCard-connectionTargetGroup">
                  <button
                    type="button"
                    className="textCard-connTarget"
                    onClick={() =>
                      onNavigate && onNavigate(t.type, t.id)
                    }
                  >
                    {t.name}
                  </button>

                  {hasNote && (
                    <button
                      type="button"
                      className="textCard-connNoteToggle"
                      onClick={() =>
                        setOpenNotes((prev) => ({
                          ...prev,
                          [noteKey]: !prev[noteKey],
                        }))
                      }
                      aria-label="Show connection note"
                    >
                      i
                    </button>
                  )}
                </span>

                {hasNote && openNotes[noteKey] && (
                  <>
                    {": "}
                    <span className="textCard-connectionNote">
                      {t.note}
                    </span>
                  </>
                )}
              </React.Fragment>
            );
          })}

          {/* Fallback: if some legacy connections still use row-level conn.note
              and no per-target notes exist, keep old behavior. */}
          {!hasTargetNotes && conn.note && conn.note !== "-" && (
            <>
              {" "}
              <button
                type="button"
                className="textCard-connNoteToggle"
                onClick={() =>
                  setOpenNotes((prev) => ({
                    ...prev,
                    [idx]: !prev[idx],
                  }))
                }
                aria-label="Show connection note"
              >
                i
              </button>
              {openNotes[idx] && (
                <>
                  {": "}
                  <span className="textCard-connectionNote">
                    {conn.note}
                  </span>
                </>
              )}
            </>
          )}
        </li>
      );
    });

  // === Netlify submission handler for fathers ===
  const handleContributionSubmit = async (e) => {
    e.preventDefault();
    if (!contribType || !contribUrl.trim()) return;

    setIsSubmitting(true);
    setSubmitStatus(null);
    try {
      const payload = {
        "form-name": "contribution",
        subject_type: "father",
        subject_id: d.id,
        subject_title: d.name || "",
        link_type: contribType,
        link_url: contribUrl.trim(),
        note: contribNote.trim(),
      };

      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode(payload),
      });

      if (!res.ok) {
        throw new Error(`Bad response: ${res.status}`);
      }

      setSubmitStatus("success");
      setContribUrl("");
      setContribNote("");
      setContribType(null);
    } catch (err) {
      console.error("Father contribution submit failed", err);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectType = (type) => {
    setContribType(type);
    setSubmitStatus(null);
    // Keep URL/note when switching types, like in TextCard
  };

  const handleCancelContribution = () => {
    setContribType(null);
    setContribUrl("");
    setContribNote("");
    setSubmitStatus(null);
  };

  const isSubmitDisabled = !contribUrl.trim() || isSubmitting;

  return (
    <div
      ref={elRef}
      className="fatherCard tl-slideIn"
      style={{ position: "absolute", left, top }}
      role="dialog"
      aria-label={`Details for ${title}`}
    >
      {indexStr && <span className="textCard-index">{indexStr}</span>}

      <button
        className="textCard-close"
        onClick={() => setIsClosing(true)}
        aria-label="Close"
      >
        ×
      </button>

      <div className="textCard-titleCombo">
        <span className="textCard-title">{title}</span>
        {d.category && <span className="textCard-sep"> - </span>}
        {d.category && (
          <span className="textCard-category">{d.category}</span>
        )}
      </div>

      <Row value={d.description} className="is-centered" />

      {metaLine && <div className="textCard-meta">{metaLine}</div>}

      {/* Symbolic systems */}
      <SymbolicTagRow label="Symbolic System(s):" value={d.symbolicSystem} />

      {Array.isArray(connections) && connections.length > 0 && (
        <div className="textCard-connections">
          {figureConnections.length > 0 && (
            <>
              <div className="textCard-connections-subtitle">
                Connections with Mythic/Historic Figures
              </div>
              <ul className="textCard-connections-list">
                {renderConnectionList(figureConnections)}
              </ul>
            </>
          )}

          {textConnections.length > 0 && (
            <>
              <div className="textCard-connections-subtitle">
                Textual References
              </div>
              <ul className="textCard-connections-list">
                {renderConnectionList(textConnections)}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="textCard-moreToggle">
        <button
          className="textCard-button"
          onClick={() => setShowMore(!showMore)}
          aria-expanded={showMore ? "true" : "false"}
        >
          {showMore ? "Hide tags" : "Show tags"}
        </button>
      </div>

      {showMore && (
        <div className="textCard-more">
          {/* Jungian */}
          <div className="textCard-row is-tags">
            <span className="textCard-label">Jungian Archetypes:</span>
            <div className="textCard-tags">
              {splitTags(d.jungianArchetypesTags).map((t, i) => (
                <span key={`ja-${i}`} className="textCard-tag">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Neumann */}
          <div className="textCard-row is-tags">
            <span className="textCard-label">Neumann Stages:</span>
            <div className="textCard-tags">
              {splitTags(d.neumannStagesTags).map((t, i) => (
                <span key={`ns-${i}`} className="textCard-tag">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Historic/Mythic */}
          <div className="textCard-row is-tags">
            <span className="textCard-label">Historic-Mythic Status:</span>
            <div className="textCard-tags">
              {splitTags(d.historicMythicStatusTags).map((t, i) => (
                <span key={`hm-${i}`} className="textCard-tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === Offer a contribution === */}
      <div className="textCard-contrib">
        <div className="textCard-contrib-title">Offer a contribution.</div>
        <div className="textCard-contrib-buttons">
          {contributionOrder.map((type) => (
            <button
              key={type}
              type="button"
              className={`textCard-button textCard-contrib-button${
                contribType === type ? " is-active" : ""
              }`}
              onClick={() => handleSelectType(type)}
            >
              {contributionLabels[type]}
            </button>
          ))}
        </div>

        {contribType && (
          <form
            className="textCard-contrib-form"
            onSubmit={handleContributionSubmit}
          >
            <div className="textCard-row">
              <span className="textCard-label">
                {activeTypeLabel ? `${activeTypeLabel} link:` : "Link:"}
              </span>
              <input
                className="textCard-input"
                type="url"
                required
                placeholder="https://…"
                value={contribUrl}
                onChange={(e) => setContribUrl(e.target.value)}
              />
            </div>

            <div className="textCard-row">
              <span className="textCard-label">Note (optional):</span>
              <textarea
                className="textCard-textarea"
                rows={3}
                placeholder="Why this link is useful, what it covers, language, etc."
                value={contribNote}
                onChange={(e) => setContribNote(e.target.value)}
              />
            </div>

            <div className="textCard-contrib-actions">
              <button
                type="submit"
                className="textCard-button"
                disabled={isSubmitDisabled}
              >
                {isSubmitting ? "Sending…" : "Send contribution"}
              </button>
              <button
                type="button"
                className="textCard-contrib-cancel"
                onClick={handleCancelContribution}
              >
                Cancel
              </button>
            </div>

            {submitStatus === "success" && (
              <div className="textCard-contrib-status is-success">
                Thank you — contribution received.
              </div>
            )}
            {submitStatus === "error" && (
              <div className="textCard-contrib-status is-error">
                Something went wrong. Please try again later.
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
});

export default FatherCard;
