import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/config";
import type { FilterState } from "../App";
import { ElasticSlider, CountUp } from "../reactbits";
import { useReducedMotion } from "../lib/motion";
import { useDismissable } from "../lib/useDismissable";

const YEAR_BUILT_OPTIONS = [
  { label: "Any year", value: undefined as number | undefined },
  { label: "2000+", value: 2000 },
  { label: "2005+", value: 2005 },
  { label: "2010+", value: 2010 },
  { label: "2015+", value: 2015 },
  { label: "2018+", value: 2018 },
  { label: "2020+", value: 2020 },
];

const BEDROOMS: { label: string; value: FilterState["bedroomSize"] }[] = [
  { label: "Any", value: "" },
  { label: "Studio", value: "0" },
  { label: "1 bed", value: "1" },
  { label: "2 bed", value: "2" },
  { label: "3 bed", value: "3" },
  { label: "4+ bed", value: "4" },
];

const POPULATIONS: { label: string; value: string }[] = [
  { label: "Anyone", value: "" },
  { label: "Family", value: "family" },
  { label: "Senior 62+", value: "elderly" },
  { label: "Accessible", value: "disabled" },
];

const SORTS: { label: string; value: FilterState["sortBy"] }[] = [
  { label: "Best match", value: "match" },
  { label: "Closest", value: "distance" },
  { label: "Lowest rent", value: "rent" },
  { label: "Most units", value: "units" },
  { label: "Name", value: "name" },
];

interface TopBarProps {
  searchDisplay?: string;
  hasSearched: boolean;
  loading: boolean;
  hhSize: number;
  onHhSizeChange: (n: number) => void;
  incomeValue: number;
  onIncomeChange: (v: number) => void;
  amiCeiling: number;
  onAmiCeilingChange: (v: number) => void;
  onSearch: (q: string) => void;
  onNearMe: () => void;
  onGoHome?: () => void;
  showMapView: boolean;
  onToggleMap: () => void;
  resultCount: number;
  dataSource: "sj" | "lihtc";
  showExpired: boolean;
  onToggleExpired: () => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  onClearFilters: () => void;
  hasPublicData: boolean;
  onOpenAbout: () => void;
}

const INCOME_STOPS = [0, 20000, 35000, 50000, 65000, 80000, 100000, 130000, 160000, 200000];
const AMI_STOPS = [0, 30, 50, 60, 80, 100, 120];

const LANGS = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "vi", label: "VI" },
];

function amiLabel(v: number, t: (k: string) => string): string {
  return v === 0 ? t("ui.anyAmi") : `≤${v}% AMI`;
}

function incomeLabel(v: number, t: (k: string) => string): string {
  if (v === 0) return t("ui.anyIncome");
  if (v >= 200000) return "$200k+";
  return `$${(v / 1000).toFixed(0)}k/yr`;
}

