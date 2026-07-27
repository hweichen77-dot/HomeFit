import { useTranslation } from "react-i18next";
import type { DisplayProperty } from "../types/housing";
import type { UserLocation, AppStatusValue } from "../App";
import { getAffordabilityTier } from "./PropertyCard";
import { haversineKm, fmtDist } from "../lib/geo";
import { maxRentFromAmi } from "../lib/ami";
import type { GeoLocation } from "../types/housing";

interface ComparePanelProps {
  properties: DisplayProperty[];
  userLocation: UserLocation | null;
  searchLocation: GeoLocation | null;
  ami: number;
  hhSize: number;
  appStatuses: Record<string, AppStatusValue>;
  deadlines: Record<string, number>;
  onClear: () => void;
  onRemove: (id: string) => void;
  onSelect: (p: DisplayProperty) => void;
}

const NOT_REPORTED = "Not reported";

const STATUS_LABELS: Record<AppStatusValue, string> = {
  interested: "Interested",
  applied: "Applied",
  waitlisted: "Waitlisted",
};

function amiPct(p: DisplayProperty): string {
  if (p.incomeCeilingPct != null) return `≤${p.incomeCeilingPct}%`;
  if (p.source === "lihtc") return "≤60%";
  return "—";
}

export function ComparePanel({
  properties,
  userLocation,
  searchLocation,
  ami,
  hhSize,
  appStatuses,
  deadlines,
  onClear,
  onRemove,
  onSelect,
}: ComparePanelProps) {
  const { t } = useTranslation();

  // fall back to the searched place so distance still shows when the user
  // typed a city instead of using Near Me
  const origin = userLocation ?? searchLocation;
  const originLabel = userLocation ? "you" : searchLocation ? "search" : null;

  const dist = (p: DisplayProperty) =>
    origin && p.lat != null && p.lng != null
      ? fmtDist(haversineKm(origin.lat, origin.lng, p.lat, p.lng))
      : NOT_REPORTED;

  const deadlineStr = (p: DisplayProperty) => {
    const d = deadlines[p.id];
    return d != null
      ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "Not set";
  };

  const SOURCE_LABELS: Record<string, string> = {
    lihtc: "LIHTC (HUD)",
    sj: "City of San Jose",
    public: "Public housing",
    mfassist: "Multifamily assisted",
    usda: "USDA rural",
    insured: "FHA insured",
  };

  const estRent = (p: DisplayProperty) => {
    if (!ami) return NOT_REPORTED;
    const pct = p.incomeCeilingPct ?? (p.source === "lihtc" ? 60 : null);
    if (pct == null) return NOT_REPORTED;
    return `about $${maxRentFromAmi((ami * pct) / 100, hhSize).toLocaleString()}/mo`;
  };

  const rows: { label: string; render: (p: DisplayProperty) => string }[] = [
    { label: "Location", render: p => [p.city, p.state].filter(Boolean).join(", ") || NOT_REPORTED },
    { label: "AMI %", render: amiPct },
    { label: `Est. rent cap (${hhSize}-person)`, render: estRent },
    { label: "Affordable units", render: p => (p.affordableUnits > 0 ? String(p.affordableUnits) : NOT_REPORTED) },
    { label: "Total units", render: p => (p.totalUnits > 0 ? String(p.totalUnits) : NOT_REPORTED) },
    { label: "Bedrooms", render: p => {
        const b = p.bedrooms;
        const parts: string[] = [];
        if (b.studio > 0) parts.push(`Studio x${b.studio}`);
        if (b.br1 > 0) parts.push(`1BR x${b.br1}`);
        if (b.br2 > 0) parts.push(`2BR x${b.br2}`);
        if (b.br3 > 0) parts.push(`3BR x${b.br3}`);
        if (b.br4plus > 0) parts.push(`4+BR x${b.br4plus}`);
        return parts.length ? parts.join(", ") : NOT_REPORTED;
      } },
    { label: "Affordability", render: p => getAffordabilityTier(p).label },
    { label: "Rental assistance", render: p => (p.hasRentalAssistance ? "Yes" : "Not indicated") },
    { label: "Serves", render: p => (p.populationTypes.length ? p.populationTypes.join(", ") : "General") },
    { label: "Year placed in service", render: p => (p.yearBuilt ? String(p.yearBuilt) : NOT_REPORTED) },
    { label: "Owner type", render: p => (p.isNonProfit ? "Non-profit" : "For-profit / not stated") },
    { label: "Phone", render: p => p.phone || NOT_REPORTED },
    { label: `Distance${originLabel ? ` from ${originLabel}` : ""}`, render: dist },
    { label: "Data source", render: p => SOURCE_LABELS[p.source] ?? p.source },
    { label: "Your deadline", render: deadlineStr },
    { label: "Your status", render: p => {
        const s = appStatuses[p.id];
        return s ? STATUS_LABELS[s] : "Not tracked";
      } },
  ];

  return (
    <div className="compare-panel" role="dialog" aria-label={t("compare.title")}>
      <div className="compare-panel-inner">
        <div className="compare-header">
          <span className="compare-title">{t("compare.title")}</span>
          <button className="compare-clear-btn" onClick={onClear} type="button">
            {t("compare.clear")}
          </button>
        </div>
        <div className="compare-grid" style={{ gridTemplateColumns: `120px repeat(${properties.length}, minmax(0, 1fr))` }}>
          {}
          <div className="compare-cell compare-row-label" />
          {properties.map(p => (
            <div key={`h-${p.id}`} className="compare-cell compare-col-head">
              <button className="compare-name-btn" onClick={() => onSelect(p)} type="button" title={p.name}>
                {p.name}
              </button>
              <button
                className="compare-remove-btn"
                onClick={() => onRemove(p.id)}
                type="button"
                aria-label={`Remove ${p.name} from comparison`}
              >
                ×
              </button>
            </div>
          ))}

          {rows.map(row => (
            <div key={row.label} className="compare-contents" style={{ display: "contents" }}>
              <div className="compare-cell compare-row-label">{row.label}</div>
              {properties.map(p => (
                <div key={`${row.label}-${p.id}`} className="compare-cell compare-value">
                  {row.render(p)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
