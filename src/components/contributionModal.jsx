import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import "../styles/timeline.css";

const MEDIA_OPTIONS = [
  { value: "video", label: "Video (YouTube, Vimeo, etc.)" },
  { value: "article", label: "Article / blog / Substack" },
  { value: "pdf", label: "PDF / scan / paper" },
  { value: "reddit", label: "Reddit thread / discussion" },
  { value: "museum", label: "Museum / library page" },
  { value: "other", label: "Other" },
];

// Same encode helper pattern Netlify likes
function encode(data) {
  return Object.keys(data)
    .map(
      (key) =>
        encodeURIComponent(key) + "=" + encodeURIComponent(data[key] ?? "")
    )
    .join("&");
}

function ContributionModal({
  isOpen,
  onClose,
  subjectType, // "text" | "father"
  subjectId,
  subjectTitle,
}) {
  const [linkType, setLinkType] = useState("video");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null); // { ok: boolean, message: string }

  // Reset state whenever we open a fresh modal
  useEffect(() => {
    if (isOpen) {
      setStatus(null);
      setIsSubmitting(false);
      setUrl("");
      setLabel("");
      setNote("");
      setLinkType("video");
    }
  }, [isOpen]);

    // Close ONLY the modal on Escape
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      const key = e.key || e.code;
      if (key !== "Escape" && key !== "Esc") return;

      e.preventDefault();
      e.stopPropagation(); // don't let it bubble to card handlers
      onClose?.();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    // Only close if they clicked the dark backdrop, not the modal content
    if (e.target.classList.contains("contribModal-overlay")) {
      onClose?.();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) {
      setStatus({ ok: false, message: "Please paste a link." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const payload = {
        "form-name": "contribution",
        subject_type: subjectType,
        subject_id: String(subjectId ?? ""),
        subject_title: subjectTitle || "",
        link_type: linkType,
        link_url: url.trim(),
        resource_label: label.trim(),
        note: note.trim(),
      };

      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setStatus({ ok: true, message: "Thank you — contribution sent." });
    } catch (err) {
      console.error("Contribution submit error:", err);
      setStatus({
        ok: false,
        message: "Something went wrong. Please try again in a moment.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const shortTitle =
    subjectTitle || (subjectType === "father" ? "this figure" : "this text");

  const modalTree = (
    <div className="contribModal-overlay" onClick={handleBackdropClick}>
      <div
        className="contribModal"
        role="dialog"
        aria-modal="true"
        aria-label={`Offer a contribution for ${shortTitle}`}
      >
        <button
          type="button"
          className="contribModal-close"
          onClick={onClose}
          aria-label="Close contribution form"
        >
          ×
        </button>

        {/* Heading split into two lines:
            "Share relevant media for"
            "Pyramid Texts" / "Imhotep" */}
        <h2 className="contribModal-title">
          <span className="contribModal-titlePrefix">
            Share relevant media for
          </span>
          <span className="contribModal-subjectHeading">{shortTitle}</span>
        </h2>

        <form name="contribution" data-netlify="true" onSubmit={handleSubmit}>
          {/* Netlify still likes to see this even when we POST via fetch */}
          <input type="hidden" name="form-name" value="contribution" />
          <input type="hidden" name="subject_type" value={subjectType} />
          <input type="hidden" name="subject_id" value={subjectId ?? ""} />
          <input
            type="hidden"
            name="subject_title"
            value={subjectTitle || ""}
          />

          <div className="contribModal-field">
            <label className="contribModal-label">Media type</label>
            <select
              name="link_type"
              className="contribModal-input"
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
            >
              {MEDIA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="contribModal-field">
            <label htmlFor="contrib-url" className="contribModal-label">
              Link (URL)
            </label>
            <input
              id="contrib-url"
              name="link_url"
              type="url"
              required
              placeholder="https://example.com/…"
              className="contribModal-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="contribModal-field">
            <label htmlFor="contrib-label" className="contribModal-label">
              Optional title / label
            </label>
            <input
              id="contrib-label"
              name="resource_label"
              type="text"
              placeholder="e.g. Brilliant commentary, lecture, edition…"
              className="contribModal-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="contribModal-field">
            <label htmlFor="contrib-note" className="contribModal-label">
              Note (optional)
            </label>
            <textarea
              id="contrib-note"
              name="note"
              rows={3}
              placeholder="Why is this useful? Any context for future readers?"
              className="contribModal-textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {status && (
            <div
              className={
                "contribModal-status " +
                (status.ok ? "is-ok" : "is-error")
              }
            >
              {status.message}
            </div>
          )}

          <div className="contribModal-actions">
            <button
              type="button"
              className="textCard-button contribModal-button is-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="textCard-button contribModal-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting…" : "Submit media"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Portal into body so the overlay sits above search bar / filters and
  // the whole blurred layer catches clicks.
  return createPortal(modalTree, document.body);
}

export default ContributionModal;
