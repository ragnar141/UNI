import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/searchBar.css";

/* === Tiny SVGs that mirror timeline glyphs (inline) === */
function MarkerIcon({ item }) {
  const type = item?.type;
  const color = item?.color || "#666";
  const colors = Array.isArray(item?.colors) ? item.colors.filter(Boolean) : null;
  const vb = "0 0 16 16";

  if (type === "father") {
    const r = item?.founding ? 5.5 : 4.0;
    const cx = 8, cy = 8;
    const xL = cx - r, xR = cx + r, yT = cy - r, yB = cy + r, yM = cy;
    return (
      <svg viewBox={vb} width="16" height="16" focusable="false" aria-hidden="true">
        <path d={`M ${xL} ${yT} L ${xL} ${yB} L ${xR} ${yM} Z`} fill={color} />
      </svg>
    );
  }

  if (colors && colors.length > 1) {
    const n = colors.length;
    const cx = 8, cy = 8, r = 5.5;
    const paths = [];
    if (n === 2) {
      paths.push(arcPath(cx, cy, r, 0, Math.PI));
      paths.push(arcPath(cx, cy, r, Math.PI, 2 * Math.PI));
    } else {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
        const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
        paths.push(arcPath(cx, cy, r, a0, a1));
      }
    }
    return (
      <svg viewBox={vb} width="16" height="16" focusable="false" aria-hidden="true">
        {paths.map((d, i) => (
          <path key={i} d={d} fill={colors[i]} />
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox={vb} width="16" height="16" focusable="false" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill={color} />
    </svg>
  );
}

function arcPath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const sweep = 1;
  const largeArc = ((a1 - a0 + 2 * Math.PI) % (2 * Math.PI)) > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} ${sweep} ${x1} ${y1} Z`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }) {
  if (!text || !query) return <>{text}</>;
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return <>{text}</>;
  const rx = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "ig");
  const parts = String(text).split(rx);
  return (
    <>
      {parts.map((part, i) =>
        rx.test(part) ? (
          <mark key={i} className="sb-mark">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * Props:
 * - items: Array<{ id, type: "text"|"father", title, subtitle?, category?, description?, color?, colors?, founding?, index?, textIndex? }>
 * - onSelect: (item) => void
 * - placeholder?: string
 * - maxResults?: number
 * - onInteract?: () => void
 */
export default function SearchBar({
  items = [],
  onSelect = () => {},
  placeholder = "Search",
  maxResults = 12,
  onInteract = () => {},
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hoverIdx, setHoverIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Track when the list transitions from hidden -> visible to fire onInteract once
  const listWasVisibleRef = useRef(false);

  const closeAndReset = () => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  };

  const results = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return [];
    const score = (it) => {
      let s = 0;
      const T = (v) => String(v || "").toLowerCase();
      const inc = (v, w) => (T(v).includes(qq) ? w : 0);
      s += inc(it.title, 8);
      s += inc(it.subtitle, 5);
      s += inc(it.category, 3);
      s += inc(it.description, 2);
      // Optional: also let index participate lightly
      s += inc(it.index ?? it.textIndex, 1);
      return s;
    };
    return items
      .map((it) => ({ it, s: score(it) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.it.title.localeCompare(b.it.title))
      .slice(0, maxResults)
      .map((x) => x.it);
  }, [q, items, maxResults]);

  useEffect(() => {
    setHoverIdx(0);
  }, [q]);

  // Close on any outside click/tap
  useEffect(() => {
    const handleOutside = (e) => {
      if (!(open && q.trim())) return;
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) {
        closeAndReset();
      }
    };
    document.addEventListener("pointerdown", handleOutside, true);
    return () => document.removeEventListener("pointerdown", handleOutside, true);
  }, [open, q]);

  // Notify parent when list appears
  useEffect(() => {
    const listVisible = !!(open && q.trim() && results.length > 0);
    if (listVisible && !listWasVisibleRef.current) onInteract();
    listWasVisibleRef.current = listVisible;
  }, [open, q, results, onInteract]);

  const activate = (idx) => {
    const item = results[idx];
    if (!item) return;
    onInteract();
    onSelect(item);
    closeAndReset();
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      onInteract();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => Math.min((results.length || 1) - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) activate(hoverIdx);
    } else if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      closeAndReset();
    }
  };

  return (
    <div ref={wrapRef} className="sb-wrap">
      <div className="sb-box" onMouseDown={onInteract}>
        <svg className="sb-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M21 21l-4.3-4.3m1.3-4.2a7 7 0 11-14 0 7 7 0 0114 0z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <input
          ref={inputRef}
          className="sb-input"
          type="text"
          value={q}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); onInteract(); }}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search"
        />
      </div>

      {open && q.trim() && results.length > 0 && (
        <div className="sb-popover" role="listbox" onMouseDown={onInteract}>
          {results.map((r, idx) => {
            const idxValue = r.index ?? r.textIndex; // support either prop
            return (
              <button
                key={r.id}
                className={`sb-item ${idx === hoverIdx ? "is-hover" : ""}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onClick={() => activate(idx)}
                role="option"
                aria-selected={idx === hoverIdx}
              >
                <span className="sb-dot" aria-hidden="true">
                  <MarkerIcon item={r} />
                </span>

                <div className="sb-main">
                  <div className="sb-title">
                    <span className="sb-title-text">
                      <Highlight text={r.title} query={q} />
                    </span>

                    {idxValue != null && String(idxValue).trim() !== "" && (
                      <span className="sb-index">
                        <Highlight text={String(idxValue)} query={q} />
                      </span>
                    )}
                  </div>

                  {(r.subtitle || r.category) && (
                    <div className="sb-sub">
                      {r.subtitle && (
                        <span className="sb-subtitle">
                          <Highlight text={r.subtitle} query={q} />
                        </span>
                      )}
                      {r.subtitle && r.category && <span className="sb-dotsep">•</span>}
                      {r.category && (
                        <span className="sb-category">
                          <Highlight text={r.category} query={q} />
                        </span>
                      )}
                    </div>
                  )}

                  {r.description && (
                    <div className="sb-desc">
                      <Highlight text={r.description} query={q} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && q.trim() && results.length === 0 && (
        <div className="sb-popover sb-empty" onMouseDown={onInteract}>
          No results
        </div>
      )}
    </div>
  );
}
