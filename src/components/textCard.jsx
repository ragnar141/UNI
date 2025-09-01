import React from "react";

export default function TextCard({ d, left, top, onClose, showMore, setShowMore }) {
  if (!d) return null;

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

  const showAuthor = d.authorName && d.authorName !== "-";

  return (
    <div className="textCard" style={{ position: "absolute", left, top }}>
      <button className="textCard-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <div className="textCard-title">{d.title}</div>

      {showAuthor && <Row label="Author" value={d.authorName} />}
      <Row label="Date:" value={d.displayDate} />
      <Row label="Category" value={d.category} />
      <Row
        label="Original Location"
        value={d.originalGeographicalLocation || d.originalGeo}
      />
      <Row label="Original Language" value={d.originalLanguage} />
      <Row label="Comtean framework" value={d.comteanFramework} />
      <TagRow label="Symbolic System" value={d.symbolicSystemTags} />
      <Row label="Access" value={d.accessLevel} />
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
          <TagRow label="Jungian Archetypes" value={d.jungianArchetypesTags} />
          <TagRow label="Neumann Stages" value={d.neumannStagesTags} />
          <TagRow label="Socio-political" value={d.socioPoliticalTags} />
          <TagRow label="Literary Forms" value={d.literaryFormsTags} />
          <TagRow label="Literary Content" value={d.literaryContentTags} />
        </div>
      )}
    </div>
  );
}
