import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { TopBar } from "./components/TopBar";
import { PropertyCard } from "./components/PropertyCard";
import { DetailPanel } from "./components/DetailPanel";
import { DeadlineWidget } from "./components/DeadlineWidget";
import { ComparePanel } from "./components/ComparePanel";
import { AmiSurvey, hasSurveyCompleted } from "./components/AmiSurvey";
import type { HousingCollection, GeoLocation, DisplayProperty } from "./types/housing";
import { normalizeFeatures, dedupeProperties, qualifiesForIncome, hasBedroomType, popMatches } from "./lib/normalize";
import { haversineKm } from "./lib/geo";
import { getAmi, maxRentFromAmi } from "./lib/ami";
import { useDebounced, useIncrementalCount } from "./lib/useDeferredFilter";
import { AboutModal } from "./components/AboutModal";
import { Hero } from "./components/Hero";
import { ClickSpark, AnimatedContent, GradualBlur } from "./reactbits";
import { useReducedMotion } from "./lib/motion";

const FullMap = lazy(() => import("./components/Map").then(m => ({ default: m.Map })));

export interface FilterState {
  activeOnly: boolean;
  populationType: string;
  incomeTier: "" | "ELI" | "VLI" | "LI" | "Moderate";
  bedroomSize: "" | "0" | "1" | "2" | "3" | "4";
  voucherOnly: boolean;
  savedOnly: boolean;
  sortBy: "name" | "units" | "distance" | "rent" | "match";
  householdIncome: number;
  householdSize: number;
  yearBuiltMin?: number;
}

export interface UserLocation { lng: number; lat: number; }

export type AppStatusValue = "interested" | "applied" | "waitlisted";
export type AppStatuses = Record<string, AppStatusValue>;

export const DEFAULT_FILTERS: FilterState = {
  activeOnly: true,
  populationType: "",
  incomeTier: "",
  bedroomSize: "",
  voucherOnly: false,
  savedOnly: false,
  sortBy: "name",
  householdIncome: 0,
  householdSize: 1,
};

interface ActiveFilter { key: string; label: string; clear: () => void; }

