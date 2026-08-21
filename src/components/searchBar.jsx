// searchBar.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/searchbar.css";
import MarkerIcon from "./markerIcon";
import { getTypographyClassForSystems } from "./symbolicTypography";

/* === Utils === */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* NEW: diacritic / apostrophe / punctuation–insensitive folding for search */
function foldForSearch(s) {
  return String(s || "")
    .normalize("NFD") // split base chars + diacritics
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[’‘ʻʼ`´]/g, "'") // normalize apostrophes
    .replace(/['"]/g, "") // drop apostrophes/quotes
    .replace(/[^a-zA-Z0-9]+/g, " ") // punctuation → spaces
    .trim()
    .toLowerCase();
}

/* === Fuzzy helpers === */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// Damerau-Levenshtein (handles transpositions like "horemheb" vs "homerheb")
function damerauLevenshtein(a, b, maxDist = 3) {
  a = String(a || "");
  b = String(b || "");
  if (a === b) return 0;

  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;

  // quick length prune
  if (Math.abs(al - bl) > maxDist) return maxDist + 1;

  const dp = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;

  for (let i = 1; i <= al; i++) {
    let rowMin = Infinity;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;

      let v = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );

      // transposition
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, dp[i - 2][j - 2] + 1);
      }

      dp[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }

    // early exit if the best possible is already too large
    if (rowMin > maxDist) return maxDist + 1;
  }

  return dp[al][bl];
}

function tokenizeFolded(s) {
  return foldForSearch(s).split(/\s+/).filter(Boolean);
}

function durationLabelFromId(id) {
  if (!id) return null;
  if (id.startsWith("custom-")) {
    const m = id.match(/^custom-(.+?)-composite$/);
    return (m ? m[1] : id.slice("custom-".length)).trim();
  }
  const m = id.match(/^(.+?)-composite$/);
  return (m ? m[1] : id).trim();
}

/* === Helpers for date/field handling === */
function cleanField(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t && t !== "-" && t !== "—" ? t : null;
}
function formatYearHuman(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "—";
  return n < 0 ? `${Math.abs(n)} BCE` : `${n} CE`;
}

/* === Highlight component === */
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
          <mark key={i} className="sb-mark">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/* === Derive symbolic-system colors from item tags via global lookup === */
function deriveSymbolColorsFromItem(r) {
  // Prefer pre-provided props
  if (Array.isArray(r.colors) && r.colors.filter(Boolean).length > 1) {
    return { colors: r.colors.filter(Boolean) };
  }
  if (r.color) return { color: r.color };

  // Pull possible tag fields
  const raw =
    r.symbolic ??
    r.symbolicSystems ??
    r.symbolicSystem ??
    r.tags ??
    r.category ??
    r.tag;

  // Normalize to array of tokens
  const tokens = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[;,/|]/)
        .map((s) => s.trim())
        .filter(Boolean);

  // Global lookup injected by timeline (fallback to empty)
  const LOOKUP =
    (typeof window !== "undefined" &&
      (window.SYMBOLIC_COLOR_LOOKUP || window.SYMBOLIC_COLOR_MAP)) ||
    {};

  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    const lc = t.toLowerCase();
    const tc = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    const c = LOOKUP[t] || LOOKUP[lc] || LOOKUP[tc];
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }

  if (out.length > 1) return { colors: out };
  if (out.length === 1) return { color: out[0] };
  return {};
}


const DEFAULT_CONNECTION_LEGEND = [
  { id: "explicit", label: "Explicit reference", strokeWidth: 1.4, dasharray: null },
  { id: "indirect", label: "Indirect connection", strokeWidth: 1.4, dasharray: "6 4" },
  { id: "comparative", label: "Comparative connection", strokeWidth: 1.4, dasharray: "1 6" },
  { id: "speculative", label: "Speculative connection", strokeWidth: 1.6, dasharray: "6 3 1.5 3" },
];

/*
 * Stable geographic vocabulary for the Context field. These are places, not
 * political owners: Rome -> Italian Peninsula, Persia -> Iranian Plateau,
 * India -> Indian Subcontinent, etc. Historical regime identity is added
 * separately when the source duration represents an imperial overlay.
 */
const TRACK_CONTEXT_NAME_BY_ID = {
  indian: "Indian Subcontinent",
  chinese: "China",
  iranian: "Iranian Plateau",
  mesopotamian: "Mesopotamia",
  levantine: "Levant",
  egyptian: "Egypt",
  anatolian: "Anatolia",
  greek: "Greece",
  "north-african": "North African Coast",
  italic: "Italian Peninsula",
};

/*
 * Level-2 macro geography. Some historical regions straddle modern academic
 * macro-regions; this table chooses one stable UI parent so the breadcrumb does
 * not flicker as the camera moves along a single horizontal track.
 */
const TRACK_MACRO_CONTEXT_BY_ID = {
  italic: "Mediterranean",
  greek: "Mediterranean",
  egyptian: "Mediterranean",
  "north-african": "Mediterranean",
  anatolian: "West Asia",
  levantine: "West Asia",
  mesopotamian: "West Asia",
  iranian: "West Asia",
  indian: "South Asia",
  chinese: "East Asia",
};

/*
 * Macro-geographic typography is deliberately separate from the historical
 * leaf typography below. Each large-scale context has its own cartographic
 * voice while remaining optically normalized inside the same fixed line box.
 */
const CONTEXT_MACRO_TYPOGRAPHY_CLASS = {
  Global: "sb-contextMacroFont--global",
  Mediterranean: "sb-contextMacroFont--mediterranean",
  "West Asia": "sb-contextMacroFont--westAsia",
  "South Asia": "sb-contextMacroFont--southAsia",
  "East Asia": "sb-contextMacroFont--eastAsia",
};

/*
 * Context labels are not text/father records, but they should use the exact
 * same symbolic-system typography resolver as TextCard / FatherCard.
 *
 * We therefore translate the currently occupied historical field to one
 * representative symbolic-system tag.  Regime identity takes precedence:
 * Roman Greece -> Roman, Persian Levant -> Persian, Hellenistic Anatolia ->
 * Hellenistic. Native fields fall back to a representative system belonging
 * to that regional typography group.
 */
const CONTEXT_SYMBOLIC_SYSTEM_BY_REGIME = {
  roman: "Roman",
  hellenistic: "Hellenistic",
  persian: "Persian",
};

const CONTEXT_SYMBOLIC_SYSTEM_BY_TRACK = {
  italic: "Roman",
  greek: "Hellenic",
  iranian: "Persian",
  mesopotamian: "Akkadian",
  levantine: "Canaanite",
  egyptian: "Egyptian",
  anatolian: "Hittite",
  indian: "Indian",
  chinese: "Shang–Zhou",
  "north-african": "Berber",
};

function getContextTypographyClass(trackId, regimeLabel) {
  const regimeKey = String(regimeLabel || "")
    .trim()
    .toLowerCase();

  const symbolicSystem =
    CONTEXT_SYMBOLIC_SYSTEM_BY_REGIME[regimeKey] ||
    CONTEXT_SYMBOLIC_SYSTEM_BY_TRACK[trackId] ||
    "";

  return getTypographyClassForSystems(symbolicSystem);
}

function KeyCueIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="7" r="1.55" fill="currentColor" />
      <path d="M10 7h8M10 12h8M10 17h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.25 13.4 6 10.45l1.75 2.95h-3.5Z" fill="currentColor" />
      <rect x="4.55" y="15.55" width="2.9" height="2.9" rx="0.35" fill="currentColor" />
    </svg>
  );
}

function LegendMarker({ type }) {
  const props =
    type === "text"
      ? { type: "text", founding: false, historic: false, concept: false }
      : type === "historic"
        ? { type: "father", founding: false, historic: true, concept: false }
        : type === "concept"
          ? { type: "father", founding: false, historic: false, concept: true }
          : { type: "father", founding: false, historic: false, concept: false };

  return <MarkerIcon {...props} color="#4b5563" />;
}

function ConnectionLegendSample({ strokeWidth, dasharray }) {
  return (
    <svg className="sb-key-lineSample" viewBox="0 0 68 14" aria-hidden="true">
      <line
        x1="3"
        y1="7"
        x2="65"
        y2="7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={dasharray || undefined}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function TimelineKey() {
  return (
    <div className="sb-key-content" aria-label="Timeline symbol key">
      <section className="sb-key-section">
        <div className="sb-key-heading">Objects</div>
        <div className="sb-key-symbolGrid">
          <div className="sb-key-item"><span className="sb-key-symbol"><LegendMarker type="text" /></span><span>Text</span></div>
          <div className="sb-key-item"><span className="sb-key-symbol"><LegendMarker type="figure" /></span><span>Mythic Figure</span></div>
          <div className="sb-key-item"><span className="sb-key-symbol"><LegendMarker type="historic" /></span><span>Historic Figure</span></div>
          <div className="sb-key-item"><span className="sb-key-symbol"><LegendMarker type="concept" /></span><span>Concept</span></div>
        </div>
      </section>

      <section className="sb-key-section sb-key-section--connections">
        <div className="sb-key-heading">Connections</div>
        <div className="sb-key-connectionGrid">
          {DEFAULT_CONNECTION_LEGEND.map((item) => (
            <div className="sb-key-connectionItem" key={item.id}>
              <ConnectionLegendSample strokeWidth={item.strokeWidth} dasharray={item.dasharray} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Props:
 * - items: Array<...>
 * - onSelect: (item) => void
 * - placeholder?: string
 * - maxResults?: number
 * - onInteract?: () => void
 * - visibleIds?: Set<string>
 */
export default function SearchBar({
  items = [],
  onSelect = () => {},
  placeholder = "Search",
  maxResults = 12,
  onInteract = () => {},
  visibleIds,
  context = null,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hoverIdx, setHoverIdx] = useState(0);
  const [keyOpen, setKeyOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Refs for auto-scrolling + keyboard/mouse nav mode
  const popoverRef = useRef(null);
  const itemRefs = useRef([]);
  const navModeRef = useRef("mouse"); // "mouse" | "keyboard"
  const navResetTimerRef = useRef(null);

  const setKeyboardNav = () => {
    navModeRef.current = "keyboard";
    if (navResetTimerRef.current) clearTimeout(navResetTimerRef.current);
    // After a short pause with no key navigation, allow mouse hover again
    navResetTimerRef.current = setTimeout(() => {
      navModeRef.current = "mouse";
      navResetTimerRef.current = null;
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (navResetTimerRef.current) clearTimeout(navResetTimerRef.current);
    };
  }, []);

  useEffect(() => {}, [items, maxResults, visibleIds]);

  const listWasVisibleRef = useRef(false);

  const closeAndReset = () => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  };

  const results = useMemo(() => {
    // CHANGED: fold query for diacritics/punctuation-insensitive match
    const qq = foldForSearch(q);

    const base =
      visibleIds instanceof Set
        ? items.filter((it) => visibleIds.has(it.id))
        : items;

    if (!qq) {
      return [];
    }

    const score = (it) => {
      let s = 0;

      // CHANGED: fold field text too
      const T = (v) => foldForSearch(v);
      const title = T(it.title);

      const inc = (v, w) => (T(v).includes(qq) ? w : 0);

      // Fuzzy thresholds (dynamic)
      const maxDistFor = (str) => {
        const L = (str || "").length;
        if (L <= 4) return 1;
        if (L <= 8) return 2;
        return 3;
      };

      const fuzzyTitleBonus = () => {
        if (!title || !qq) return 0;

        // If we already have a direct hit, don't waste time
        if (title.includes(qq)) return 0;

        // 1) whole-query vs whole-title
        const maxDWhole = maxDistFor(qq);
        const dWhole = damerauLevenshtein(qq, title, maxDWhole);
        let bonus = 0;
        if (dWhole <= maxDWhole) {
          bonus = Math.max(bonus, 10 - dWhole * 3);
        }

        // 2) token-to-token (for single-bad-word typos like "homerheb")
        const qTokens = tokenizeFolded(qq);
        const tTokens = tokenizeFolded(title);

        if (qTokens.length) {
          let matched = 0;
          let distSum = 0;

          for (const qt of qTokens) {
            const md = maxDistFor(qt);
            let best = md + 1;

            for (const tt of tTokens) {
              // fast prune
              if (Math.abs(qt.length - tt.length) > md) continue;
              const d = damerauLevenshtein(qt, tt, md);
              if (d < best) best = d;
              if (best === 0) break;
            }

            if (best <= md) {
              matched += 1;
              distSum += best;
            }
          }

          if (matched > 0) {
            const req = qTokens.length <= 2 ? 1 : Math.ceil(qTokens.length * 0.6);
            if (matched >= req) {
              const avgD = distSum / matched;
              bonus = Math.max(bonus, 8 + matched * 2 - avgD * 3);
            }
          }
        }

        return bonus;
      };

      // Title: strong, position-aware scoring + fuzzy fallback
      if (title && qq) {
        const idx = title.indexOf(qq);
        if (idx !== -1) {
          // base title hit
          s += 8;

          if (title === qq) {
            // exact title match: e.g. father "Ra"
            s += 20;
          } else {
            if (idx === 0) {
              // title starts with query
              s += 6;
            }
            const prevChar = idx > 0 ? title[idx - 1] : " ";
            if (
              prevChar === " " ||
              prevChar === "—" ||
              prevChar === "-" ||
              prevChar === "(" ||
              prevChar === "["
            ) {
              // word-boundary hit inside the title
              s += 3;
            }
          }
        } else {
          // NEW: fuzzy title match so typos still show results
          s += fuzzyTitleBonus();
        }
      }

      // Other fields: keep existing weights
      s += inc(it.subtitle, 5);
      s += inc(it.category, 3);
      s += inc(it.description, 2);
      s += inc(it.index ?? it.textIndex, 1);
      s += inc(it.author, 4);
      s += inc(it.date, 2);
      s += inc(it.dob, 2);

      return s;
    };

    return base
      .map((it) => ({ it, s: score(it) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.it.title.localeCompare(b.it.title))
      .slice(0, maxResults)
      .map((x) => x.it);
  }, [q, items, maxResults, open, visibleIds]);

  // Reset hover to first when query changes
  useEffect(() => {
    setHoverIdx(0);
  }, [q]);

  // Reset item refs when results change
  useEffect(() => {
    itemRefs.current = [];
  }, [results]);

  // Close on outside click
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

  // Notify when list first becomes visible
  useEffect(() => {
    const listVisible = !!(open && q.trim() && results.length > 0);
    if (listVisible && !listWasVisibleRef.current) {
      onInteract();
    }
    listWasVisibleRef.current = listVisible;
  }, [open, q, results, onInteract]);

  // Auto-scroll hovered item into view
  useEffect(() => {
    const container = popoverRef.current;
    const el = itemRefs.current[hoverIdx];
    if (!container || !el) return;

    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (elTop < viewTop) {
      container.scrollTop = elTop; // scroll up
    } else if (elBottom > viewBottom) {
      container.scrollTop = elBottom - container.clientHeight; // scroll down
    }
  }, [hoverIdx, results]);

  const activate = (idx) => {
    const item = results[idx];
    if (!item) return;
    onInteract();
    try {
      onSelect(item);
    } catch {
      /* swallow */
    }
    requestAnimationFrame(() => {
      closeAndReset();
    });
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      onInteract();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setKeyboardNav();
      setHoverIdx((i) => Math.min((results.length || 1) - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setKeyboardNav();
      setHoverIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) {
        activate(hoverIdx);
      }
    } else if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      closeAndReset();
    }
  };

  // When user moves the mouse inside the list, switch back to mouse mode
  const onPopoverMouseMove = () => {
    navModeRef.current = "mouse";
    if (navResetTimerRef.current) {
      clearTimeout(navResetTimerRef.current);
      navResetTimerRef.current = null;
    }
  };

  const maybeHoverByMouse = (idx) => {
    if (navModeRef.current === "keyboard") return; // ignore hover while keyboard nav is active
    setHoverIdx(idx);
  };

  const renderTextItem = (r, idx, isHover) => {
    const rawAuthor =
      r.author ??
      (Array.isArray(r.authors) ? r.authors.filter(Boolean).join(", ") : null) ??
      r.subtitle;

    const author = (() => {
      if (rawAuthor == null) return null;
      const t = String(rawAuthor).trim();
      return t && t !== "-" ? t : null;
    })();

    const date =
      cleanField(r.date ?? r.year ?? r.dob) ??
      (Number.isFinite(Number(r.when)) ? formatYearHuman(r.when) : null);

    const idxDisplay = cleanField(r.index ?? r.textIndex);

    return (
      <button
        ref={(el) => (itemRefs.current[idx] = el)}
        key={r.id}
        className={`sb-item ${isHover ? "is-hover" : ""}`}
        onMouseEnter={() => maybeHoverByMouse(idx)}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          activate(idx);
        }}
        role="option"
        aria-selected={isHover}
        type="button"
      >
        <div className="sb-line sb-line1">
          <span className="sb-inline-icon" aria-hidden="true">
            <MarkerIcon
              type="text"
              founding={false}
              historic={!!(r.historic ?? r.isHistoric)}
              {...deriveSymbolColorsFromItem(r)}
            />
          </span>
          <span className="sb-title-text">
            <Highlight text={r.title} query={q} />
          </span>

          {date ? (
            <>
              <span className="sb-sep" />
              <span className="sb-date">
                <Highlight text={String(date)} query={q} />
              </span>
            </>
          ) : null}

          <span style={{ marginLeft: "auto" }} />

          {idxDisplay ? (
            <span className="sb-index" aria-hidden="true">
              <Highlight text={String(idxDisplay)} query={q} />
            </span>
          ) : null}
        </div>

        {author && (
          <div
            className="sb-line sb-line2 sb-author-line"
            style={{ display: "flex", alignItems: "baseline", gap: 0 }}
          >
            <div>
              {author ? (
                <>
                  <span className="sb-light">by</span>
                  <span className="sb-sep" />
                  <span className="sb-author">
                    <Highlight text={author} query={q} />
                  </span>
                </>
              ) : null}
            </div>

            <span style={{ marginLeft: "auto" }} />
          </div>
        )}

        {r.category ? (
          <div className="sb-line sb-line3">
            <span className="sb-category">
              <Highlight text={r.category} query={q} />
            </span>
          </div>
        ) : null}

        {r.description ? (
          <div className="sb-line sb-desc">
            <Highlight text={r.description} query={q} />
          </div>
        ) : null}
      </button>
    );
  };

  const renderFatherItem = (r, idx, isHover) => {
    const date =
      cleanField(r.dob ?? r.date) ??
      (Number.isFinite(Number(r.when)) ? formatYearHuman(r.when) : null);

    const idxDisplay = cleanField(r.index);
    const durationLabel = r.durationId ? durationLabelFromId(r.durationId) : null;

    return (
      <button
        ref={(el) => (itemRefs.current[idx] = el)}
        key={r.id}
        className={`sb-item ${isHover ? "is-hover" : ""}`}
        onMouseEnter={() => maybeHoverByMouse(idx)}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          activate(idx);
        }}
        role="option"
        aria-selected={isHover}
        type="button"
      >
        <div className="sb-line sb-line1">
          <span className="sb-inline-icon" aria-hidden="true">
            <MarkerIcon
              type="father"
              founding={!!r.founding}
              historic={!!(r.historic ?? r.isHistoric)}
              concept={!!(r.concept ?? r.isConcept)}
              {...deriveSymbolColorsFromItem(r)}
            />
          </span>
          <span className="sb-title-text">
            <Highlight text={r.title} query={q} />
          </span>
          {date ? (
            <>
              <span className="sb-sep" />
              <span className="sb-date">
                <Highlight text={String(date)} query={q} />
              </span>
            </>
          ) : null}

          <span style={{ marginLeft: "auto" }} />

          {idxDisplay ? (
            <span className="sb-index" aria-hidden="true">
              <Highlight text={String(idxDisplay)} query={q} />
            </span>
          ) : null}
        </div>

        {(r.category || durationLabel) && (
          <div
            className="sb-line sb-line2"
            style={{ display: "flex", alignItems: "baseline", gap: 0 }}
          >
            <div>
              {r.category ? (
                <span className="sb-category">
                  <Highlight text={r.category} query={q} />
                </span>
              ) : null}
            </div>

            <span style={{ marginLeft: "auto" }} />

            {durationLabel ? (
              <span className="sb-category sb-right-meta">
                <Highlight text={durationLabel} query={q} />
              </span>
            ) : null}
          </div>
        )}

        {r.description ? (
          <div className="sb-line sb-desc">
            <Highlight text={r.description} query={q} />
          </div>
        ) : null}
      </button>
    );
  };

  const listVisible = !!(open && q.trim() && results.length > 0);

  // keep body class in sync (used to dim the graph)
  useEffect(() => {
    document.body.classList.toggle("sb-open", listVisible);
    return () => document.body.classList.remove("sb-open");
  }, [listVisible]);

  const liveContextLevel = context?.level || "global";
  const contextVisible = liveContextLevel !== "global";

  /*
   * Keep the last meaningful context in the DOM while the field collapses.
   * This is deliberately a ref rather than state: it adds no animation loop,
   * timer, or extra render. The wrapper can therefore fade/slide the existing
   * text out instead of React removing it in the same frame that zoom crosses
   * back into the global tier.
   */
  const lastVisibleContextRef = useRef(null);
  if (contextVisible && context) {
    lastVisibleContextRef.current = context;
  }

  const displayContext = contextVisible
    ? context
    : lastVisibleContextRef.current;

  const contextLevel = displayContext?.level || liveContextLevel;
  const contextTrackId = displayContext?.trackId || null;
  const contextMacroLabel = contextTrackId
    ? TRACK_MACRO_CONTEXT_BY_ID[contextTrackId] || null
    : null;
  const contextRegionLabel = contextTrackId
    ? TRACK_CONTEXT_NAME_BY_ID[contextTrackId] ||
      displayContext?.trackLabel ||
      contextTrackId
    : null;
  const contextLeafLabel =
    contextLevel === "region" || contextLevel === "regime"
      ? contextRegionLabel
        ? displayContext?.regimeLabel
          ? `${displayContext.regimeLabel} ${contextRegionLabel}`
          : contextRegionLabel
        : null
      : null;
  const contextAccent = displayContext?.color || "#6b7280";
  const contextTypographyClass = contextTrackId && contextLeafLabel
    ? getContextTypographyClass(contextTrackId, displayContext?.regimeLabel)
    : "";
  const contextMacroTypographyClass =
    CONTEXT_MACRO_TYPOGRAPHY_CLASS[
      contextLevel === "global" ? "Global" : contextMacroLabel
    ] || "";
  const toggleKey = () => {
    onInteract();
    closeAndReset();
    setKeyOpen((value) => !value);
  };

  return (
    <div
      ref={wrapRef}
      className={`sb-wrap ${keyOpen ? "is-key-open" : ""} ${
        contextVisible ? "has-context" : "is-context-hidden"
      }`}
      style={{ "--sb-context-accent": contextAccent }}
    >
      <div className="sb-shell">
        <div
          className={`sb-contextField is-${contextLevel}`}
          aria-live={contextVisible ? "polite" : undefined}
          aria-hidden={!contextVisible}
          aria-label={
            contextVisible
              ? contextLeafLabel
                ? `Context: ${contextMacroLabel || ""}, ${contextLeafLabel}`
                : `Context: ${contextMacroLabel || contextRegionLabel || ""}`
              : undefined
          }
        >
          <div className="sb-contextContent">
            <span className="sb-contextPrefix">Context:</span>

            {contextMacroLabel ? (
              <span
                className={`sb-contextMacro sb-contextMacroFont ${contextMacroTypographyClass}`}
              >
                {contextMacroLabel}
              </span>
            ) : null}

            {contextLeafLabel ? (
              <>
                <span className="sb-contextDelimiter" aria-hidden="true">,</span>
                <span className={`sb-contextLabel ${contextTypographyClass}`}>
                  {contextLeafLabel}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="sb-searchCell">
          <div
            className="sb-box"
            onMouseDown={() => {
              onInteract();
            }}
          >
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
              onFocus={() => {
                setKeyOpen(false);
                setOpen(true);
                onInteract();
              }}
              onChange={(e) => {
                setQ(e.target.value);
              }}
              onKeyDown={onKeyDown}
              aria-label="Search"
            />
          </div>

          {open && q.trim() && results.length > 0 && (
            <div
              ref={popoverRef}
              className="sb-popover"
              role="listbox"
              onMouseDown={() => {
                onInteract();
              }}
              onMouseMove={onPopoverMouseMove}
            >
              {results.map((r, idx) => {
                const isHover = idx === hoverIdx;
                return r.type === "father"
                  ? renderFatherItem(r, idx, isHover)
                  : renderTextItem(r, idx, isHover);
              })}
            </div>
          )}

          {open && q.trim() && results.length === 0 && (
            <div
              className="sb-popover sb-empty"
              onMouseDown={() => {
                onInteract();
              }}
            >
              No results
            </div>
          )}
        </div>

        <button
          type="button"
          className={`sb-keyToggle ${keyOpen ? "is-active" : ""}`}
          aria-expanded={keyOpen}
          aria-controls="timeline-search-key"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleKey}
        >
          <span className="sb-keyToggleIcon" aria-hidden="true"><KeyCueIcon /></span>
          <span>Key</span>
        </button>
      </div>

      {listVisible &&
        createPortal(
          <div
            className="sb-backdrop"
            onMouseDown={() => {
              closeAndReset();
            }}
            aria-hidden="true"
          />,
          document.body
        )}

      {keyOpen ? (
        <div id="timeline-search-key" className="sb-keyPanel">
          <TimelineKey />
        </div>
      ) : null}
    </div>
  );
}