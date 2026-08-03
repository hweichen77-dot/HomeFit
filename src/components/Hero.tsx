import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { SplitText, Magnet, StarBorder, ShinyText } from "../reactbits";
import { useReducedMotion } from "../lib/motion";

const LightRays = lazy(() => import("../reactbits/LightRays.jsx")) as unknown as React.ComponentType<Record<string, unknown>>;
const Aurora = lazy(() => import("../reactbits/Aurora.jsx")) as unknown as React.ComponentType<Record<string, unknown>>;

const CITIES = ["San Jose, CA", "Austin, TX", "Chicago, IL", "Seattle, WA", "Miami, FL", "Denver, CO"];

const SOURCES = [
  "HUD LIHTC",
  "Public Housing",
  "Multifamily Assisted",
  "HUD Insured Multifamily",
  "USDA Rural",
  "City of San José",
];

interface HeroProps {
  onSearch: (q: string) => void;
  onNearMe: () => void;
  loading: boolean;
  error: string | null;
  searchHistory: string[];
}

export function Hero({ onSearch, onNearMe, loading, error, searchHistory }: HeroProps) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const reduced = useReducedMotion();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) onSearch(q.trim());
  };

  return (
    <section className="hero">
      {!reduced && (
        <Suspense fallback={null}>
          <div className="hero-fx" aria-hidden="true">
            <Aurora colorStops={["#FFA94D", "#7DD3FC", "#5CE1A6"]} amplitude={1.1} blend={0.45} speed={0.35} />
            <LightRays
              raysOrigin="top-center"
              raysColor="#FFC489"
              raysSpeed={0.7}
              lightSpread={0.9}
              rayLength={2.4}
              fadeDistance={1.15}
              saturation={0.9}
              followMouse
              mouseInfluence={0.06}
              noiseAmount={0.06}
              distortion={0.02}
              className="hero-rays"
            />
          </div>
        </Suspense>
      )}
      <div className="hero-veil" aria-hidden="true" />

      <div className="hero-content">
        <h1 className="hero-heading">
          {reduced ? (
            t("welcome.heading")
          ) : (
            <SplitText
              text={t("welcome.heading")}
              tag="span"
              className="hero-heading-split"
              splitType="words"
              delay={40}
              duration={0.9}
              ease="power4.out"
              from={{ opacity: 0, y: 48, filter: "blur(8px)" }}
              to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              textAlign="center"
              threshold={0}
              rootMargin="0px"
            />
          )}
        </h1>
        <p className="hero-sub">{t("welcome.sub")}</p>

        <form className="hero-search" onSubmit={submit} role="search">
          <label className="hero-search-label" htmlFor="hero-search-input">
            {t("search.placeholder")}
          </label>
          <div className="hero-search-field">
            <svg className="hero-search-glyph" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="hero-search-input"
              className="hero-search-input"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t("search.placeholder")}
              autoComplete="off"
              enterKeyHint="search"
            />
            <StarBorder
              as="button"
              type="submit"
              className="hero-search-submit"
              color="#FFC489"
              speed="4s"
              thickness={2}
              disabled={loading}
            >
              {loading ? <ShinyText text={t("welcome.findingNearMe")} speed={1.4} color="#07090E" shineColor="#FFF3E2" /> : t("search.button")}
            </StarBorder>
          </div>
          <div className="hero-search-alt">
            <span className="hero-or">{t("welcome.or", { defaultValue: "or" })}</span>
            <Magnet padding={70} magnetStrength={5} disabled={reduced}>
              <button className="hero-nearme" onClick={onNearMe} disabled={loading} type="button">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
                {loading ? t("welcome.findingNearMe") : t("welcome.findNearMe")}
              </button>
            </Magnet>
          </div>
        </form>

        {error && <p className="hero-error" role="alert">{error}</p>}

        {searchHistory.length > 0 && (
          <div className="hero-chips">
            <span className="hero-chips-lead">{t("welcome.recentSearches")}</span>
            {searchHistory.map(city => (
              <Magnet key={city} padding={40} magnetStrength={8} disabled={reduced}>
                <button className="hero-chip hero-chip-recent" onClick={() => onSearch(city)} type="button">
                  {city}
                </button>
              </Magnet>
            ))}
          </div>
        )}

        <div className="hero-chips">
          <span className="hero-chips-lead">{t("welcome.searchCity")}</span>
          {CITIES.map(city => (
            <Magnet key={city} padding={40} magnetStrength={8} disabled={reduced}>
              <button className="hero-chip" onClick={() => onSearch(city)} type="button">{city}</button>
            </Magnet>
          ))}
        </div>
      </div>

      <div className="hero-sources">
        <p className="hero-sources-lead">
          {t("welcome.sourcesLead", { defaultValue: "Built on public federal and city housing records" })}
        </p>
        <ul className="hero-sources-list">
          {SOURCES.map(s => <li key={s} className="hero-source">{s}</li>)}
        </ul>
        <p className="hero-privacy">
          {t("welcome.privacy", {
            defaultValue: "Your income stays on this device. No account, no tracking, no cost.",
          })}
        </p>
      </div>
    </section>
  );
}
