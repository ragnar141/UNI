import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import "../styles/tagPanel.css";

/* Simple portal so the dropdown renders at <body> level */
function MenuPortal({ children }) {
  return createPortal(children, document.body);
}

/**
 * TagPanel — controlled filter panel (dropdowns portaled to <body>)
 * Props:
 *  - groups: [{ key, label, appliesTo, allTags: string[] }]
 *  - selectedByGroup: { [key: string]: Set<string> }
 *  - onChange: (nextSelectedByGroup) => void
 *  - layerMode: "durations" | "segments" | "none" | "noborders"
 *  - onLayerModeChange: (mode) => void
 *
 *  - showTexts: boolean
 *  - onShowTextsChange: (bool) => void
 *  - showFathers: boolean
 *  - onShowFathersChange: (bool) => void
 *  - showConnections: boolean
 *  - onShowConnectionsChange: (bool) => void
 */
export default function TagPanel({
  groups,
  selectedByGroup,
  onChange,
  layerMode = "durations",
  onLayerModeChange = () => {},

  // NEW: global visibility overrides
  showTexts = true,
  onShowTextsChange = () => {},
  showFathers = true,
  onShowFathersChange = () => {},
  showConnections = true,
  onShowConnectionsChange = () => {},
}) {
  const [openKey, setOpenKey] = useState(null); // which group's menu is open
  const [isOpen, setIsOpen] = useState(false); // slide-out state (false = hidden)

  const panelRef = useRef(null);
  const menuRef = useRef(null); // portal menu container
  const btnRefs = useRef(new Map()); // groupKey -> button element
  const lastOpenBtnRef = useRef(null); // remember which tag button opened the menu

  // Order + sectioning: layers + visibility + tags + groups
const ORDER = [
  "__layers__",       // section: "Layers" (radio controls)
  "__visibility__",
    "__tags__",         // section: "Tags"
  "artsSciences",
  "literaryForms",
  "literaryContent",
  "metaphysical",
  "socioPolitical",
  "comtean",
  "jungian",
  "neumann",
  "symbolicSystems",
  ];
  // Panel-only label overrides (does not mutate incoming group objects)
  const LABEL_OVERRIDES = {
    literaryContent: "Literary Themes",
    comtean: "Comtean Framework",
  };

  // When texts are globally hidden, these tag groups are effectively irrelevant.
  // We'll render their buttons in a "faint/disabled-looking" style.
  const TEXT_DEPENDENT_GROUP_KEYS = new Set([
    "artsSciences",
    "literaryForms",
    "literaryContent",
    "metaphysical",
    "socioPolitical",
    "comtean",
  ]);

  // Custom tag orders for specific groups (others stay alphabetical)
  const CUSTOM_ORDERS = {
    comtean: [
      "Theological/Mythological",
      "Philosophical/Metaphysical",
      "Positive/Empirical",
      "Synthetic Literature",
    ],
    metaphysical: [
      "Apophatic–Aporetic (Unknowability)",
      "Phenomenology–Idealism (Experience)",
      "Dualism–Non-Dualism (Unity)",
      "Grid–Continuum (Ontology)",
      "Ritual–Ethics (Practice)",
      "Dialectics–Argumentation (Reason)",
      "Time–Eternity (Temporality)",
      "Self–No-Self (Subjectivity)",
      "None Applicable",
    ],
    socioPolitical: [
      "Priestly",
      "Warrior",
      "Bureaucratic",
      "Merchant",
      "Artisan",
      "Rural",
      "Imperial",
      "Tribal",
      "Urban",
      "None Applicable",
    ],
  };

  // Build ordered groups list with section headers
  const orderedGroups = useMemo(() => {
    const groupsByKey = new Map((groups || []).map((g) => [g.key, g]));
    const out = [];

    for (const key of ORDER) {
      if (key === "__layers__") {
        out.push({ __section: true, label: "Layers", key });
        continue;
      }
      if (key === "__visibility__") {
        out.push({ __section: true, label: "Visibility", key });
        continue;
      }
      if (key === "__tags__") {
        out.push({ __section: true, label: "Tags", key });
        continue;
      }

      const g = groupsByKey.get(key);
      if (!g) continue;
      out.push(g);
    }

    // Append any leftover groups not in ORDER (stable)
    for (const g of groups || []) {
      if (!ORDER.includes(g.key)) out.push(g);
    }

    return out;
  }, [groups]);

  // Convert selectedByGroup into maps for stable lookups
  const selectedMaps = useMemo(() => {
    const m = new Map();
    for (const [k, v] of Object.entries(selectedByGroup || {})) {
      m.set(k, v instanceof Set ? v : new Set(v || []));
    }
    return m;
  }, [selectedByGroup]);

 // Position the floating portal menu so it slides out to the LEFT of the panel,
// and is vertically centered relative to the clicked button.
function positionMenu({ measure } = { measure: false }) {
  const key = openKey;
  if (!key) return;

  const btnEl = btnRefs.current.get(key);
  const menuEl = menuRef.current;
  const panelEl = panelRef.current;
  if (!btnEl || !menuEl || !panelEl) return;

  // Make sure positioning is viewport-based (we use getBoundingClientRect)
  menuEl.style.position = "fixed";

  const btnRect = btnEl.getBoundingClientRect();
  const panelRect = panelEl.getBoundingClientRect();

  // Measure menu AFTER it's in the DOM
  const menuRect = menuEl.getBoundingClientRect();

  const gap = -1;        // space between panel edge and menu
  const pad = 10;       // viewport padding for clamping

  // Align the menu's RIGHT edge to the panel's LEFT edge (tucked-under feel)
  let left = panelRect.left - gap - menuRect.width;

  // Vertically center relative to the clicked button
  let top =
  panelRect.top +
  panelRect.height / 2 -
  menuRect.height / 2;

  // Clamp to viewport
  left = Math.max(pad, Math.min(left, window.innerWidth - menuRect.width - pad));
  top = Math.max(pad, Math.min(top, window.innerHeight - menuRect.height - pad));

  // NEW: snap to whole pixels to avoid blurry text
  left = Math.round(left);
  top  = Math.round(top);

  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;

  if (measure) {
    // Force reflow for measurement when needed
    // eslint-disable-next-line no-unused-expressions
    menuEl.offsetHeight;
  }
}

  function closeMenu() {
  setOpenKey(null);

  // If Esc closed the menu, the trigger button may still be focused (focus-visible styles).
  // Blur it so border returns to normal.
  requestAnimationFrame(() => {
    lastOpenBtnRef.current?.blur?.();
    lastOpenBtnRef.current = null;
  });
}


  function toggleMenu(key) {
    setOpenKey((prev) => (prev === key ? null : key));
  }

  function toggleTag(groupKey, tag) {
    const next = { ...(selectedByGroup || {}) };
    const cur =
      next[groupKey] instanceof Set
        ? next[groupKey]
        : new Set(next[groupKey] || []);

    if (cur.has(tag)) cur.delete(tag);
    else cur.add(tag);

    next[groupKey] = cur;
    onChange(next);
  }

  function setAllTagsForGroup(groupKey, allTags) {
  const next = { ...(selectedByGroup || {}) };
  next[groupKey] = new Set(allTags || []);
  onChange(next);
  }

function clearAllTagsForGroup(groupKey) {
  const next = { ...(selectedByGroup || {}) };
  next[groupKey] = new Set();
  onChange(next);
  }

  // Close on outside click + Esc (CAPTURE phase so nothing can block it)
  useEffect(() => {
    if (!isOpen) return;

    const onDocDown = (e) => {
      const panelEl = panelRef.current;
      const portalEl = menuRef.current;

      if (
        (panelEl && panelEl.contains(e.target)) ||
        (portalEl && portalEl.contains(e.target))
      ) {
        return;
      }

      setIsOpen(false);
      setOpenKey(null);
    };

const onKey = (e) => {
  if (e.key !== "Escape") return;

  // Stop other Escape handlers in the app from also running.
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === "function") {
    e.stopImmediatePropagation();
  }

if (openKey) {
  closeMenu();
  return;
}
  setIsOpen(false);
  setOpenKey(null);
};


    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
}, [isOpen, openKey]);


  // Reposition the floating menu on scroll/resize while open
  useEffect(() => {
    if (!openKey) return;
    const onWin = () => positionMenu({ measure: true });

    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);

    return () => {
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOpen, openKey]);

  // If texts are hidden while a text-dependent menu is open, close that menu.
  useEffect(() => {
    if (!openKey) return;
    if (!showTexts && TEXT_DEPENDENT_GROUP_KEYS.has(openKey)) {
      setOpenKey(null);
    }
  }, [showTexts, openKey]);

  

  // If BOTH texts and fathers are hidden, connections become meaningless;
  // auto-disable connections and close any open menu.
  useEffect(() => {
    const nothingRenderable = !showTexts && !showFathers;
    if (!nothingRenderable) return;

    // force connections off
    if (showConnections) onShowConnectionsChange(false);

    // close any open tag dropdown
    if (openKey) setOpenKey(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTexts, showFathers]);

  // When a menu opens, position it on the next frame so we can measure height
  useEffect(() => {
    if (!openKey) return;

    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => positionMenu({ measure: true }));
      return () => cancelAnimationFrame(r2);
    });

    return () => cancelAnimationFrame(r1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  function renderCountBadge(count, total) {
    // Show "count/total" for quick sense of filtering
    return (
      <span className="tagPanel__count">
        {count}/{total}
      </span>
    );
  }

  function renderLayerRadios() {
    return (
      <div className="tagPanel__radios">

        <label className="tagPanel__radio">
          <input
            type="radio"
            name="layerMode"
            value="noborders"
            checked={layerMode === "noborders"}
            onChange={() => onLayerModeChange("noborders")}
          />
          <span className="tagPanel__label">None</span>
        </label>


        <label className="tagPanel__radio">
          <input
            type="radio"
            name="layerMode"
            value="durations"
            checked={layerMode === "durations"}
            onChange={() => onLayerModeChange("durations")}
          />
          <span className="tagPanel__label">Civilizational Arcs</span>
        </label>

        <label className="tagPanel__radio">
          <input
            type="radio"
            name="layerMode"
            value="segments"
            checked={layerMode === "segments"}
            onChange={() => onLayerModeChange("segments")}
          />
          <span className="tagPanel__label">Historical Periods</span>
        </label>

        <label className="tagPanel__radio">
          <input
            type="radio"
            name="layerMode"
            value="none"
            checked={layerMode === "none"}
            onChange={() => onLayerModeChange("none")}
          />
          <span className="tagPanel__label">Borders Only</span>
        </label>


      </div>
    );
  }

  // --- global visibility toggles ---
  function renderVisibilityToggles() {
    return (
      <div className="tagPanel__visibility">
        <label className="tagPanel__row">
          <input
            type="checkbox"
            checked={!!showTexts}
            onChange={(e) => onShowTextsChange(e.target.checked)}
          />
          <span className="tagPanel__label tagPanel__rowLabel">Texts</span>
        </label>

        <label className="tagPanel__row">
          <input
            type="checkbox"
            checked={!!showFathers}
            onChange={(e) => onShowFathersChange(e.target.checked)}
          />
          <span className="tagPanel__label tagPanel__rowLabel">Mythic/Historic Figures</span>
        </label>

        <label className="tagPanel__row">
          <input
            type="checkbox"
            checked={!!showConnections}
            onChange={(e) => onShowConnectionsChange(e.target.checked)}
          />
          <span className="tagPanel__label tagPanel__rowLabel">Connections</span>
        </label>
      </div>
    );
  }

  return (
    <div
      className={`tagPanelWrap ${
        isOpen ? "tagPanelWrap--open" : "tagPanelWrap--closed"
      }`}
      ref={panelRef}
    >
      {/* Attached vertical tab */}
      <button
        type="button"
        className="tagPanel__tab"
        onClick={() => {
          setIsOpen((v) => !v);
          if (isOpen) setOpenKey(null);
        }}
        aria-expanded={isOpen}
      >
        FILTERS
      </button>
      {isOpen && (
  <button
    type="button"
    className="tagPanel__close tagPanel__panelClosePos"
    onClick={() => {
      setIsOpen(false);
      setOpenKey(null);
    }}
    aria-label="Close filters"
    title="Close"
  >
    ×
  </button>
)}

      {/* Inner scrollable area */}
      <div className="tagPanel__content">
        {orderedGroups.map((g) => {
          if (g.__section) {
            if (g.key === "__layers__") {
              return (
                <div key={g.key}>
                  <div className="tagPanel__sectionLabel">{g.label}</div>
                  {renderLayerRadios()}
                </div>
              );
            }

            if (g.key === "__visibility__") {
              return (
                <div key={g.key}>
                  <div className="tagPanel__sectionLabel">{g.label}</div>
                  {renderVisibilityToggles()}
                </div>
              );
            }

            return (
              <div key={g.key} className="tagPanel__sectionLabel">
                {g.label}
              </div>
            );
          }

          const set = selectedMaps.get(g.key) || new Set();
          const total = g.allTags.length;
          const count = set.size;
          const isDropdownOpen = openKey === g.key;

          let items = [...g.allTags];

          const customOrder = CUSTOM_ORDERS[g.key];
          if (customOrder) {
            const indexMap = new Map(customOrder.map((name, idx) => [name, idx]));
            items.sort((a, b) => {
              const ia = indexMap.has(a)
                ? indexMap.get(a)
                : Number.POSITIVE_INFINITY;
              const ib = indexMap.has(b)
                ? indexMap.get(b)
                : Number.POSITIVE_INFINITY;
              if (ia !== ib) return ia - ib;
              return a.localeCompare(b, "en", { sensitivity: "base" });
            });
          } else {
            items.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
          }

          // Force "None Applicable" last
          {
            const NA = "None Applicable";
            const ix = items.indexOf(NA);
            if (ix !== -1 && ix !== items.length - 1) {
              items = items.filter((t) => t !== NA);
              items.push(NA);
            }
          }

          const listClass =
            g.key === "symbolicSystems"
              ? "tagPanel__menuList tagPanel__menuList--twoCols"
              : "tagPanel__menuList";

          const displayLabel = LABEL_OVERRIDES[g.key] ?? g.label;

          const nothingRenderable = !showTexts && !showFathers;

          const isTextDependent = TEXT_DEPENDENT_GROUP_KEYS.has(g.key);
          const isInactiveBecauseTextsHidden = !showTexts && isTextDependent;

          // If nothing renders, ALL tag groups are useless.
          const isInactiveAllTags = nothingRenderable;

          // Final inactive flag for the group button
          const isInactive = isInactiveAllTags || isInactiveBecauseTextsHidden;

const isModified = total > 0 && count !== total;

return (
  <div key={g.key} className="tagPanel__btnRow">
    <button
      type="button"
      ref={(el) => {
        if (el) btnRefs.current.set(g.key, el);
        else btnRefs.current.delete(g.key);
      }}
      onClick={(e) => {
        if (isInactive) return;

        // Remember this button so we can blur it on Esc-close
        lastOpenBtnRef.current = e.currentTarget;

        toggleMenu(g.key);
      }}
      className={`tagPanel__btn
        ${isInactive ? "tagPanel__btn--inactive" : ""}
        ${isDropdownOpen ? "tagPanel__btn--open" : ""}
      `}
      aria-disabled={isInactive}
      aria-expanded={isDropdownOpen}
      aria-controls={`menu-${g.key}`}
      title={displayLabel}
    >
      <span className="tagPanel__btnLabel">{displayLabel}</span>
      {renderCountBadge(count, total)}
    </button>

    {isModified && (
      <button
        type="button"
        className={`tagPanel__resetDot ${
          isInactive ? "tagPanel__resetDot--inactive" : ""
        }`}
        disabled={isInactive}
        onClick={(e) => {
          e.stopPropagation(); // don't open/close the dropdown
          if (isInactive) return;
          setAllTagsForGroup(g.key, items);
        }}
        aria-label={`Select all ${displayLabel} tags`}
        title="Select all"
      />
    )}

              {isDropdownOpen && (
                <MenuPortal>
                  <div
  ref={menuRef}
  id={`menu-${g.key}`}
  className="tagPanel__dropdown"
  role="dialog"
  aria-label={`${displayLabel} tags`}
>
  <div className="tagPanel__menuHeader">
    <span className="tagPanel__menuTitle">{displayLabel}</span>

    <button
      type="button"
      className="tagPanel__close tagPanel__close--menu"
      onClick={() => setOpenKey(null)}
      aria-label="Close menu"
      title="Close"
    >
      ×
    </button>
  </div>

  <div className="tagPanel__toolbar">
  <button
    type="button"
    className="tagPanel__miniBtn"
    onClick={() => setAllTagsForGroup(g.key, items)}
  >
    All
  </button>

  <button
    type="button"
    className="tagPanel__miniBtn"
    onClick={() => clearAllTagsForGroup(g.key)}
  >
    None
  </button>
</div>

  <div className="tagPanel__scrollBody">
    <div className={listClass}>
      {items.map((tag) => {
        const checked = set.has(tag);
        return (
          <label key={tag} className="tagPanel__row">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleTag(g.key, tag)}
            />
            <span>{tag}</span>
          </label>
        );
      })}
    </div>
  </div>
</div>

                </MenuPortal>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
