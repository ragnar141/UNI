import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  isFolded,
  setIsFolded,
} from "react";
import "../styles/timeline.css";
import ContributionModal from "./contributionModal";

function FoldDensityIcon({ action }) {
  // action: "fold" | "unfold"
  // unfold = 6 full-width lines
  // fold   = 4 shorter lines (same height, visually narrower)
  return action === "unfold" ? (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8">
        <path d="M3 3.5H15" />
        <path d="M3 6.0H15" />
        <path d="M3 8.5H15" />
        <path d="M3 11.0H15" />
        <path d="M3 13.5H15" />
        <path d="M3 16.0H15" />
      </g>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8">
<path d="M5 2H10" />
<path d="M5 6.67H10" />
<path d="M5 11.33H10" />
<path d="M5 16H10" />
      </g>
    </svg>
  );
}

const TextCard = forwardRef(function TextCard(
  {
    d,
    left,
    top,
    onClose,
    showMore,
    setShowMore,
    isFolded,
    setIsFolded,
    connections = [],
    onNavigate,
    onHoverLink,

    // NEW: comes from timeline.jsx (hovering nodes on timeline)
    hoveredTimelineTarget,
  },
  ref
) {
  if (!d) return null;

  const cardRef = useRef(null);
  const scrollRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const closedOnceRef = useRef(false);
  const [isContribOpen, setIsContribOpen] = useState(false);
  

  // NEW: normalize naming in case some targets are "figure" instead of "father"
  const normType = (t) => (t === "figure" ? "father" : t);

  // Single tooltip state, rendered as a fixed overlay (outside scroll area)
  const [hoverNote, setHoverNote] = useState(null);
  const showHoverNote = (event, text) => {
    if (!text) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverNote({
      text,
      x: rect.right + 8,
      y: rect.top,
    });
  };
  const hideHoverNote = () => setHoverNote(null);



useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      if (typeof scrollRef.current.scrollTo === "function") {
        scrollRef.current.scrollTo({ top: 0 });
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
    if (!isClosing || !cardRef.current) return;
    const el = cardRef.current;

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

  // Close on Esc (capture; ignore when search list OR contrib modal is open)
  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key || e.code;
      if (key !== "Escape" && key !== "Esc") return;
      if (document.body.classList.contains("sb-open")) return;
      if (isContribOpen) {
        // ContributionModal will handle Escape itself.
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setIsClosing(true);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [isContribOpen]);

  const splitTags = (s) =>
    String(s || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  // ---- Links helpers (new) ----
  const getLoose = (obj, key) => {
    const want = String(key || "").trim().toLowerCase();
    for (const k of Object.keys(obj || {})) {
      if (String(k).trim().toLowerCase() === want) return obj[k];
    }
    return undefined;
  };

  const parseTriples = (raw) => {
    const s = String(raw ?? "").trim();
    if (!s || s === "-" || s === "—") return [];

    // Expect one or many "(url, anchor, desc)" groups
    const out = [];
    const re = /\(([^)]+)\)/g;
    const matches = [...s.matchAll(re)];

    // If it doesn't have parentheses, try treating it as a single triple
    const chunks = matches.length ? matches.map((m) => m[1]) : [s];

    for (const chunk of chunks) {
      const parts = String(chunk)
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length < 2) continue;

      const url = parts[0];
      const anchor = parts[1] || url;
      const desc = parts.slice(2).join(", ").trim(); // allow commas in description

      if (!url || url === "-") continue;
      out.push({ url, anchor, desc });
    }

    return out;
  };

  const buildLinkRows = () => {
    const fields = [
      {
        key: "originalText",
        // allow raw CSV header too:
        rawKeys: ["Original text", "Original Text"],
        iconKey: "original",
      },
      {
        key: "articlePost",
        rawKeys: ["Article/post", "Article/Post"],
        iconKey: "article",
      },
      {
        key: "imageMuseum",
        rawKeys: ["Image/museum", "Image/Museum"],
        iconKey: "image",
      },
      { key: "video", rawKeys: ["Video"], iconKey: "video" },
      { key: "other", rawKeys: ["Other"], iconKey: "other" },
    ];

    const rows = [];
    for (const f of fields) {
      const v =
        d?.[f.key] ??
        getLoose(d, f.key) ??
        f.rawKeys.map((k) => getLoose(d, k)).find((x) => x != null);

      const items = parseTriples(v);
      for (const it of items) {
        rows.push({ ...it, iconKey: f.iconKey });
      }
    }
    return rows;
  };

  const linkRows = buildLinkRows();
  const hasLinks = linkRows.length > 0;
  const linksEmpty = linkRows.length === 0;

  const iconFor = (iconKey) => {
    // placeholders for now; you’ll replace these with real icons later
    if (iconKey === "original") return "📜";
    if (iconKey === "article") return "📰";
    if (iconKey === "image") return "🖼️";
    if (iconKey === "video") return "🎥";
    return "🔗";
  };

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
  // with per-target "i" buttons that open a fixed-position tooltip.
  const renderConnectionList = (entries, groupKey) =>
    entries.map((conn, idx) => {
      const targets = Array.isArray(conn.targets) ? conn.targets : [];

      const hasTargetNotes = targets.some((t) => t && t.note && t.note !== "-");
      const hasRowNote = !hasTargetNotes && conn.note && conn.note !== "-";

      return (
        <li key={`${groupKey}-${idx}`} className="textCard-connectionItem">
          <span className="textCard-connectionIntro">{conn.textBefore}</span>

          {/* Row-level note: i + tooltip, opens on hover */}
          {hasRowNote && (
            <span className="textCard-connectionTargetGroup textCard-connectionRowNoteGroup">
              <button
                type="button"
                className="textCard-connNoteToggle"
                aria-label="Show connection note"
                onMouseEnter={(e) => showHoverNote(e, conn.note)}
                onMouseLeave={hideHoverNote}
              >
                <span className="connNoteIcon" aria-hidden="true">
                  i
                </span>
              </button>
            </span>
          )}

          {targets.map((t, i) => {
            const isLast = i === targets.length - 1;
            const isFirst = i === 0;
            const needsComma = !isFirst && targets.length > 2 && !isLast;
            const needsAnd = !isFirst && isLast;

            const hasNote = t && t.note && t.note !== "-";

            // NEW: timeline-hover -> highlight the matching link
            const isTimelineHover =
              hoveredTimelineTarget &&
              normType(hoveredTimelineTarget.type) === normType(t.type) &&
              hoveredTimelineTarget.id === t.id;

            return (
              <React.Fragment key={`${t.type}-${t.id}-${i}`}>
                {needsComma && ", "}
                {needsAnd && !needsComma && " and "}
                {needsAnd && needsComma && " and "}
                {!needsComma && !needsAnd && !isFirst && ", "}

                <span className="textCard-connectionTargetGroup">
                  <button
                    type="button"
                    className={`textCard-connectionLink${
                      isTimelineHover ? " isTimelineHover" : ""
                    }`}
                    onClick={() => onNavigate && onNavigate(t.type, t.id)}
                    onMouseEnter={() => onHoverLink && onHoverLink(t.type, t.id)}
                    onMouseLeave={() => onHoverLink && onHoverLink(null, null)}
                  >
                    {t.name}
                  </button>

                  {hasNote && (
                    <button
                      type="button"
                      className="textCard-connNoteToggle"
                      aria-label="Show connection note"
                      onMouseEnter={(e) => showHoverNote(e, t.note)}
                      onMouseLeave={hideHoverNote}
                    >
                      <span className="connNoteIcon" aria-hidden="true">
                        i
                      </span>
                    </button>
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
        ref={cardRef}
        className={`textCard tl-slideIn${isFolded ? " isFolded" : ""}`}
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

<button
  className="textCard-fold"
  onClick={() => setIsFolded((v) => !v)}
  aria-label={isFolded ? "Unfold" : "Fold"}
  title={isFolded ? "Unfold" : "Fold"}
>
  <FoldDensityIcon action={isFolded ? "unfold" : "fold"} />
</button>

        {/* Internal scroll area: tooltips render outside this via hoverNote */}
        <div className="textCard-scroll" ref={scrollRef}>
          <div className="textCard-titleCombo">
            <span className="textCard-title">{titleOnly}</span>
            {d.category && <span className="textCard-sep"> - </span>}
            {d.category && (
              <span className="textCard-category">{d.category}</span>
            )}
          </div>
{d.shortDescription && (
  <Row value={d.shortDescription} className="is-centered" />
)}

          {/* Folded mode: keep header + links + connections, but hide extra meta fields/buttons */}
          {!isFolded && (d.displayDate || metaLocation || d.originalLanguage) && (
            <div className="textCard-meta">
              {`composed in ${d.displayDate || "—"} in ${
                metaLocation || "—"
              }, in ${d.originalLanguage || "—"} language`}
              {d.authorName &&
                d.authorName !== "-" &&
                ` and attributed to ${d.authorName}`}
            </div>
          )}

          {!isFolded && (
            <SymbolicTagRow
              label="Symbolic System(s):"
              value={d.symbolicSystemTags}
            />
          )}
          {!isFolded && <Row label="Comtean framework:" value={d.comteanFramework} />}
          {!isFolded && <Row label="Access Level:" value={d.accessLevel} />}

          <div className="textCard-links">
            <div className="textCard-connections-subtitle">Links</div>

            {linksEmpty ? (
              <div className="textCard-linksEmpty">-</div>
            ) : (
              <ul className="textCard-connections-list">
                {linkRows.map((it, i) => (
                  <li key={`${it.url}-${i}`} className="textCard-connectionItem">
                    <span className="textCard-connectionIntro">
                      <span className="textCard-linkIcon" aria-hidden="true">
                        {iconFor(it.iconKey)}
                      </span>{" "}
                      <a
                        className="textCard-link"
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {it.anchor}
                      </a>
                      {it.desc ? (
                        <span className="textCard-linkDesc"> — {it.desc}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

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

          {!isFolded && (
            <div className="textCard-moreToggle">
              <button
                className="textCard-button"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore ? "true" : "false"}
              >
                {showMore ? "Hide tags" : "Show tags"}
              </button>
            </div>
          )}

          {!isFolded && showMore && (
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
          {!isFolded && (
            <div className="textCard-contrib">
              <button
                type="button"
                className="textCard-button textCard-contrib-open"
                onClick={() => setIsContribOpen(true)}
              >
                Share relevent media
              </button>
            </div>
          )}
        </div>
      </div>

      <ContributionModal
        isOpen={isContribOpen}
        onClose={() => setIsContribOpen(false)}
        subjectType="text"
        subjectId={d.id}
        subjectTitle={d.title || ""}
      />

      {hoverNote && (
        <div
          className="connNoteTooltip connNoteTooltip-fixed"
          style={{
            position: "fixed",
            top: hoverNote.y,
            left: hoverNote.x - 37,
            right: "auto",
            maxWidth: "320px",
            zIndex: 1300,
          }}
        >
          {hoverNote.text}
        </div>
      )}
    </>
  );
});

export default TextCard;