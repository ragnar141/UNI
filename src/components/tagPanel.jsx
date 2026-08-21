import { useState, useMemo, useRef, useEffect } from "react";
import "../styles/tagPanel.css";

/**
 * TagPanel — controlled filter panel.
 *
 * The panel now uses a single 230px drawer with two internal tiers:
 *   Tier 1: Layers / Visibility / tag-group buttons
 *   Tier 2: one selected tag group's controls
 *
 * Opening a group replaces Tier 1 inside the same physical drawer rather than
 * creating a second fly-out panel to the left.
 */
export default function TagPanel({
  groups,
  selectedByGroup,
  onChange,
  layerMode = "noborders",
  onLayerModeChange = () => {},

  showTexts = true,
  onShowTextsChange = () => {},
  showFathers = true,
  onShowFathersChange = () => {},
  showConnections = true,
  onShowConnectionsChange = () => {},
}) {
  const [openKey, setOpenKey] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const panelRef = useRef(null);

  const ORDER = [
    "__layers__",
    "__visibility__",
    "__tags__",
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

  const LABEL_OVERRIDES = {
    literaryContent: "Literary Themes",
    comtean: "Comtean Framework",
  };

  const TEXT_DEPENDENT_GROUP_KEYS = new Set([
    "artsSciences",
    "literaryForms",
    "literaryContent",
    "metaphysical",
    "socioPolitical",
    "comtean",
  ]);

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

      const group = groupsByKey.get(key);
      if (group) out.push(group);
    }

    for (const group of groups || []) {
      if (!ORDER.includes(group.key)) out.push(group);
    }

    return out;
  }, [groups]);

  const selectedMaps = useMemo(() => {
    const map = new Map();
    for (const [key, value] of Object.entries(selectedByGroup || {})) {
      map.set(key, value instanceof Set ? value : new Set(value || []));
    }
    return map;
  }, [selectedByGroup]);

  const activeGroup = useMemo(
    () => (groups || []).find((group) => group.key === openKey) || null,
    [groups, openKey]
  );

  function getDisplayLabel(group) {
    return LABEL_OVERRIDES[group?.key] ?? group?.label ?? "";
  }

  function getSortedItems(group) {
    if (!group) return [];

    let items = [...(group.allTags || [])];
    const customOrder = CUSTOM_ORDERS[group.key];

    if (customOrder) {
      const indexMap = new Map(customOrder.map((name, index) => [name, index]));
      items.sort((a, b) => {
        const ia = indexMap.has(a) ? indexMap.get(a) : Number.POSITIVE_INFINITY;
        const ib = indexMap.has(b) ? indexMap.get(b) : Number.POSITIVE_INFINITY;
        if (ia !== ib) return ia - ib;
        return a.localeCompare(b, "en", { sensitivity: "base" });
      });
    } else {
      items.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    }

    const noneApplicable = "None Applicable";
    const index = items.indexOf(noneApplicable);
    if (index !== -1 && index !== items.length - 1) {
      items = items.filter((item) => item !== noneApplicable);
      items.push(noneApplicable);
    }

    return items;
  }

  function isGroupInactive(group) {
    const nothingRenderable = !showTexts && !showFathers;
    const textDependent = TEXT_DEPENDENT_GROUP_KEYS.has(group?.key);
    return nothingRenderable || (!showTexts && textDependent);
  }

  function closePanel() {
    setIsOpen(false);
    setOpenKey(null);
  }

  function toggleTag(groupKey, tag) {
    const next = { ...(selectedByGroup || {}) };
    const current =
      next[groupKey] instanceof Set
        ? new Set(next[groupKey])
        : new Set(next[groupKey] || []);

    if (current.has(tag)) current.delete(tag);
    else current.add(tag);

    next[groupKey] = current;
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

  useEffect(() => {
    if (!isOpen) return;

    const onDocDown = (event) => {
      const panel = panelRef.current;
      if (panel?.contains(event.target)) return;
      closePanel();
    };

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      if (openKey) {
        setOpenKey(null);
        return;
      }

      closePanel();
    };

    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen, openKey]);

  useEffect(() => {
    if (!openKey) return;
    if (!showTexts && TEXT_DEPENDENT_GROUP_KEYS.has(openKey)) {
      setOpenKey(null);
    }
  }, [showTexts, openKey]);

  useEffect(() => {
    const nothingRenderable = !showTexts && !showFathers;
    if (!nothingRenderable) return;

    if (showConnections) onShowConnectionsChange(false);
    if (openKey) setOpenKey(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTexts, showFathers]);

  function renderCountBadge(count, total) {
    return <span className="tagPanel__count">{count}/{total}</span>;
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
            value="segments"
            checked={layerMode === "segments"}
            onChange={() => onLayerModeChange("segments")}
          />
          <span className="tagPanel__label">Civilizations &amp; Periods</span>
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

  function renderVisibilityToggles() {
    return (
      <div className="tagPanel__visibility">
        <label className="tagPanel__row">
          <input
            type="checkbox"
            checked={!!showTexts}
            onChange={(event) => onShowTextsChange(event.target.checked)}
          />
          <span className="tagPanel__label tagPanel__rowLabel">Texts</span>
        </label>

        <label className="tagPanel__row">
          <input
            type="checkbox"
            checked={!!showFathers}
            onChange={(event) => onShowFathersChange(event.target.checked)}
          />
          <span className="tagPanel__label tagPanel__rowLabel">Mythic/Historic Figures</span>
        </label>

        <label className="tagPanel__row">
          <input
            type="checkbox"
            checked={!!showConnections}
            onChange={(event) => onShowConnectionsChange(event.target.checked)}
          />
          <span className="tagPanel__label tagPanel__rowLabel">Connections</span>
        </label>
      </div>
    );
  }

  function renderMainView() {
    return (
      <div className="tagPanel__content">
        {orderedGroups.map((group) => {
          if (group.__section) {
            if (group.key === "__layers__") {
              return (
                <div key={group.key}>
                  <div className="tagPanel__sectionLabel">{group.label}</div>
                  {renderLayerRadios()}
                </div>
              );
            }

            if (group.key === "__visibility__") {
              return (
                <div key={group.key}>
                  <div className="tagPanel__sectionLabel">{group.label}</div>
                  {renderVisibilityToggles()}
                </div>
              );
            }

            return (
              <div key={group.key} className="tagPanel__sectionLabel">
                {group.label}
              </div>
            );
          }

          const selected = selectedMaps.get(group.key) || new Set();
          const items = getSortedItems(group);
          const total = group.allTags.length;
          const count = selected.size;
          const inactive = isGroupInactive(group);
          const modified = total > 0 && count !== total;
          const displayLabel = getDisplayLabel(group);

          return (
            <div key={group.key} className="tagPanel__btnRow">
              <button
                type="button"
                onClick={() => {
                  if (!inactive) setOpenKey(group.key);
                }}
                className={`tagPanel__btn ${
                  inactive ? "tagPanel__btn--inactive" : ""
                }`}
                aria-disabled={inactive}
                aria-expanded={openKey === group.key}
                title={displayLabel}
              >
                <span className="tagPanel__btnLabel">{displayLabel}</span>
                {renderCountBadge(count, total)}
              </button>

              {modified && (
                <button
                  type="button"
                  className={`tagPanel__resetDot ${
                    inactive ? "tagPanel__resetDot--inactive" : ""
                  }`}
                  disabled={inactive}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!inactive) setAllTagsForGroup(group.key, items);
                  }}
                  aria-label={`Select all ${displayLabel} tags`}
                  title="Select all"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDetailView() {
    if (!activeGroup) {
      return <div className="tagPanel__content tagPanel__detailContent" />;
    }

    const displayLabel = getDisplayLabel(activeGroup);
    const items = getSortedItems(activeGroup);
    const selected = selectedMaps.get(activeGroup.key) || new Set();
    const listClass =
      activeGroup.key === "symbolicSystems"
        ? "tagPanel__menuList tagPanel__menuList--twoCols"
        : "tagPanel__menuList";

    return (
      <div className="tagPanel__content tagPanel__detailContent">
        <button
          type="button"
          className="tagPanel__back"
          onClick={() => setOpenKey(null)}
          aria-label="Back to all filters"
        >
          <span className="tagPanel__backArrow" aria-hidden="true">←</span>
          <span>FILTERS</span>
        </button>

        <div className="tagPanel__detailHeader">
          <div className="tagPanel__menuTitle">{displayLabel}</div>
          <div className="tagPanel__detailCount">
            {selected.size}/{activeGroup.allTags.length}
          </div>
        </div>

        <div className="tagPanel__toolbar tagPanel__detailToolbar">
          <button
            type="button"
            className="tagPanel__miniBtn"
            onClick={() => setAllTagsForGroup(activeGroup.key, items)}
          >
            All
          </button>

          <button
            type="button"
            className="tagPanel__miniBtn"
            onClick={() => clearAllTagsForGroup(activeGroup.key)}
          >
            None
          </button>
        </div>

        <div className="tagPanel__scrollBody tagPanel__detailScrollBody">
          <div className={listClass}>
            {items.map((tag) => (
              <label key={tag} className="tagPanel__row">
                <input
                  type="checkbox"
                  checked={selected.has(tag)}
                  onChange={() => toggleTag(activeGroup.key, tag)}
                />
                <span>{tag}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const inDetailView = !!(isOpen && openKey && activeGroup);

  return (
    <>
      <div
        className={`tagPanelWrap ${
          isOpen ? "tagPanelWrap--open" : "tagPanelWrap--closed"
        } ${inDetailView ? "tagPanelWrap--detail" : ""}`}
        ref={panelRef}
      >
        <button
          type="button"
          className="tagPanel__tab"
          onClick={() => {
            setIsOpen((value) => !value);
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
            onClick={closePanel}
            aria-label="Close filters"
            title="Close"
          >
            ×
          </button>
        )}

        <div className="tagPanel__viewport">
          <div
            className={`tagPanel__views ${
              inDetailView ? "tagPanel__views--detail" : ""
            }`}
          >
            <section className="tagPanel__view" aria-hidden={inDetailView || undefined}>
              {renderMainView()}
            </section>

            <section className="tagPanel__view" aria-hidden={!inDetailView || undefined}>
              {renderDetailView()}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}