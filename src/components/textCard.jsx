import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import "../styles/timeline.css";
import ContributionModal from "./contributionModal";

const TextCard = forwardRef(function TextCard(
  { d, left, top, onClose, showMore, setShowMore, connections = [], onNavigate },
  ref
) {
  if (!d) return null;

  const elRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const closedOnceRef = useRef(false);
  const [isContribOpen, setIsContribOpen] = useState(false);

  // Always scroll the card to the top when it opens / subject changes
useEffect(() => {
  if (elRef.current) {
    elRef.current.scrollTop = 0;
    if (typeof elRef.current.scrollTo === "function") {
      elRef.current.scrollTo({ top: 0 });
    }
  }
}, [d?.id]);

  useImperativeHandle(ref, () => ({
    startClose: () => {
      if (!isClosing) setIsClosing(true);
    },
  }));

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

  const splitTags = (s) =>
    String(s || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const Row = ({ label, value, className }) =>
    !value ? null : (
      <div className={`textCard-row ${className || ""}`}>
        {label && <span className="textCard-label">{label}</span>}
        <span className="textCard-value">{value}</span>
      </div>
    );

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

  // Shared renderer for connection lists (textual + mythic),
  // with per-target "i" buttons that open speech-bubble tooltips.
  const renderConnectionList = (entries, groupKey) =>
  entries.map((conn, idx) => {
    const targets = Array.isArray(conn.targets) ? conn.targets : [];

    const hasTargetNotes = targets.some(
      (t) => t && t.note && t.note !== "-"
    );
    const hasRowNote =
      !hasTargetNotes && conn.note && conn.note !== "-";

    return (
      <li
        key={`${groupKey}-${idx}`}
        className="textCard-connectionItem"
      >
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
                  className="textCard-connectionLink"
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

  const metaLocation = d.originalGeographicalLocation || d.originalGeo;
  const indexStr = (d.textIndex ?? "").toString().trim();
  const titleOnly = d.title || "";

  // Split connections into textual vs mythic/mythic-historic figures
  const textualConnections = Array.isArray(connections)
    ? connections.filter((c) => !c.section || c.section === "textual")
    : [];

  const mythicConnections = Array.isArray(connections)
    ? connections.filter((c) => c.section === "mythic")
    : [];

  const hasTextual = textualConnections.length > 0;
  const hasMythic = mythicConnections.length > 0;

  return (
    <>
      <div
        ref={elRef}
        className="textCard tl-slideIn"
        style={{ position: "absolute", left, top }}
        role="dialog"
        aria-label={`Details for ${titleOnly}`}
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
          <span className="textCard-title">{titleOnly}</span>
          {d.category && <span className="textCard-sep"> - </span>}
          {d.category && (
            <span className="textCard-category">{d.category}</span>
          )}
        </div>

        <Row value={d.shortDescription} className="is-centered" />

        {(d.displayDate || metaLocation || d.originalLanguage) && (
          <div className="textCard-meta">
            {`composed in ${d.displayDate || "—"} in ${
              metaLocation || "—"
            }, in ${d.originalLanguage || "—"} language`}
            {d.authorName &&
              d.authorName !== "-" &&
              ` and attributed to ${d.authorName}`}
          </div>
        )}

        <SymbolicTagRow
          label="Symbolic System(s):"
          value={d.symbolicSystemTags}
        />
        <Row label="Comtean framework:" value={d.comteanFramework} />
        <Row label="Access Level:" value={d.accessLevel} />

        {(hasTextual || hasMythic) && (
          <div className="textCard-connections">
            {hasMythic && (
              <>
                <div className="textCard-connections-subtitle">
                  Connections with Mythic/Historic Figures
                </div>
                <ul className="textCard-connections-list">
                  {renderConnectionList(mythicConnections, "mythic")}
                </ul>
              </>
            )}

            {hasTextual && (
              <>
                <div className="textCard-connections-subtitle">
                  Textual References
                </div>
                <ul className="textCard-connections-list">
                  {renderConnectionList(textualConnections, "textual")}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="textCard-moreToggle">
          <button
            className="textCard-button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore ? "true" : "false"}
          >
            {showMore ? "Hide tags" : "Show tags"}
          </button>
        </div>

        {showMore && (
          <div className="textCard-more">
            <div className="textCard-row is-tags">
              <span className="textCard-label">Arts & Sciences:</span>
              <div className="textCard-tags">
                {splitTags(d.artsAndSciencesTags).map((t, i) => (
                  <span key={`as-${i}`} className="textCard-tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="textCard-row is-tags">
              <span className="textCard-label">Metaphysical:</span>
              <div className="textCard-tags">
                {splitTags(d.metaphysicalTags).map((t, i) => (
                  <span key={`m-${i}`} className="textCard-tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>

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

            <div className="textCard-row is-tags">
              <span className="textCard-label">Socio-political:</span>
              <div className="textCard-tags">
                {splitTags(d.socioPoliticalTags).map((t, i) => (
                  <span key={`sp-${i}`} className="textCard-tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="textCard-row is-tags">
              <span className="textCard-label">Literary Forms:</span>
              <div className="textCard-tags">
                {splitTags(d.literaryFormsTags).map((t, i) => (
                  <span key={`lf-${i}`} className="textCard-tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="textCard-row is-tags">
              <span className="textCard-label">Literary Themes:</span>
              <div className="textCard-tags">
                {splitTags(d.literaryContentTags).map((t, i) => (
                  <span key={`lc-${i}`} className="textCard-tag">
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
        subjectType="text"
        subjectId={d.id}
        subjectTitle={d.title || ""}
      />
    </>
  );
});

export default TextCard;
