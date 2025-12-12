import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import "../styles/timeline.css";

const MEDIA_OPTIONS = [
  { value: "original_pdf", label: "Original text (PDF / doc)" },
  { value: "print_media", label: "Article / post" },
  { value: "imagery", label: "Image / museum record" },
  { value: "video", label: "Video" },
  { value: "other", label: "Other" },
];

function encode(data) {
  return Object.keys(data)
    .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(data[key] ?? ""))
    .join("&");
}

function isLikelyValidHttpsUrl(raw) {
  if (!raw) return false;
  const trimmed = raw.trim();

  if (!trimmed.startsWith("https://")) return false;
  if (/\s/.test(trimmed)) return false;
  if (trimmed.length < 12) return false;

  try {
    const u = new URL(trimmed);
    if (!u.hostname || !u.hostname.includes(".")) return false;
  } catch {
    return false;
  }

  return true;
}

function ContributionModal({
  isOpen,
  onClose,
  subjectType,
  subjectId,
  subjectTitle,
}) {
  const isFather = subjectType === "father";

  // Options available for this subject type
  const availableOptions = React.useMemo(
    () =>
      isFather
        ? MEDIA_OPTIONS.filter((opt) => opt.value !== "original_pdf")
        : MEDIA_OPTIONS,
    [isFather]
  );

  const [linkType, setLinkType] = useState("original_pdf");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  // Dynamic label for the Link field depending on linkType
  const linkLabelText = (() => {
    switch (linkType) {
      case "original_pdf":
        return "Link to a public-domain text hosted on your personal drive (Google Drive, Dropbox, etc.)";
      case "print_media":
        return "Link to a commentary or analysis (Substack, Reddit, Medium, etc.)";
      case "imagery":
        return "Link to an official museum or library record (Met, Louvre, Prado, etc.)";
      case "video":
        return "Link to a lecture or video essay (YouTube, Vimeo, etc.)";
      case "other":
      default:
        return "Link to a relevant resource";
    }
  })();

  // Reset state whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    setStatus(null);
    setIsSubmitting(false);
    setUrl("");
    setLabel("");
    setNote("");

    const allowedValues = availableOptions.map((o) => o.value);
    const defaultValue = allowedValues[0];

    setLinkType((prev) =>
      allowedValues.includes(prev) ? prev : defaultValue
    );
  }, [isOpen, availableOptions]);

  // Escape key closes only this modal
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e) => {
      const key = e.key || e.code;
      if (key === "Escape" || key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target.classList.contains("contribModal-overlay")) {
      onClose?.();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ---- NEW VALIDATION FOR SHORT DESCRIPTION ----
    const wordCount = label.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 1 || wordCount > 5) {
      setStatus({
        ok: false,
        message: "Short description must be between 1 and 5 words.",
      });
      return;
    }
    // ------------------------------------------------

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setStatus({ ok: false, message: "Please paste a link." });
      return;
    }

    // Honeypot
    if (e.target.elements["website"]?.value) return;

    // Simple rate limit
    try {
      const now = Date.now();
      const lastRaw = window.localStorage.getItem("lastContributionTs");
      const last = lastRaw ? Number(lastRaw) : 0;

      if (last && now - last < 15000) {
        setStatus({
          ok: false,
          message: "Please wait a moment before submitting again.",
        });
        return;
      }

      window.localStorage.setItem("lastContributionTs", String(now));
    } catch {}

    if (!isLikelyValidHttpsUrl(trimmedUrl)) {
      setStatus({
        ok: false,
        message: "Enter a valid https:// link.",
      });
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
        link_url: trimmedUrl,
        resource_label: label.trim(),
        note: note.trim(),
      };

      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode(payload),
      });

      if (!res.ok) throw new Error();

      setStatus({ ok: true, message: "Submission received." });
    } catch (err) {
      setStatus({ ok: false, message: "Error. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleShort =
    subjectTitle || (subjectType === "father" ? "this figure" : "this text");

  return createPortal(
    <div className="contribModal-overlay" onClick={handleBackdropClick}>
      <div className="contribModal" role="dialog" aria-modal="true">
        <button className="contribModal-close" onClick={onClose}>×</button>

        <h2 className="contribModal-title">
          <span className="contribModal-titlePrefix">Share media for</span>
          <span className="contribModal-subjectHeading">{titleShort}</span>
        </h2>

        <form name="contribution" data-netlify="true" onSubmit={handleSubmit}>
          <input type="hidden" name="form-name" value="contribution" />

          <input type="hidden" name="subject_type" value={subjectType} />
          <input type="hidden" name="subject_id" value={subjectId ?? ""} />
          <input type="hidden" name="subject_title" value={subjectTitle || ""} />

          {/* Type */}
          <div className="contribModal-field">
            <label className="contribModal-label">Type</label>
            <select
              name="link_type"
              className="contribModal-input"
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
            >
              {availableOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* URL */}
          <div className="contribModal-field">
            <label className="contribModal-label">{linkLabelText}</label>
            <input
              name="link_url"
              type="url"
              required
              placeholder="https://…"
              className="contribModal-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {/* Short description */}
          <div className="contribModal-field">
            <label className="contribModal-label">
              Short description (1–5 words)
            </label>
            <input
              name="resource_label"
              type="text"
              className="contribModal-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>

          {/* Note */}
          <div className="contribModal-field">
            <label className="contribModal-label">Broader note (optional)</label>
            <textarea
              name="note"
              rows={2}
              className="contribModal-textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {status && (
            <div
              className={
                "contribModal-status " + (status.ok ? "is-ok" : "is-error")
              }
            >
              {status.message}
            </div>
          )}

          {/* Footer */}
          <div className="contribModal-footerRow">
            <div className="contribModal-footnote">
              * Please only share public-domain or original work that is fully free to access, with no sign-ins, subscriptions, or paywalls
            </div>

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
                {isSubmitting ? "Sending…" : "Submit"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default ContributionModal;