export function TopBar({
  searchDisplay, hasSearched, loading, hhSize, onHhSizeChange,
  incomeValue, onIncomeChange, amiCeiling, onAmiCeilingChange,
  onSearch, onNearMe, onGoHome, showMapView, onToggleMap, resultCount,
  dataSource, showExpired, onToggleExpired,
  filters, onFiltersChange, onClearFilters, hasPublicData, onOpenAbout,
}: TopBarProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [lang, setLang] = useState(i18n.language.slice(0, 2));
  const [filterOpen, setFilterOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  const panelRef = useDismissable<HTMLDivElement>(
    () => setFilterOpen(false),
    { active: filterOpen, closeOnOutside: true, trapFocus: false },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!typing && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeFilterCount =
    (hhSize !== 1 ? 1 : 0) + (amiCeiling > 0 ? 1 : 0) + (incomeValue > 0 ? 1 : 0) +
    (filters.bedroomSize ? 1 : 0) + (filters.populationType ? 1 : 0) +
    (filters.voucherOnly ? 1 : 0) + (filters.yearBuiltMin != null ? 1 : 0) +
    (showExpired ? 1 : 0);

  const incomeIdx = Math.max(0, INCOME_STOPS.findIndex(s => s >= incomeValue));
  const amiIdx = Math.max(0, AMI_STOPS.findIndex(s => s >= amiCeiling));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) onSearch(input.trim());
  };

  const switchLang = (code: string) => {
    i18n.changeLanguage(code);
    document.documentElement.lang = code;
    localStorage.setItem("housing-lang", code);
    setLang(code);
  };

  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="topbar-brand">
          {onGoHome ? (
            <button className="topbar-home" onClick={onGoHome} type="button" aria-label={t("ui.newSearch")}>
              <HomeGlyph />
              <span>{t("ui.findHome")}</span>
            </button>
          ) : (
            <span className="topbar-home"><HomeGlyph /><span>{t("ui.findHome")}</span></span>
          )}
        </div>

        <form className="topbar-search" onSubmit={handleSubmit} role="search">
          <label className="sr-only" htmlFor="topbar-search-input">{t("search.placeholder")}</label>
          <input
            id="topbar-search-input"
            ref={inputRef}
            className="topbar-search-input"
            placeholder={t("search.placeholder")}
            value={input}
            onChange={e => setInput(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          <button className="topbar-go" type="submit" aria-busy={loading}>
            {loading ? "…" : t("search.button")}
          </button>
          <button className="topbar-nearme" type="button" onClick={onNearMe} aria-busy={loading}>
            {t("search.nearMe")}
          </button>
        </form>

        <div className="topbar-tools">
          <div className="topbar-filters" ref={panelRef}>
            <button
              className={`topbar-btn${activeFilterCount > 0 ? " has-active" : ""}`}
              onClick={() => setFilterOpen(v => !v)}
              aria-expanded={filterOpen}
              aria-controls="filter-panel"
              type="button"
            >
              {t("filters.title")}
              {activeFilterCount > 0 && <span className="topbar-count-badge tnum">{activeFilterCount}</span>}
            </button>

            {filterOpen && (
              <div className="filter-panel" id="filter-panel" role="group" aria-label={t("filters.title")}>
                <fieldset className="filter-field">
                  <legend className="filter-legend">{t("ui.household")}</legend>
                  <div className="hh-picker" role="group" aria-label={t("ui.household")}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <button
                        key={n}
                        className={`hh-btn${hhSize === n ? " selected" : ""}`}
                        onClick={() => onHhSizeChange(n)}
                        aria-pressed={hhSize === n}
                        aria-label={`${n === 8 ? "8 or more" : n} ${n === 1 ? "person" : "people"}`}
                        type="button"
                      >
                        <PeopleGlyph n={Math.min(n, 4)} />
                        <span className="hh-btn-num tnum">{n === 8 ? "8+" : n}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="filter-field">
                  <div className="filter-head">
                    <span className="filter-legend">{t("ui.myIncome")}</span>
                    <output className="filter-value tnum">{incomeLabel(incomeValue, t)}</output>
                  </div>
                  <ElasticSlider
                    className="filter-slider"
                    defaultValue={incomeIdx}
                    startingValue={0}
                    maxValue={INCOME_STOPS.length - 1}
                    isStepped
                    stepSize={1}
                    onChange={(v: number) => onIncomeChange(INCOME_STOPS[Math.round(v)] ?? 0)}
                    formatValue={(v: number) => incomeLabel(INCOME_STOPS[Math.round(v)] ?? 0, t)}
                    ariaLabel={t("ui.myIncome")}
                    ariaValueText={incomeLabel(incomeValue, t)}
                    leftIcon={<span className="slider-cap">$0</span>}
                    rightIcon={<span className="slider-cap">$200k</span>}
                  />
                </div>

                <div className="filter-field">
                  <div className="filter-head">
                    <span className="filter-legend">{t("ui.amiLimit")}</span>
                    <output className="filter-value tnum">{amiLabel(amiCeiling, t)}</output>
                  </div>
                  <ElasticSlider
                    className="filter-slider"
                    defaultValue={amiIdx}
                    startingValue={0}
                    maxValue={AMI_STOPS.length - 1}
                    isStepped
                    stepSize={1}
                    onChange={(v: number) => onAmiCeilingChange(AMI_STOPS[Math.round(v)] ?? 0)}
                    formatValue={(v: number) => amiLabel(AMI_STOPS[Math.round(v)] ?? 0, t)}
                    ariaLabel={t("ui.amiLimit")}
                    ariaValueText={amiLabel(amiCeiling, t)}
                    leftIcon={<span className="slider-cap">Any</span>}
                    rightIcon={<span className="slider-cap">120%</span>}
                  />
                </div>

                <fieldset className="filter-field">
                  <legend className="filter-legend">{t("filters.bedrooms", { defaultValue: "Bedrooms" })}</legend>
                  <div className="chip-row">
                    {BEDROOMS.map(o => (
                      <button
                        key={o.value}
                        className={`filter-chip${filters.bedroomSize === o.value ? " selected" : ""}`}
                        onClick={() => onFiltersChange({ ...filters, bedroomSize: o.value })}
                        aria-pressed={filters.bedroomSize === o.value}
                        type="button"
                      >{o.label}</button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="filter-field">
                  <legend className="filter-legend">{t("filters.population", { defaultValue: "Designed for" })}</legend>
                  <div className="chip-row">
                    {POPULATIONS.map(o => (
                      <button
                        key={o.value}
                        className={`filter-chip${filters.populationType === o.value ? " selected" : ""}`}
                        onClick={() => onFiltersChange({ ...filters, populationType: o.value })}
                        aria-pressed={filters.populationType === o.value}
                        type="button"
                      >{o.label}</button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="filter-field">
                  <legend className="filter-legend">{t("filters.sortBy", { defaultValue: "Sort by" })}</legend>
                  <div className="chip-row">
                    {SORTS.map(o => (
                      <button
                        key={o.value}
                        className={`filter-chip${filters.sortBy === o.value ? " selected" : ""}`}
                        onClick={() => onFiltersChange({ ...filters, sortBy: o.value })}
                        aria-pressed={filters.sortBy === o.value}
                        type="button"
                      >{o.label}</button>
                    ))}
                  </div>
                </fieldset>

                <div className="filter-field filter-toggles">
                  <label className="filter-switch">
                    <input
                      type="checkbox"
                      checked={filters.voucherOnly}
                      onChange={e => onFiltersChange({ ...filters, voucherOnly: e.target.checked })}
                    />
                    <span>{t("filters.voucherOnly", { defaultValue: "Accepts rental assistance only" })}</span>
                  </label>

                  {dataSource === "lihtc" && (
                    <>
                      <label className="filter-switch">
                        <input type="checkbox" checked={showExpired} onChange={onToggleExpired} />
                        <span>{t("filters.showExpired")}</span>
                      </label>
                      <div className="filter-head">
                        <label className="filter-legend" htmlFor="year-built">{t("filters.yearBuiltMin")}</label>
                        <select
                          id="year-built"
                          className="filter-select"
                          value={filters.yearBuiltMin ?? ""}
                          onChange={e => onFiltersChange({
                            ...filters,
                            yearBuiltMin: e.target.value === "" ? undefined : Number(e.target.value),
                          })}
                        >
                          {YEAR_BUILT_OPTIONS.map(o => (
                            <option key={o.value ?? ""} value={o.value ?? ""}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {activeFilterCount > 0 && (
                  <button className="filter-clear" onClick={onClearFilters} type="button">
                    {t("filters.clearAll")}
                  </button>
                )}
              </div>
            )}
          </div>

          {hasSearched && (
            <button
              className={`topbar-btn${showMapView ? " active" : ""}`}
              onClick={onToggleMap}
              aria-pressed={showMapView}
              type="button"
            >
              {showMapView ? t("ui.list") : t("ui.map")}
            </button>
          )}

          <button className="topbar-icon" onClick={onOpenAbout} type="button" aria-label={t("ui.help")}>?</button>

          <div className="topbar-lang" role="group" aria-label="Language">
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                className={`topbar-lang-btn${lang === code ? " active" : ""}`}
                onClick={() => switchLang(code)}
                aria-pressed={lang === code}
                type="button"
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {hasSearched && searchDisplay && (
        <p className="topbar-context">
          <span className="topbar-place">{searchDisplay.split(",").slice(0, 2).join(",")}</span>
          {resultCount > 0 && (
            <span className="topbar-result tnum">
              {reduced ? resultCount : <CountUp key={resultCount} to={resultCount} from={0} duration={0.6} separator="," />}
              {" "}{t("ui.homes")}
            </span>
          )}
          {dataSource !== "sj" && (
            <span className="topbar-fresh">
              {hasPublicData ? t("data.freshness.all") : t("data.freshness.lihtc")}
            </span>
          )}
        </p>
      )}
    </header>
  );
}

function HomeGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.2 2 7v6.3c0 .3.2.5.5.5H6V10h4v3.8h3.5c.3 0 .5-.2.5-.5V7L8 2.2Z"
        fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleGlyph({ n }: { n: number }) {
  return (
    <svg width={8 * n} height="12" viewBox={`0 0 ${8 * n} 12`} aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <g key={i} transform={`translate(${i * 8}, 0)`}>
          <circle cx="3.6" cy="3" r="2.1" fill="currentColor" />
          <path d="M0.8 10c0-1.55 1.25-2.8 2.8-2.8s2.8 1.25 2.8 2.8"
            stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
