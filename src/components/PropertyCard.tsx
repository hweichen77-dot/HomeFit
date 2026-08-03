import { memo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import type { DisplayProperty } from "../types/housing";
import type { UserLocation, AppStatusValue } from "../App";
import { haversineKm, fmtDist } from "../lib/geo";
import { adjustedAmi, maxRentFromAmi } from "../lib/ami";
import { SpotlightCard, ElectricBorder, CountUp } from "../reactbits";
import { useReducedMotion } from "../lib/motion";

export type TierKey = "eli" | "vli" | "li" | "mod" | "unknown";

export interface AffordabilityTier {
  key: TierKey;
  label: string;
  ceilingPct: number | null;
}

const TIER_TINT: Record<TierKey, string> = {
  eli: "rgba(125, 211, 252, 0.16)",
  vli: "rgba(92, 225, 166, 0.16)",
  li: "rgba(255, 209, 102, 0.16)",
  mod: "rgba(255, 154, 118, 0.16)",
  unknown: "rgba(196, 181, 253, 0.14)",
};

const TIER_STROKE: Record<TierKey, string> = {
  eli: "#7DD3FC",
  vli: "#5CE1A6",
  li: "#FFD166",
  mod: "#FF9A76",
  unknown: "#C4B5FD",
};

export function getAffordabilityTier(p: DisplayProperty): AffordabilityTier {
  const pct = p.incomeCeilingPct;

  if (p.source === "sj") {
    if ((p.eliunits ?? 0) > 0) return { key: "eli", label: "Extremely low income", ceilingPct: 30 };
    if ((p.vliunits ?? 0) > 0) return { key: "vli", label: "Very low income", ceilingPct: 50 };
    if ((p.liunits ?? 0) > 0) return { key: "li", label: "Low income", ceilingPct: 80 };
    return { key: "unknown", label: "Income limits apply", ceilingPct: null };
  }

  if (pct != null) {
    if (pct <= 30) return { key: "eli", label: "Extremely low income", ceilingPct: pct };
    if (pct <= 50) return { key: "vli", label: "Very low income", ceilingPct: pct };
    if (pct <= 80) return { key: "li", label: "Low income", ceilingPct: pct };
    return { key: "mod", label: "Moderate income", ceilingPct: pct };
  }
  return { key: "unknown", label: "Income limits apply", ceilingPct: null };
}

export function tierStroke(key: TierKey): string {
  return TIER_STROKE[key];
}

function plainAddress(p: DisplayProperty): string {
  const parts = [p.address, p.city, p.state].filter(Boolean);
  if (p.zip) parts.push(p.zip);
  return parts.join(", ");
}

type Verdict = "qualifies" | "over" | "unknown" | "unset";

interface PropertyCardProps {
  property: DisplayProperty;
  userLocation: UserLocation | null;
  ami: number;
  userIncome: number;
  hhSize: number;
  saved: boolean;
  appStatus?: AppStatusValue;
  onSelect: (p: DisplayProperty) => void;
  onSave: (id: string) => void;
  onStatusChange?: (id: string, status: AppStatusValue | null) => void;
  comparing?: boolean;
  onToggleCompare?: (id: string) => void;
}

const STATUS_LABELS: Record<AppStatusValue, string> = {
  interested: "Interested",
  applied: "Applied",
  waitlisted: "Waitlisted",
};

function PropertyCardBase({
  property: p, userLocation, ami, userIncome, hhSize, saved, appStatus,
  onSelect, onSave, onStatusChange, comparing, onToggleCompare,
}: PropertyCardProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const tier = getAffordabilityTier(p);

  const dist = userLocation && p.lat != null && p.lng != null
    ? fmtDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))
    : null;

  const ceilingDollars = tier.ceilingPct != null
    ? Math.round(adjustedAmi(ami, hhSize) * (tier.ceilingPct / 100))
    : null;

  const estRent = tier.ceilingPct != null
    ? maxRentFromAmi(ami * (tier.ceilingPct / 100), hhSize)
    : null;

  let verdict: Verdict = "unset";
  if (userIncome > 0) {
    if (ceilingDollars == null) verdict = "unknown";
    else verdict = userIncome <= ceilingDollars ? "qualifies" : "over";
  }
  const overBy = verdict === "over" && ceilingDollars != null ? userIncome - ceilingDollars : 0;

  const hasWebsite = !!p.website;
  const applyUrl = p.website
    || `https://www.google.com/search?q=${encodeURIComponent(`"${p.name}" ${p.city} ${p.state} affordable housing apply`)}`;

  const openApply = () => {
    openUrl(applyUrl).catch(() => window.open(applyUrl, "_blank", "noopener,noreferrer"));
  };

  const nameId = `prop-${p.id}-name`;

  const body = (
    <SpotlightCard className="prop-card" spotlightColor={TIER_TINT[tier.key]}>
      <span className={`prop-stripe tier-${tier.key}`} aria-hidden="true" />

      <div className="prop-top">
        <p className={`prop-tier tier-${tier.key}`}>
          <span className="prop-tier-dot" aria-hidden="true" />
          {tier.label}
          {tier.ceilingPct != null && <span className="prop-tier-pct tnum">≤{tier.ceilingPct}% AMI</span>}
        </p>
        <div className="prop-top-actions">
          {onToggleCompare && (
            <button
              className={`prop-compare${comparing ? " active" : ""}`}
              onClick={() => onToggleCompare(p.id)}
              aria-pressed={!!comparing}
              type="button"
            >
              <span className="prop-compare-box" aria-hidden="true">{comparing ? "✓" : ""}</span>
              {t("compare.add")}
            </button>
          )}
          <button
            className={`prop-save${saved ? " saved" : ""}`}
            onClick={() => onSave(p.id)}
            aria-label={saved ? t("ui.saved") : t("ui.saveHome")}
            aria-pressed={saved}
            type="button"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"
              fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
            </svg>
          </button>
        </div>
      </div>

      <h2 className="prop-name" id={nameId}>
        <button className="prop-name-btn" onClick={() => onSelect(p)} type="button">{p.name}</button>
      </h2>
      <p className="prop-address">{plainAddress(p)}</p>

      <div className="prop-figures">
        <div className="prop-figure">
          <span className="prop-figure-value tnum">
            {ceilingDollars != null ? (
              <>
                $
                {reduced
                  ? ceilingDollars.toLocaleString("en-US")
                  : <CountUp to={ceilingDollars} duration={1.1} separator="," />}
              </>
            ) : "—"}
          </span>
          <span className="prop-figure-key">
            {t("card.incomeLimit", { defaultValue: "Income limit" })}
            <span className="prop-figure-qual">
              {t("card.forHousehold", { count: hhSize, defaultValue: "household of {{count}}" })}
            </span>
          </span>
        </div>
        <div className="prop-figure">
          <span className="prop-figure-value tnum">{estRent != null ? `$${estRent.toLocaleString("en-US")}` : "—"}</span>
          <span className="prop-figure-key">
            {t("card.estRent", { defaultValue: "Est. rent cap" })}
            <span className="prop-figure-qual">{t("card.perMonth", { defaultValue: "per month" })}</span>
          </span>
        </div>
      </div>

      <p className={`prop-verdict verdict-${verdict}`}>
        {verdict === "qualifies" && t("card.qualifies", { defaultValue: "Your income fits this limit" })}
        {verdict === "over" && t("card.over", {
          amount: `$${overBy.toLocaleString("en-US")}`,
          defaultValue: "Over the limit by {{amount}}",
        })}
        {verdict === "unknown" && t("card.unknownLimit", { defaultValue: "Income limit not reported" })}
        {verdict === "unset" && t("card.setIncome", { defaultValue: "Add your income to check eligibility" })}
      </p>

      <ul className="prop-facts">
        {dist && <li className="prop-fact">{dist} away</li>}
        {p.affordableUnits ? <li className="prop-fact tnum">{p.affordableUnits} affordable units</li> : null}
        {p.source === "public" && <li className="prop-fact">Public housing</li>}
        {p.source === "usda" && <li className="prop-fact">USDA rural</li>}
        {p.hasRentalAssistance && <li className="prop-fact">Rental assistance</li>}
        {p.source === "public" && p.waitlistStatus === "open" && (
          <li className="prop-fact fact-open">{t("property.waitlistOpen")}</li>
        )}
        {p.source === "public" && p.waitlistStatus === "closed" && (
          <li className="prop-fact fact-closed">{t("property.waitlistClosed")}</li>
        )}
        {p.isLikelyExpired && <li className="prop-fact fact-warn">{t("property.expiredWarning")}</li>}
      </ul>

      {p.phone && (
        <a className="prop-phone" href={`tel:${p.phone.replace(/[^0-9+]/g, "")}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.4 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z" />
          </svg>
          <span className="tnum">{p.phone}</span>
        </a>
      )}

      {onStatusChange && (
        <div className="prop-track" role="group" aria-label={t("card.trackLabel", { defaultValue: "Application status" })}>
          {(["interested", "applied", "waitlisted"] as AppStatusValue[]).map(s => (
            <button
              key={s}
              className={`prop-track-btn${appStatus === s ? " active" : ""}`}
              onClick={() => onStatusChange(p.id, appStatus === s ? null : s)}
              type="button"
              aria-pressed={appStatus === s}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      <div className="prop-actions">
        <button className="prop-cta" onClick={openApply} type="button">
          {hasWebsite ? t("ui.applyNow") : t("ui.searchOnline")}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </button>
        {!hasWebsite && <p className="prop-note">{t("ui.noWebsiteNote")}</p>}
      </div>
    </SpotlightCard>
  );

  if (verdict === "qualifies" && !reduced) {
    return (
      <ElectricBorder color={TIER_STROKE[tier.key]} speed={0.5} chaos={0.06} borderRadius={14} className="prop-card-shell is-electric">
        {body}
      </ElectricBorder>
    );
  }

  return <div className="prop-card-shell">{body}</div>;
}

export const PropertyCard = memo(PropertyCardBase);
