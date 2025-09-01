import React from "react";

export default function AuthorCard({ d, left, top, onClose, showMore, setShowMore }) {
  if (!d) return null;

  // local helpers (same behavior as your timeline)
  const formatYear = (y) => (y < 0 ? `${Math.abs(y)} BCE` : y > 0 ? `${y} CE` : "—");
  const fmtRange = (s, e) => `${formatYear(s)} – ${formatYear(e)}`;

  const splitTags = (s) =>
    String(s || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const Row = ({ label, value }) =>
    !value ? null : (
      <div className="textCard-row">
        <span className="textCard-label">{label}</span>
        <span className="textCard-value">{value}</span>
      </div>
    );

  const TagRow = ({ label, value }) => {
    const tags = splitTags(value);
    if (!tags.length) return null;
    return (
      <div className="textCard-row">
        <span className="textCard-label">{label}</span>
        <div className="textCard-tags">
          {tags.map((t, i) => (
            <span key={i} className="textCard-tag">
              {t}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="textCard authorCard" style={{ position: "absolute", left, top }}>
      <button className="textCard-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <div className="textCard-title">{d.name}</div>

      <Row label="Dates" value={fmtRange(d.start, d.end)} />
      <Row
        label="Original Location"
        value={d.originalGeographicalLocation || d.originalGeo}
      />
      <Row label="Original Language" value={d.originalLanguage} />
      <TagRow label="Symbolic System" value={d.symbolicSystemTags} />
      <Row label="Category" value={d.category} />
      <Row label="Comtean framework" value={d.comteanFramework} />
      <Row label="Description" value={d.shortDescription} />

      <div className="textCard-moreToggle">
        <button
          className="textCard-button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore ? "true" : "false"}
        >
          {showMore ? "Hide more" : "Show more"}
        </button>
      </div>

      {showMore && (
        <div className="textCard-more">
          <TagRow label="Arts & Sciences" value={d.artsAndSciencesTags} />
          <TagRow label="Metaphysical" value={d.metaphysicalTags} />
          <TagRow label="Socio-political" value={d.socioPoliticalTags} />
          <TagRow label="Jungian Archetypes" value={d.jungianArchetypesTags} />
          <TagRow label="Neumann Stages" value={d.neumannStagesTags} />
          {/* Include these if you keep them in your author schema */}
          <TagRow label="Literary Forms" value={d.literaryFormsTags} />
          <TagRow label="Literary Content" value={d.literaryContentTags} />
        </div>
      )}
    </div>
  );
}