function EmptyState({ onReset, active, totalBeforeFilters }: {
  onReset: () => void;
  active: ActiveFilter[];
  totalBeforeFilters: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="empty-screen">
      <div className="empty-inner">
        <h2 className="empty-heading">{t("empty.heading")}</h2>
        {active.length > 0 ? (
          <>
            <p className="empty-sub">
              {t("empty.filteredOut", {
                total: totalBeforeFilters,
                count: active.length,
                defaultValue: "{{total}} homes were found here, then removed by {{count}} filter(s). Turn one off:",
              })}
            </p>
            <ul className="empty-filters">
              {active.map(f => (
                <li key={f.key}>
                  <button className="empty-filter-chip" onClick={f.clear} type="button">
                    {f.label}
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="empty-sub">{t("empty.noneInArea", {
            defaultValue: "No income-limited homes are recorded within 25 km of this location. Try a nearby city.",
          })}</p>
        )}
        <button className="empty-reset-btn" onClick={onReset} type="button">
          {t("empty.clearFilters")}
        </button>
      </div>
    </div>
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export default function App() {
  const { t } = useTranslation();
  const [rawData, setRawData] = useState<DisplayProperty[]>([]);
  const [dataSource, setDataSource] = useState<"sj" | "lihtc">("sj");
  const [dataLoading, setDataLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLocation, setSearchLocation] = useState<GeoLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("housing-search-history") ?? "[]"); }
    catch { return []; }
  });

  const [selectedProperty, setSelectedProperty] = useState<DisplayProperty | null>(null);
  const pendingSharedIdRef = useRef<string | null>(null);
  const [showMapView, setShowMapView] = useState(false);
  const [mapFly, setMapFly] = useState<{ lat: number; lng: number; zoom: number; bbox?: [number, number, number, number] } | null>(null);
  const [hhSize, setHhSize] = useState(1);
  const [incomeValue, setIncomeValue] = useState(0);
  const [amiCeiling, setAmiCeiling] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("housing-favorites-v2") ?? "[]")); }
    catch { return new Set(); }
  });
  const [showSurvey, setShowSurvey] = useState(() => !hasSurveyCompleted());
  const [appStatuses, setAppStatuses] = useState<AppStatuses>(() => {
    try { return JSON.parse(localStorage.getItem("housing-app-status-v1") ?? "{}"); }
    catch { return {}; }
  });
  const [deadlines, setDeadlines] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("housing-deadlines-v1") ?? "{}"); }
    catch { return {}; }
  });
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = localStorage.getItem("housing-filters-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FilterState>;
        return { ...DEFAULT_FILTERS, ...parsed };
      }
    } catch {  }
    return DEFAULT_FILTERS;
  });
  const [showExpired, setShowExpired] = useState(false);

  const [showAbout, setShowAbout] = useState(false);
  const lastSearchRef = useRef<number>(0);
  const searchCounterRef = useRef<number>(0);

  useEffect(() => {
    if (!pendingSharedIdRef.current || rawData.length === 0) return;
    const id = pendingSharedIdRef.current;
    pendingSharedIdRef.current = null;
    const found = rawData.find(p => p.id === id);
    if (found) setSelectedProperty(found);
  }, [rawData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentId = params.get("id");
    if (selectedProperty) {

      if (searchQuery) params.set("q", searchQuery);
      if (currentId !== selectedProperty.id) {
        params.set("id", selectedProperty.id);
        window.history.replaceState(null, "", "?" + params.toString());
      }
    } else {
      if (currentId) {
        params.delete("id");
        const newSearch = params.toString();
        window.history.replaceState(null, "", newSearch ? "?" + newSearch : window.location.pathname);
      }
    }
  }, [selectedProperty, searchQuery]);

  useEffect(() => {
    try { localStorage.setItem("housing-filters-v1", JSON.stringify(filters)); } catch {  }
  }, [filters]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setIncomeValue(0);
    setAmiCeiling(0);
    try { localStorage.removeItem("housing-filters-v1"); } catch {  }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    const myCount = ++searchCounterRef.current;
    const now = Date.now();
    const gap = now - lastSearchRef.current;
    if (gap < 500) await new Promise(r => setTimeout(r, 500 - gap));
    if (myCount !== searchCounterRef.current) return;
    lastSearchRef.current = Date.now();

    setSearchQuery(query);
    setSearchError(null);
    setSearchLoading(true);
    setSelectedProperty(null);

    try {
      const loc = await invoke<GeoLocation>("geocode", { query });
      if (myCount !== searchCounterRef.current) return;
      setSearchLocation(loc);
      setMapFly({ lat: loc.lat, lng: loc.lng, zoom: 12, bbox: loc.bbox as [number, number, number, number] });

      const cityPart = loc.display_name.split(",")[0].trim().toLowerCase();
      const displayLower = loc.display_name.toLowerCase();
      const isSJ = cityPart === "san jose"
        && (displayLower.includes("california") || displayLower.includes(", ca,") || displayLower.includes(", ca "));

      setDataLoading(true);

      if (isSJ) {
        const d = await invoke<HousingCollection>("fetch_housing");
        if (myCount !== searchCounterRef.current) return;
        setRawData(normalizeFeatures(d.features, "sj"));
        setDataSource("sj");
      } else {
        const emptyC = () => ({ type: "FeatureCollection", features: [] } as HousingCollection);
        const [d, pubD, mfaD, usdaD, insD] = await Promise.all([
          invoke<HousingCollection>("fetch_lihtc", { lat: loc.lat, lng: loc.lng, radiusKm: 25 }),
          invoke<HousingCollection>("fetch_public_housing", { lat: loc.lat, lng: loc.lng, radiusKm: 25 }).catch(emptyC),
          invoke<HousingCollection>("fetch_multifamily_assisted", { lat: loc.lat, lng: loc.lng, radiusKm: 25 }).catch(emptyC),
          invoke<HousingCollection>("fetch_usda_rural", { lat: loc.lat, lng: loc.lng, radiusKm: 25 }).catch(emptyC),
          invoke<HousingCollection>("fetch_insured_multifamily", { lat: loc.lat, lng: loc.lng, radiusKm: 25 }).catch(emptyC),
        ]);
        if (myCount !== searchCounterRef.current) return;
        setRawData(dedupeProperties([
          ...normalizeFeatures(d.features, "lihtc"),
          ...normalizeFeatures(pubD.features, "public"),
          ...normalizeFeatures(mfaD.features, "mfassist"),
          ...normalizeFeatures(usdaD.features, "usda"),
          ...normalizeFeatures(insD.features, "insured"),
        ]));
        setDataSource("lihtc");
      }

      setHasSearched(true);
      setDataLoading(false);
      setSearchLoading(false);
      setSearchHistory(prev => {
        const next = [query, ...prev.filter(q => q !== query)].slice(0, 5);
        try { localStorage.setItem("housing-search-history", JSON.stringify(next)); } catch {  }
        return next;
      });
    } catch (e) {
      if (myCount !== searchCounterRef.current) return;
      const msg = typeof e === "string" ? e : JSON.stringify(e);
      if (msg.includes("Not found") || msg.includes("No results")) {
        setSearchError(t("search.noResults", { query }));
      } else {
        setSearchError(t("search.failed"));
      }
      setHasSearched(true);
      setSearchLoading(false);
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("id");
    const q = params.get("q");
    if (sharedId) pendingSharedIdRef.current = sharedId;
    if (q) handleSearch(q);
  }, [handleSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!typing && e.key === "?") { e.preventDefault(); setShowAbout(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadNearby = useCallback(async (lat: number, lng: number) => {
    setUserLocation({ lat, lng });
    setMapFly({ lat, lng, zoom: 12 });
    try {
      const emptyC = () => ({ type: "FeatureCollection", features: [] } as HousingCollection);
      const [loc, d, pubD, mfaD, usdaD, insD] = await Promise.all([
        invoke<GeoLocation>("reverse_geocode", { lat, lng }).catch(() => null),
        invoke<HousingCollection>("fetch_lihtc", { lat, lng, radiusKm: 25 }),
        invoke<HousingCollection>("fetch_public_housing", { lat, lng, radiusKm: 25 }).catch(emptyC),
        invoke<HousingCollection>("fetch_multifamily_assisted", { lat, lng, radiusKm: 25 }).catch(emptyC),
        invoke<HousingCollection>("fetch_usda_rural", { lat, lng, radiusKm: 25 }).catch(emptyC),
        invoke<HousingCollection>("fetch_insured_multifamily", { lat, lng, radiusKm: 25 }).catch(emptyC),
      ]);
      if (loc) setSearchLocation(loc);
      setRawData(dedupeProperties([
        ...normalizeFeatures(d.features, "lihtc"),
        ...normalizeFeatures(pubD.features, "public"),
        ...normalizeFeatures(mfaD.features, "mfassist"),
        ...normalizeFeatures(usdaD.features, "usda"),
        ...normalizeFeatures(insD.features, "insured"),
      ]));
      setDataSource("lihtc");
      setHasSearched(true);
    } catch {
      setSearchError(t("search.nearMeFailed"));
      setHasSearched(true);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const nearMeByIp = useCallback(async () => {
    try {
      const loc = await invoke<GeoLocation>("ip_locate");
      await loadNearby(loc.lat, loc.lng);
    } catch {
      setDataLoading(false);
      setSearchError(t("search.locateFailed"));
    }
  }, [loadNearby]);

  const handleNearMe = useCallback(() => {
    setDataLoading(true);
    setSearchError(null);
    setSelectedProperty(null);

    if (!navigator.geolocation) {

      void nearMeByIp();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => { void loadNearby(pos.coords.latitude, pos.coords.longitude); },

      () => { void nearMeByIp(); },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );
  }, [loadNearby, nearMeByIp]);

  const handleGoHome = useCallback(() => {
    setRawData([]);
    setDataSource("sj");
    setSearchQuery("");
    setSearchLocation(null);
    setSelectedProperty(null);
    setHasSearched(false);
    setSearchError(null);
    setShowMapView(false);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("housing-favorites-v2", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const exportFavorites = useCallback(() => {
    const saved = rawData.filter(p => favorites.has(p.id));
    if (saved.length === 0) return;
    const lines = saved.map(p => {
      const parts = [
        p.name,
        [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "),
        p.phone ? `Phone: ${p.phone}` : "",
        p.website ? `Website: ${p.website}` : "",
        p.incomeCeilingPct != null ? `Income limit: <=${p.incomeCeilingPct}% AMI` : "",
        p.affordableUnits ? `Affordable units: ${p.affordableUnits}` : "",
        appStatuses[p.id] ? `Status: ${appStatuses[p.id]}` : "",
      ].filter(Boolean);
      return parts.join("\n");
    });
    const header = `HomeFit, Saved Properties (${saved.length})\n${"=".repeat(48)}\n\n`;
    const blob = new Blob([header + lines.join("\n\n" + "-".repeat(32) + "\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saved-housing.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [rawData, favorites, appStatuses]);

  const handleStatusChange = useCallback((id: string, status: AppStatusValue | null) => {
    setAppStatuses(prev => {
      const next = { ...prev };
      if (status === null) {
        delete next[id];
      } else {
        next[id] = status;
      }
      try { localStorage.setItem("housing-app-status-v1", JSON.stringify(next)); } catch {  }
      return next;
    });
  }, []);

  const setDeadline = useCallback((id: string, ms: number | null) => {
    setDeadlines(prev => {
      const next = { ...prev };
      if (ms === null) {
        delete next[id];
      } else {
        next[id] = ms;
      }
      try { localStorage.setItem("housing-deadlines-v1", JSON.stringify(next)); } catch {  }
      return next;
    });
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) return prev;
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => setCompareIds(new Set()), []);

  const handleSurveyComplete = useCallback((filterPatch: Partial<FilterState>, locationQuery: string) => {
    setShowSurvey(false);
    if (filterPatch.householdSize) setHhSize(filterPatch.householdSize);
    if (filterPatch.householdIncome) setIncomeValue(filterPatch.householdIncome);
    setFilters(f => ({ ...f, ...filterPatch }));
    if (locationQuery) {
      handleSearch(locationQuery);
    } else {
      handleNearMe();
    }
  }, [handleSearch, handleNearMe]);

  const handleSurveySkip = useCallback(() => {
    setShowSurvey(false);
    try { localStorage.setItem("housing-survey-v1", "skipped"); } catch {  }
  }, []);

  const savedFilterKey = filters.savedOnly ? favorites : EMPTY_SET;
  const incomeForFilter = useDebounced(incomeValue, 180);
  const amiCeilingForFilter = useDebounced(amiCeiling, 180);

  const ami = useMemo(() => {
    if (!searchLocation) return 97800;
    const city = searchLocation.display_name.split(",")[0];
    const state = rawData[0]?.state ?? "CA";
    return getAmi(state, city);
  }, [searchLocation, rawData]);

  const filtered = useMemo<DisplayProperty[]>(() => {
    let items = rawData;

    if (filters.activeOnly && dataSource === "sj") {
      items = items.filter(p => p.arstatus === "Active");
    }

    if (!showExpired && dataSource === "lihtc") {
      items = items.filter(p => !p.isLikelyExpired);
    }

    if (incomeForFilter > 0) {
      items = items.filter(p => qualifiesForIncome(p, incomeForFilter, hhSize, ami));
    }

    if (amiCeilingForFilter > 0) {
      items = items.filter(p =>
        p.incomeCeilingPct == null || p.incomeCeilingPct <= amiCeilingForFilter
      );
    }

    if (filters.incomeTier) {
      const tierPct = { ELI: 30, VLI: 50, LI: 80, Moderate: 120 }[filters.incomeTier];
      items = items.filter(p => p.incomeCeilingPct == null || tierPct <= p.incomeCeilingPct);
    }

    if (filters.bedroomSize) {
      items = items.filter(p => hasBedroomType(p, filters.bedroomSize));
    }

    if (filters.populationType) {
      items = items.filter(p => popMatches(p, filters.populationType));
    }

    if (filters.voucherOnly) {
      items = items.filter(p => p.hasRentalAssistance);
    }

    if (filters.savedOnly) {
      items = items.filter(p => favorites.has(p.id));
    }

    if (filters.yearBuiltMin != null) {
      items = items.filter(p =>
        p.source !== "lihtc" || (p.yearBuilt != null && p.yearBuilt >= filters.yearBuiltMin!)
      );
    }

    const dist = (p: DisplayProperty) =>
      userLocation && p.lat != null && p.lng != null
        ? haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng)
        : Infinity;

    const estRent = (p: DisplayProperty) =>
      maxRentFromAmi(ami * ((p.incomeCeilingPct ?? 60) / 100), hhSize);

    return [...items].sort((a, b) => {
      switch (filters.sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "distance":
          return dist(a) - dist(b);
        case "units":
          return (b.affordableUnits || 0) - (a.affordableUnits || 0);
        case "rent":
          return estRent(a) - estRent(b);
        case "match": {
          if (incomeForFilter > 0) {
            const aQ = qualifiesForIncome(a, incomeForFilter, hhSize, ami);
            const bQ = qualifiesForIncome(b, incomeForFilter, hhSize, ami);
            if (aQ !== bQ) return aQ ? -1 : 1;
          }
          return dist(a) - dist(b);
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [rawData, filters, dataSource, incomeForFilter, hhSize, ami, amiCeilingForFilter, userLocation, showExpired, savedFilterKey]);

  const listResetKey = `${filtered.length}|${filters.sortBy}|${searchQuery}`;
  const { count: visibleCount, sentinelRef } = useIncrementalCount(filtered.length, 48, listResetKey);
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const mapData = useMemo<HousingCollection>(() => ({
    type: "FeatureCollection",
    features: filtered
      .filter(p => p.lat != null && p.lng != null)
      .map(p => ({
        type: "Feature" as const,
        id: p.id,
        geometry: { type: "Point" as const, coordinates: [p.lng!, p.lat!] },
        properties: { ...p.raw, _displayId: p.id, _ceilPct: p.incomeCeilingPct ?? null },
      })),
  }), [filtered]);

  const handleIncomeChange = useCallback((v: number) => {
    setIncomeValue(v);
    setFilters(f => ({ ...f, householdIncome: v }));
  }, []);

  const handleHhChange = useCallback((n: number) => {
    setHhSize(n);
    setFilters(f => ({ ...f, householdSize: n }));
  }, []);

  const handleSelectFromMap = useCallback((rawProps: Record<string, unknown>) => {
    const id = String(rawProps._displayId ?? "");
    const found = filtered.find(p => p.id === id) ?? rawData.find(p => p.id === id);
    if (found) setSelectedProperty(found);
  }, [filtered, rawData]);


  const loading = dataLoading || searchLoading;
  const reduced = useReducedMotion();

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const out: ActiveFilter[] = [];
    if (incomeValue > 0) out.push({
      key: "income",
      label: `Income $${(incomeValue / 1000).toFixed(0)}k/yr`,
      clear: () => { setIncomeValue(0); setFilters(f => ({ ...f, householdIncome: 0 })); },
    });
    if (amiCeiling > 0) out.push({
      key: "ami", label: `≤${amiCeiling}% AMI`, clear: () => setAmiCeiling(0),
    });
    if (filters.bedroomSize) out.push({
      key: "bed",
      label: filters.bedroomSize === "0" ? "Studio" : `${filters.bedroomSize} bed`,
      clear: () => setFilters(f => ({ ...f, bedroomSize: "" })),
    });
    if (filters.populationType) out.push({
      key: "pop", label: filters.populationType, clear: () => setFilters(f => ({ ...f, populationType: "" })),
    });
    if (filters.voucherOnly) out.push({
      key: "voucher", label: "Rental assistance only", clear: () => setFilters(f => ({ ...f, voucherOnly: false })),
    });
    if (filters.savedOnly) out.push({
      key: "saved", label: "Saved only", clear: () => setFilters(f => ({ ...f, savedOnly: false })),
    });
    if (filters.yearBuiltMin != null) out.push({
      key: "year", label: `Built ${filters.yearBuiltMin}+`, clear: () => setFilters(f => ({ ...f, yearBuiltMin: undefined })),
    });
    if (!showExpired && dataSource === "lihtc") out.push({
      key: "expired", label: "Hiding expired affordability", clear: () => setShowExpired(true),
    });
    return out;
  }, [incomeValue, amiCeiling, filters, showExpired, dataSource]);

  const statusMessage = loading
    ? t("status.loading", { defaultValue: "Searching public housing records…" })
    : searchError
      ? searchError
      : hasSearched
        ? t("status.found", { count: filtered.length })
        : "";

  return (
    <ClickSpark sparkColor="#FFA94D" sparkSize={7} sparkRadius={16} sparkCount={7} duration={420}>
      {showSurvey && (
        <AmiSurvey onComplete={handleSurveyComplete} onSkip={handleSurveySkip} />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      <div className="app-shell">
        <a href="#main-content" className="skip-link">
          {t("a11y.skipToResults", { defaultValue: "Skip to results" })}
        </a>

        <div className="sr-only" role="status" aria-live="polite">{statusMessage}</div>

        <TopBar
          searchDisplay={searchLocation?.display_name}
          hasSearched={hasSearched}
          loading={loading}
          hhSize={hhSize}
          onHhSizeChange={handleHhChange}
          incomeValue={incomeValue}
          onIncomeChange={handleIncomeChange}
          amiCeiling={amiCeiling}
          onAmiCeilingChange={setAmiCeiling}
          onSearch={handleSearch}
          onNearMe={handleNearMe}
          onGoHome={hasSearched ? handleGoHome : undefined}
          showMapView={showMapView}
          onToggleMap={() => setShowMapView(v => !v)}
          resultCount={filtered.length}
          dataSource={dataSource}
          showExpired={showExpired}
          onToggleExpired={() => setShowExpired(v => !v)}
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={clearFilters}
          hasPublicData={rawData.some(p => p.source === "public")}
          onOpenAbout={() => setShowAbout(true)}
        />

        {showMapView && hasSearched && (
          <div className="map-fullview">
            <Suspense fallback={<div className="map-loading" />}>
              <FullMap
                data={mapData}
                userLocation={userLocation}
                mapFly={mapFly}
                dataSource={dataSource}
                selectedId={selectedProperty?.id ?? null}
                onSelectFeature={props => { handleSelectFromMap(props); }}
                onLocate={loc => setUserLocation(loc)}
              />
            </Suspense>
            <p className="map-alt-note">
              {t("a11y.mapListAlternative", {
                count: filtered.length,
                defaultValue: "All {{count}} properties on this map are also listed as text below.",
              })}
            </p>
          </div>
        )}

        <div className={`content-area${selectedProperty ? " has-detail" : ""}`}>
          <main id="main-content" className="results has-fade" tabIndex={-1} aria-busy={loading}>
            {hasSearched && (
              <h1 className="sr-only">
                {t("status.found", { count: filtered.length })}
                {searchLocation ? ` · ${searchLocation.display_name}` : ""}
              </h1>
            )}

            {!hasSearched && !loading && (
              <Hero
                onSearch={handleSearch}
                onNearMe={handleNearMe}
                loading={loading}
                error={searchError}
                searchHistory={searchHistory}
              />
            )}

            {loading && (
              <div className="loading-grid" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="skeleton-line w-30" />
                    <div className="skeleton-line w-80 tall" />
                    <div className="skeleton-line w-60" />
                    <div className="skeleton-figures" />
                    <div className="skeleton-line w-40" />
                  </div>
                ))}
              </div>
            )}

            {hasSearched && !loading && searchError && (
              <div className="results-error" role="alert">
                <h2 className="results-error-head">{t("search.failedHead", { defaultValue: "That search didn't go through" })}</h2>
                <p className="results-error-body">{searchError}</p>
                <button
                  className="empty-reset-btn"
                  onClick={() => { if (searchQuery) handleSearch(searchQuery); else handleNearMe(); }}
                  type="button"
                >
                  {t("search.retry", { defaultValue: "Try again" })}
                </button>
              </div>
            )}

            {hasSearched && !loading && !searchError && (
              <DeadlineWidget
                properties={rawData}
                deadlines={deadlines}
                onSelect={setSelectedProperty}
              />
            )}

            {hasSearched && !loading && !searchError && (() => {
              const savedCount = rawData.filter(p => favorites.has(p.id)).length;
              const trackingCount = rawData.filter(p => appStatuses[p.id]).length;
              if (savedCount === 0 && trackingCount === 0) return null;
              return (
                <div className="results-bar">
                  {savedCount > 0 && (
                    <button
                      className={`results-chip${filters.savedOnly ? " active" : ""}`}
                      onClick={() => setFilters(f => ({ ...f, savedOnly: !f.savedOnly }))}
                      aria-pressed={filters.savedOnly}
                      type="button"
                    >
                      {t("results.saved", { count: savedCount })}
                    </button>
                  )}
                  {trackingCount > 0 && (
                    <span className="results-note tnum">{t("results.tracking", { count: trackingCount })}</span>
                  )}
                  {savedCount > 0 && (
                    <button className="results-link" onClick={exportFavorites} type="button">
                      {t("results.export", { defaultValue: "Export saved" })}
                    </button>
                  )}
                </div>
              );
            })()}

            {hasSearched && !loading && !searchError && filtered.length === 0 && (
              <EmptyState
                active={activeFilters}
                totalBeforeFilters={rawData.length}
                onReset={() => { setIncomeValue(0); setAmiCeiling(0); setShowExpired(false); setFilters(DEFAULT_FILTERS); }}
              />
            )}

            {hasSearched && !loading && !searchError && filtered.length > 0 && (
              <div className="prop-grid">
                {visible.map((p, i) => (
                  <AnimatedContent
                    key={p.id}
                    distance={reduced ? 0 : 34}
                    duration={0.55}
                    ease="power3.out"
                    delay={Math.min(i, 11) * 0.035}
                    initialOpacity={reduced ? 1 : 0}
                    threshold={0.05}
                  >
                    <PropertyCard
                      property={p}
                      userLocation={userLocation}
                      ami={ami}
                      userIncome={incomeValue}
                      hhSize={hhSize}
                      saved={favorites.has(p.id)}
                      appStatus={appStatuses[p.id]}
                      onSelect={setSelectedProperty}
                      onSave={toggleFavorite}
                      onStatusChange={handleStatusChange}
                      comparing={compareIds.has(p.id)}
                      onToggleCompare={toggleCompare}
                    />
                  </AnimatedContent>
                ))}
              </div>
            )}

            {hasSearched && !loading && visibleCount < filtered.length && (
              <div className="results-more">
                <button
                  className="results-more-btn"
                  onClick={() => sentinelRef.current?.scrollIntoView({ block: "nearest" })}
                  type="button"
                >
                  {t("results.showing", {
                    shown: visibleCount,
                    total: filtered.length,
                    defaultValue: "Showing {{shown}} of {{total}}, load more",
                  })}
                </button>
                <div ref={sentinelRef} aria-hidden="true" />
              </div>
            )}
            {hasSearched && !loading && !reduced && (
              <GradualBlur
                target="parent"
                position="bottom"
                height="5rem"
                strength={1.6}
                divCount={5}
                curve="bezier"
                exponential
                opacity={0.85}
              />
            )}
          </main>

          {selectedProperty && (
            <DetailPanel
              property={selectedProperty}
              userLocation={userLocation}
              ami={ami}
              userIncome={incomeValue}
              userHhSize={hhSize}
              saved={favorites.has(selectedProperty.id)}
              appStatus={appStatuses[selectedProperty.id]}
              deadline={deadlines[selectedProperty.id]}
              onClose={() => setSelectedProperty(null)}
              onSave={toggleFavorite}
              onStatusChange={handleStatusChange}
              onSetDeadline={setDeadline}
            />
          )}
        </div>

        {compareIds.size >= 2 && (
          <ComparePanel
            properties={rawData.filter(p => compareIds.has(p.id))}
            userLocation={userLocation}
            searchLocation={searchLocation}
            ami={ami}
            hhSize={hhSize}
            appStatuses={appStatuses}
            deadlines={deadlines}
            onClear={clearCompare}
            onRemove={toggleCompare}
            onSelect={setSelectedProperty}
          />
        )}
      </div>
    </ClickSpark>
  );
}
