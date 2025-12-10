import React, {
  forwardRef,
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
} from "react";
import "../styles/timeline.css";
import ContributionModal from "./contributionModal";

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
  const [isContribOpen, setIsContribOpen] = useState(false);

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

  const renderConnectionList = (entries, groupKey) =>
  entries.map(({ conn, idx }) => {
    const targets = Array.isArray(conn.targets) ? conn.targets : [];

    const hasTargetNotes = targets.some(
      (t) => t && t.note && t.note !== "-"
    );
    const hasRowNote =
      !hasTargetNotes && conn.note && conn.note !== "-";

    return (
      <li key={`${groupKey}-${idx}`} className="textCard-connectionItem">
        <span className="textCard-connectionIntro">
          {conn.textBefore}
        </span>

        {/* Row-level note: i + tooltip, opens on hover */}
        {hasRowNote && (
          <span className="textCard-connectionTargetGroup textCard-connectionRowNoteGroup">
            <button
              type="button"
              className="textCard-connNoteToggle"
              aria-label="Show connection note"
            >
              <span className="connNoteIcon" aria-hidden="true">
                i
              </span>
            </button>

            <div className="connNoteTooltip">{conn.note}</div>
          </span>
        )}

        {targets.map((t, i) => {
          const isLast = i === targets.length - 1;
          const isFirst = i === 0;
          const needsComma = !isFirst && targets.length > 2 && !isLast;
          const needsAnd = !isFirst && isLast;

          const hasNote = t && t.note && t.note !== "-";

          return (
            <React.Fragment key={`${t.type}-${t.id}-${i}`}>
              {needsComma && ", "}
              {needsAnd && !needsComma && " and "}
              {needsAnd && needsComma && " and "}
              {!needsComma && !needsAnd && !isFirst && ", "}

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
                  <>
                    <button
                      type="button"
                      className="textCard-connNoteToggle"
                      aria-label="Show connection note"
                    >
                      <span
                        className="connNoteIcon"
                        aria-hidden="true"
                      >
                        i
                      </span>
                    </button>

                    <div className="connNoteTooltip">{t.note}</div>
                  </>
                )}
              </span>
            </React.Fragment>
          );
        })}
      </li>
    );
  });


  return (
    <>
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
        <SymbolicTagRow
          label="Symbolic System(s):"
          value={d.symbolicSystem}
        />

        {Array.isArray(connections) && connections.length > 0 && (
          <div className="textCard-connections">
            {figureConnections.length > 0 && (
              <>
                <div className="textCard-connections-subtitle">
                  Connections with Mythic/Historic Figures
                </div>
                <ul className="textCard-connections-list">
                  {renderConnectionList(figureConnections, "figure")}
                </ul>
              </>
            )}

            {textConnections.length > 0 && (
              <>
                <div className="textCard-connections-subtitle">
                  Textual References
                </div>
                <ul className="textCard-connections-list">
                  {renderConnectionList(textConnections, "text")}
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

        {/* Offer a contribution — opens shared modal */}
        <div className="textCard-contrib">
          <button
            type="button"
            className="textCard-button textCard-contrib-open"
            onClick={() => setIsContribOpen(true)}
          >
            Offer a contribution
          </button>
        </div>
      </div>

      <ContributionModal
        isOpen={isContribOpen}
        onClose={() => setIsContribOpen(false)}
        subjectType="father"
        subjectId={d.id}
        subjectTitle={title}
      />
    </>
  );
});

export default FatherCard;
