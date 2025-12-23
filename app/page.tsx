"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Papa from "papaparse";

/**
 * Plotly (client-only) to avoid SSR issues.
 */
const Plot = dynamic(async () => {
  const Plotly = (await import("plotly.js-dist-min")).default as any;
  const createPlotlyComponent = (await import("react-plotly.js/factory")).default as any;
  return createPlotlyComponent(Plotly);
}, { ssr: false }) as any;

/** -------------------- Config -------------------- */
const CSV_URL = "/data/superstore_orders.csv";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const NUM = new Intl.NumberFormat("en-US");

type AnyRow = Record<string, any>;

function pick(r: AnyRow, keys: string[]) {
  for (const k of keys) {
    if (k in r && r[k] != null && String(r[k]).trim() !== "") return String(r[k]).trim();
  }
  const map = new Map<string, string>();
  for (const kk of Object.keys(r)) map.set(kk.toLowerCase().trim(), kk);
  for (const want of keys) {
    const real = map.get(want.toLowerCase().trim());
    if (real && r[real] != null && String(r[real]).trim() !== "") return String(r[real]).trim();
  }
  return "";
}

function toNumber(v: any): number {
  if (v == null) return 0;
  const s = String(v).replace(/[$,%\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;

  const str = String(v).trim();
  const iso = new Date(str);
  if (!Number.isNaN(iso.getTime())) return iso;

  if (str.includes("/")) {
    const [mm, dd, yyyy] = str.split("/");
    const m = Number(mm), d = Number(dd), y = Number(yyyy);
    if (m && d && y) return new Date(y, m - 1, d);
  }
  if (str.includes("-") || str.includes(".")) {
    const sep = str.includes("-") ? "-" : ".";
    const parts = str.split(sep).map((x) => x.trim());
    if (parts.length === 3) {
      const a = Number(parts[0]), b = Number(parts[1]), c = Number(parts[2]);
      if (a > 12) return new Date(c, b - 1, a);
      return new Date(c, a - 1, b);
    }
  }
  return null;
}

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${y}-${mm}`;
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter((x) => x && x.trim() !== ""))).sort((a, b) => a.localeCompare(b));
}

const STATE_TO_ABBR: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", "DISTRICT OF COLUMBIA": "DC",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL",
  INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
  MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN",
  MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR",
  PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT", VIRGINIA: "VA",
  WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY",
};

function toStateAbbr(s: string) {
  const t = (s || "").trim();
  if (!t) return "";
  if (t.length === 2) return t.toUpperCase();
  return STATE_TO_ABBR[t.toUpperCase()] ?? "";
}

const PALETTE = ["#22D3EE", "#A78BFA", "#34D399", "#FBBF24", "#FB7185", "#60A5FA", "#F472B6", "#2DD4BF"];

function optionStyle() {
  return { backgroundColor: "#0b1220", color: "#E5E7EB" } as React.CSSProperties;
}

type Row = {
  __orderId: string;
  __orderDate: Date | null;
  __shipDate: Date | null;
  __sales: number;
  __profit: number;
  __discount: number;

  __region: string;
  __segment: string;
  __category: string;
  __subCategory: string;
  __shipMode: string;
  __state: string;

  __productContainer: string;
  __productName: string;
  __baseMargin: number; // Product Base Margin
};

/** ---------- Galaxy Starfield (random, not grid) ---------- */
function Starfield({ density = 220, glow = true }: { density?: number; glow?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // draw stars
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // subtle dust
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      for (let i = 0; i < 120; i++) {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        const r = Math.random() * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // main stars
      for (let i = 0; i < density; i++) {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;

        const big = Math.random() < 0.08; // few bigger stars
        const r = big ? 1.6 + Math.random() * 1.2 : 0.7 + Math.random() * 0.8;

        const a = big ? 0.85 : 0.55 + Math.random() * 0.35;

        // slight color variation
        const tint = Math.random();
        const color =
          tint < 0.55 ? "255,255,255" : tint < 0.75 ? "170,220,255" : "210,190,255";

        if (glow && big) {
          ctx.save();
          ctx.globalAlpha = a * 0.35;
          ctx.fillStyle = `rgba(${color},1)`;
          ctx.beginPath();
          ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.globalAlpha = a;
        ctx.fillStyle = `rgba(${color},1)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // reset
      ctx.globalAlpha = 1;
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [density, glow]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
      aria-hidden
    />
  );
}

export default function Page() {
  const [raw, setRaw] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // Filters
  const [region, setRegion] = useState("All");
  const [segment, setSegment] = useState("All");
  const [category, setCategory] = useState("All");
  const [stateName, setStateName] = useState("All");
  const [shipMode, setShipMode] = useState("All");
  const [yearFrom, setYearFrom] = useState<number>(2010);
  const [yearTo, setYearTo] = useState<number>(2016);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await fetch(CSV_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`CSV fetch failed (${res.status})`);
        const text = await res.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        const rows = (parsed.data as AnyRow[]).filter((r) => r && Object.keys(r).length > 1);
        if (alive) setRaw(rows);
      } catch (e: any) {
        if (alive) setErr(e?.message || "Failed to load CSV");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const rows: Row[] = useMemo(() => {
    return raw.map((r) => {
      const od = parseDate(pick(r, ["Order Date", "order date", "OrderDate", "Order_Date", "Date", "order_date"]));
      const sd = parseDate(pick(r, ["Ship Date", "ship date", "ShipDate", "Ship_Date", "ship_date"]));

      const seg = pick(r, ["Customer Segment", "customer segment", "Segment", "segment", "Cust Segment"]) || "Unknown";
      const st = pick(r, ["State or Province", "state or province", "State", "State/Province", "Province"]) || "";
      const baseMargin = toNumber(pick(r, ["Product Base Margin", "product base margin", "Base Margin", "base margin"]));

      return {
        __orderId: pick(r, ["Order ID", "Order Id", "OrderID", "order id", "order_id"]) || "",
        __orderDate: od,
        __shipDate: sd,

        __sales: toNumber(pick(r, ["Sales", "sales", "Total Sales", "total_sales"])) || 0,
        __profit: toNumber(pick(r, ["Profit", "profit", "Total Profit", "total_profit"])) || 0,
        __discount: toNumber(pick(r, ["Discount", "discount"])) || 0,

        __region: pick(r, ["Region", "region"]) || "Unknown",
        __segment: seg,
        __category: pick(r, ["Category", "category"]) || "Unknown",
        __subCategory: pick(r, ["Sub-Category", "Sub Category", "sub-category", "sub category", "SubCategory"]) || "Unknown",
        __shipMode: pick(r, ["Ship Mode", "ship mode", "ShipMode"]) || "Unknown",
        __state: st,

        __productContainer: pick(r, ["Product Container", "product container"]) || "Unknown",
        __productName: pick(r, ["Product Name", "product name"]) || "Unknown",
        __baseMargin: baseMargin,
      };
    });
  }, [raw]);

  const yearBounds = useMemo(() => {
    const ys = rows
      .map((r) => (r.__orderDate ? r.__orderDate.getFullYear() : NaN))
      .filter((n) => Number.isFinite(n));
    const minY = ys.length ? Math.min(...ys) : 2010;
    const maxY = ys.length ? Math.max(...ys) : 2016;
    return { minY, maxY };
  }, [rows]);

  useEffect(() => {
    if (!rows.length) return;
    setYearFrom(yearBounds.minY);
    setYearTo(yearBounds.maxY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const options = useMemo(() => {
    return {
      regions: uniq(rows.map((r) => r.__region)),
      segments: uniq(rows.map((r) => r.__segment)),
      categories: uniq(rows.map((r) => r.__category)),
      states: uniq(rows.map((r) => r.__state)),
      shipModes: uniq(rows.map((r) => r.__shipMode)),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const y1 = Math.min(yearFrom, yearTo);
    const y2 = Math.max(yearFrom, yearTo);

    return rows.filter((r) => {
      const y = r.__orderDate ? r.__orderDate.getFullYear() : NaN;
      if (!Number.isFinite(y)) return false;
      if (y < y1 || y > y2) return false;

      if (region !== "All" && r.__region !== region) return false;
      if (segment !== "All" && r.__segment !== segment) return false;
      if (category !== "All" && r.__category !== category) return false;
      if (stateName !== "All" && r.__state !== stateName) return false;
      if (shipMode !== "All" && r.__shipMode !== shipMode) return false;

      return true;
    });
  }, [rows, region, segment, category, stateName, shipMode, yearFrom, yearTo]);

  const kpis = useMemo(() => {
    const sales = filtered.reduce((a, r) => a + r.__sales, 0);
    const profit = filtered.reduce((a, r) => a + r.__profit, 0);
    const orders = new Set(filtered.map((r) => r.__orderId).filter(Boolean)).size || filtered.length;
    const margin = sales ? profit / sales : 0;
    const avgDiscount = filtered.length ? filtered.reduce((a, r) => a + r.__discount, 0) / filtered.length : 0;

    const shipDaysArr = filtered
      .map((r) => (r.__orderDate && r.__shipDate ? (r.__shipDate.getTime() - r.__orderDate.getTime()) / 86400000 : NaN))
      .filter((n) => Number.isFinite(n)) as number[];

    const avgShipDays = shipDaysArr.length ? shipDaysArr.reduce((a, n) => a + n, 0) / shipDaysArr.length : 0;
    const aov = orders ? sales / orders : 0;

    return { sales, profit, orders, margin, avgDiscount, avgShipDays, aov };
  }, [filtered]);

  const byMonth = useMemo(() => {
    const m = new Map<string, { sales: number; profit: number }>();
    for (const r of filtered) {
      if (!r.__orderDate) continue;
      const key = monthKey(r.__orderDate);
      const cur = m.get(key) || { sales: 0, profit: 0 };
      cur.sales += r.__sales;
      cur.profit += r.__profit;
      m.set(key, cur);
    }
    const keys = Array.from(m.keys()).sort();
    return { x: keys, sales: keys.map((k) => m.get(k)!.sales), profit: keys.map((k) => m.get(k)!.profit) };
  }, [filtered]);

  const bySegment = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.__segment, (m.get(r.__segment) || 0) + r.__sales);
    const items = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    return { labels: items.map((x) => x[0]), values: items.map((x) => x[1]) };
  }, [filtered]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.__category, (m.get(r.__category) || 0) + r.__sales);
    const items = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    return { labels: items.map((x) => x[0]), values: items.map((x) => x[1]) };
  }, [filtered]);

  const byState = useMemo(() => {
    const m = new Map<string, { sales: number; profit: number }>();
    for (const r of filtered) {
      const abbr = toStateAbbr(r.__state);
      if (!abbr) continue;
      const cur = m.get(abbr) || { sales: 0, profit: 0 };
      cur.sales += r.__sales;
      cur.profit += r.__profit;
      m.set(abbr, cur);
    }
    const items = Array.from(m.entries()).sort((a, b) => b[1].sales - a[1].sales);
    return {
      abbr: items.map((x) => x[0]),
      sales: items.map((x) => x[1].sales),
      profit: items.map((x) => x[1].profit)
    };
  }, [filtered]);

  const profitBySubCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.__subCategory, (m.get(r.__subCategory) || 0) + r.__profit);
    const items = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { labels: items.map((x) => x[0]), values: items.map((x) => x[1]) };
  }, [filtered]);

  const salesByRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.__region, (m.get(r.__region) || 0) + r.__sales);
    const items = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    return { labels: items.map((x) => x[0]), values: items.map((x) => x[1]) };
  }, [filtered]);

  /** Chart 7: Sales by Product Container (Top 8) */
  const salesByProductContainer = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.__productContainer, (m.get(r.__productContainer) || 0) + r.__sales);
    const items = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { labels: items.map((x) => x[0]), values: items.map((x) => x[1]) };
  }, [filtered]);

  /** Chart 8: Profit vs Product Base Margin (scatter) */
  const profitVsBaseMargin = useMemo(() => {
    const pts = filtered
      .map((r) => ({
        x: r.__baseMargin,
        y: r.__profit,
        cat: r.__category,
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

    // If base margin looks like 0–1, show as 0–100 in chart labels, but keep x numeric.
    return pts;
  }, [filtered]);

  /** Key Findings (auto insights) */
  const insights = useMemo(() => {
    const sumBy = (keyFn: (r: Row) => string, valFn: (r: Row) => number) => {
      const m = new Map<string, number>();
      for (const r of filtered) {
        const k = keyFn(r) || "Unknown";
        m.set(k, (m.get(k) || 0) + valFn(r));
      }
      const items = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
      return items;
    };

    const topRegion = sumBy((r) => r.__region, (r) => r.__sales)[0];
    const topCategory = sumBy((r) => r.__category, (r) => r.__sales)[0];
    const topSegment = sumBy((r) => r.__segment, (r) => r.__sales)[0];
    const topState = sumBy((r) => r.__state, (r) => r.__sales)[0];
    const bestSubcat = sumBy((r) => r.__subCategory, (r) => r.__profit)[0];

    // best month
    const m = new Map<string, number>();
    for (const r of filtered) {
      if (!r.__orderDate) continue;
      const k = monthKey(r.__orderDate);
      m.set(k, (m.get(k) || 0) + r.__sales);
    }
    const bestMonth = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];

    return {
      topRegion,
      topCategory,
      topSegment,
      topState,
      bestSubcat,
      bestMonth,
      overallMargin: kpis.margin,
      filteredRows: filtered.length,
    };
  }, [filtered, kpis.margin]);

  // Compact height to fit one page
  const CH = 205;

  // Plotly config (clean UI)
  const plotConfig = useMemo(
    () => ({
      responsive: true,
      displaylogo: false,
      displayModeBar: false,
      scrollZoom: false,
      doubleClick: "reset",
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
    }),
    []
  );

  const baseLayout = useMemo(
    () => ({
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "#E5E7EB" },
      hoverlabel: {
        bgcolor: "rgba(10,16,32,0.92)",
        bordercolor: "rgba(34,211,238,0.35)",
        font: { color: "#E5E7EB", size: 12 },
      },
      margin: { l: 46, r: 14, t: 10, b: 34 },
    }),
    []
  );

  const yearsLabel = useMemo(() => {
    const y1 = Math.min(yearFrom, yearTo);
    const y2 = Math.max(yearFrom, yearTo);
    return `${y1}–${y2}`;
  }, [yearFrom, yearTo]);

  function resetAll() {
    setRegion("All");
    setSegment("All");
    setCategory("All");
    setStateName("All");
    setShipMode("All");
    setYearFrom(yearBounds.minY);
    setYearTo(yearBounds.maxY);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#050712] text-slate-200 flex items-center justify-center">Loading…</div>;
  }

  if (err) {
    return (
      <div className="min-h-screen bg-[#050712] text-slate-200 p-8">
        <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xl font-semibold mb-2">CSV load error</div>
          <div className="text-slate-300 mb-4">{err}</div>
          <div className="text-slate-400 text-sm">
            Make sure your file is at: <span className="text-slate-200">public/data/superstore_orders.csv</span>
          </div>
        </div>
      </div>
    );
  }

  /** ---------- UI components (glassy) ---------- */
  const Card = ({
    title,
    subtitle,
    children,
    accent,
  }: {
    title: string;
    subtitle?: string;
    children: any;
    accent?: string;
  }) => (
    <div
      className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] backdrop-blur-[10px] overflow-hidden
                 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_28px_90px_rgba(0,0,0,0.55)]"
      style={{
        boxShadow: accent
          ? `0 0 0 1px rgba(255,255,255,0.04),
             0 0 0 2px ${accent}22,
             0 28px 90px rgba(0,0,0,0.55)`
          : undefined,
      }}
    >
      <div className="px-4 pt-3">
        <div className="text-slate-100 font-semibold text-sm">{title}</div>
        {subtitle ? <div className="text-slate-400 text-[11px] leading-tight">{subtitle}</div> : null}
      </div>
      <div className="px-2 pb-2 pt-1">
        <div className="rounded-xl bg-white/[0.02] border border-white/5">
          {children}
        </div>
      </div>
    </div>
  );

  const Kpi = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
    <div
      className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-[10px] px-3 py-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)]"
      style={{
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04),
                    inset 0 0 0 1px ${accent}18,
                    0 18px 60px rgba(0,0,0,0.45)`,
      }}
    >
      <div className="text-[11px] text-slate-400 leading-none">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-50" style={{ textShadow: `0 0 18px ${accent}33` }}>
        {value}
      </div>
    </div>
  );

  const Select = ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: string[];
  }) => (
    <label className="block">
      <div className="text-[11px] text-slate-300 mb-1 leading-none">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-slate-950/35 text-slate-100 border border-white/10 px-3 py-[7px] text-sm outline-none
                   focus:ring-2 focus:ring-cyan-400/25"
      >
        <option value="All" style={optionStyle()}>All</option>
        {options.map((o) => (
          <option key={o} value={o} style={optionStyle()}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="min-h-screen text-slate-200 overflow-x-hidden">
      {/* Galaxy background (NO blur overlay on top of charts) */}
      <div className="fixed inset-0 -z-10">
        {/* base */}
        <div className="absolute inset-0 bg-[#040615]" />

        {/* nebula glows */}
        <div className="absolute inset-0 bg-[radial-gradient(900px_540px_at_10%_12%,rgba(168,85,247,0.35),transparent_60%),radial-gradient(900px_540px_at_55%_10%,rgba(34,211,238,0.24),transparent_62%),radial-gradient(900px_540px_at_90%_28%,rgba(16,185,129,0.20),transparent_64%),radial-gradient(1100px_700px_at_45%_92%,rgba(99,102,241,0.22),transparent_62%)]" />

        {/* subtle vignette */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.45),rgba(2,6,23,0.92))]" />

        {/* random stars */}
        <Starfield density={260} glow />

        {/* extra faint noise */}
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.22)_1px,transparent_0)] [background-size:26px_26px]" />
      </div>

      <div className="max-w-[1400px] mx-auto px-5 py-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-3xl font-bold tracking-tight text-slate-50">Executive Sales Dashboard</div>
            <div className="mt-1 text-slate-300/80 text-sm">
              Command-center layout • galaxy dark theme • 8 charts • click charts to filter
            </div>
            <div className="mt-1 text-[11px] text-slate-400/80">
              Created by <span className="text-slate-200 font-medium">Jignesh Patel</span>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur-md">
              Rows: <span className="font-semibold text-slate-100">{NUM.format(rows.length)}</span>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur-md">
              Filtered: <span className="font-semibold text-slate-100">{NUM.format(filtered.length)}</span>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur-md">
              Years: <span className="font-semibold text-slate-100">{yearsLabel}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-[10px] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.45)]">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-2"><Select label="Region" value={region} onChange={setRegion} options={options.regions} /></div>
            <div className="col-span-2"><Select label="Segment" value={segment} onChange={setSegment} options={options.segments} /></div>
            <div className="col-span-2"><Select label="Category" value={category} onChange={setCategory} options={options.categories} /></div>
            <div className="col-span-2"><Select label="State" value={stateName} onChange={setStateName} options={options.states} /></div>
            <div className="col-span-2"><Select label="Ship Mode" value={shipMode} onChange={setShipMode} options={options.shipModes} /></div>

            <label className="col-span-1 block">
              <div className="text-[11px] text-slate-300 mb-1 leading-none">Year From</div>
              <input
                type="number"
                min={yearBounds.minY}
                max={yearBounds.maxY}
                value={yearFrom}
                onChange={(e) => setYearFrom(Number(e.target.value))}
                className="w-full rounded-xl bg-slate-950/35 text-slate-100 border border-white/10 px-3 py-[7px] text-sm outline-none focus:ring-2 focus:ring-cyan-400/25"
              />
            </label>

            <label className="col-span-1 block">
              <div className="text-[11px] text-slate-300 mb-1 leading-none">Year To</div>
              <input
                type="number"
                min={yearBounds.minY}
                max={yearBounds.maxY}
                value={yearTo}
                onChange={(e) => setYearTo(Number(e.target.value))}
                className="w-full rounded-xl bg-slate-950/35 text-slate-100 border border-white/10 px-3 py-[7px] text-sm outline-none focus:ring-2 focus:ring-cyan-400/25"
              />
            </label>

            <div className="col-span-12 flex justify-end mt-1">
              <button
                onClick={resetAll}
                className="rounded-xl border border-white/10 bg-white/8 hover:bg-white/12 px-4 py-2 text-sm text-slate-100 backdrop-blur-md"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-2 grid grid-cols-7 gap-2">
          <Kpi label="Total Sales" value={USD.format(kpis.sales)} accent={PALETTE[0]} />
          <Kpi label="Total Profit" value={USD.format(kpis.profit)} accent={PALETTE[2]} />
          <Kpi label="Total Orders" value={NUM.format(kpis.orders)} accent={PALETTE[1]} />
          <Kpi label="Profit Margin" value={`${(kpis.margin * 100).toFixed(1)}%`} accent={PALETTE[4]} />
          <Kpi label="Avg Discount" value={`${(kpis.avgDiscount * 100).toFixed(1)}%`} accent={PALETTE[3]} />
          <Kpi label="Avg Ship Days" value={`${kpis.avgShipDays.toFixed(1)}d`} accent={PALETTE[7]} />
          <Kpi label="Avg Order Value" value={USD.format(kpis.aov)} accent={PALETTE[5]} />
        </div>

        {/* Charts grid (8 charts + insights panel) */}
        <div className="mt-3 grid grid-cols-12 gap-3">
          {/* 1) Line */}
          <div className="col-span-6">
            <Card title="Sales & Profit Over Time" subtitle="Monthly trend (hover unified; glassy)" accent={PALETTE[0]}>
              <div style={{ height: CH }}>
                <Plot
                  data={[
                    {
                      type: "scatter",
                      mode: "lines+markers",
                      name: "Sales",
                      x: byMonth.x,
                      y: byMonth.sales,
                      line: { width: 3, color: PALETTE[0] },
                      marker: { size: 5, color: PALETTE[0] },
                      opacity: 0.92,
                      hovertemplate: "Month %{x}<br><b>Sales</b>: %{y:$,.0f}<extra></extra>",
                    },
                    {
                      type: "scatter",
                      mode: "lines+markers",
                      name: "Profit",
                      x: byMonth.x,
                      y: byMonth.profit,
                      line: { width: 3, color: PALETTE[1] },
                      marker: { size: 5, color: PALETTE[1] },
                      opacity: 0.9,
                      hovertemplate: "Month %{x}<br><b>Profit</b>: %{y:$,.0f}<extra></extra>",
                    },
                  ]}
                  layout={{
                    ...baseLayout,
                    height: CH,
                    hovermode: "x unified",
                    xaxis: { tickangle: -28, gridcolor: "rgba(255,255,255,0.06)" },
                    yaxis: { gridcolor: "rgba(255,255,255,0.06)" },
                    legend: { orientation: "h", y: -0.22, x: 0 },
                    margin: { l: 50, r: 14, t: 10, b: 40 },
                  }}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                />
              </div>
            </Card>
          </div>

          {/* 2) Segment */}
          <div className="col-span-3">
            <Card title="Sales by Segment" subtitle="Click a bar to filter Segment" accent={PALETTE[2]}>
              <div style={{ height: CH }}>
                <Plot
                  data={[
                    {
                      type: "bar",
                      x: bySegment.labels,
                      y: bySegment.values,
                      marker: { color: bySegment.labels.map((_, i) => PALETTE[i % PALETTE.length]), opacity: 0.88 },
                      hovertemplate: "<b>%{x}</b><br>Sales: %{y:$,.0f}<extra></extra>",
                    },
                  ]}
                  layout={{
                    ...baseLayout,
                    height: CH,
                    xaxis: { tickangle: -12, gridcolor: "rgba(255,255,255,0.06)" },
                    yaxis: { gridcolor: "rgba(255,255,255,0.06)" },
                    margin: { l: 48, r: 12, t: 10, b: 36 },
                  }}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                  onClick={(ev: any) => {
                    const label = ev?.points?.[0]?.x;
                    if (label) setSegment(String(label));
                  }}
                />
              </div>
            </Card>
          </div>

          {/* 3) Category donut */}
          <div className="col-span-3">
            <Card title="Sales by Category" subtitle="Click slice to filter Category" accent={PALETTE[3]}>
              <div style={{ height: CH }}>
                <Plot
                  data={[
                    {
                      type: "pie",
                      labels: byCategory.labels,
                      values: byCategory.values,
                      hole: 0.62,
                      sort: false,
                      marker: { colors: byCategory.labels.map((_, i) => PALETTE[i % PALETTE.length]), line: { color: "rgba(255,255,255,0.08)", width: 1 } },
                      textinfo: "percent",
                      textfont: { color: "#E5E7EB", size: 12 },
                      opacity: 0.95,
                      hovertemplate: "<b>%{label}</b><br>Sales: %{value:$,.0f}<extra></extra>",
                    },
                  ]}
                  layout={{
                    ...baseLayout,
                    height: CH,
                    margin: { l: 6, r: 6, t: 6, b: 6 },
                    showlegend: true,
                    legend: { x: 1.02, y: 0.95, font: { size: 11 } },
                  }}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                  onClick={(ev: any) => {
                    const label = ev?.points?.[0]?.label;
                    if (label) setCategory(String(label));
                  }}
                />
              </div>
            </Card>
          </div>

          {/* 4) Choropleth */}
          <div className="col-span-6">
            <Card title="Sales by State" subtitle="Choropleth (click a state to filter)" accent={PALETTE[5]}>
              <div style={{ height: CH }}>
                <Plot
                  data={[
                    {
                      type: "choropleth",
                      locationmode: "USA-states",
                      locations: byState.abbr,
                      z: byState.sales,
                      colorscale: "Viridis",
                      marker: { line: { color: "rgba(255,255,255,0.18)", width: 0.6 } },
                      colorbar: { thickness: 10, outlinewidth: 0, tickfont: { color: "#E5E7EB", size: 10 } },
                      customdata: byState.profit,
                      hovertemplate:
                        "<b>%{location}</b><br>Sales: %{z:$,.0f}<br>Profit: %{customdata:$,.0f}<extra></extra>",
                    },
                  ]}
                  layout={{
                    ...baseLayout,
                    height: CH,
                    margin: { l: 6, r: 6, t: 6, b: 6 },
                    geo: {
                      scope: "usa",
                      bgcolor: "rgba(0,0,0,0)",
                      lakecolor: "rgba(34,211,238,0.10)",
                      showlakes: true,
                      subunitcolor: "rgba(255,255,255,0.14)",
                    },
                  }}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                />
              </div>
            </Card>
          </div>

          {/* 5) Profit by Sub-Category */}
          <div className="col-span-3">
            <Card title="Profit by Sub-Category" subtitle="Top 10 (balanced colors)" accent={PALETTE[4]}>
              <div style={{ height: CH }}>
                <Plot
                  data={[
                    {
                      type: "bar",
                      orientation: "h",
                      y: profitBySubCategory.labels.slice().reverse(),
                      x: profitBySubCategory.values.slice().reverse(),
                      marker: { color: profitBySubCategory.labels.map((_, i) => PALETTE[(i + 2) % PALETTE.length]), opacity: 0.88 },
                      hovertemplate: "<b>%{y}</b><br>Profit: %{x:$,.0f}<extra></extra>",
                    },
                  ]}
                  layout={{
                    ...baseLayout,
                    height: CH,
                    margin: { l: 128, r: 12, t: 10, b: 30 },
                    xaxis: { gridcolor: "rgba(255,255,255,0.06)" },
                    yaxis: { gridcolor: "rgba(255,255,255,0.02)", tickfont: { size: 10 } },
                  }}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                />
              </div>
            </Card>
          </div>

          {/* 6) Sales by Region */}
          <div className="col-span-3">
            <Card title="Sales by Region" subtitle="Click bar to filter Region" accent={PALETTE[7]}>
              <div style={{ height: CH }}>
                <Plot
                  data={[
                    {
                      type: "bar",
                      x: salesByRegion.labels,
                      y: salesByRegion.values,
                      marker: { color: salesByRegion.labels.map((_, i) => PALETTE[(i + 3) % PALETTE.length]), opacity: 0.88 },
                      hovertemplate: "<b>%{x}</b><br>Sales: %{y:$,.0f}<extra></extra>",
                    },
                  ]}
                  layout={{
                    ...baseLayout,
                    height: CH,
                    xaxis: { tickangle: -12, gridcolor: "rgba(255,255,255,0.06)" },
                    yaxis: { gridcolor: "rgba(255,255,255,0.06)" },
                    margin: { l: 48, r: 12, t: 10, b: 36 },
                  }}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                  onClick={(ev: any) => {
                    const label = ev?.points?.[0]?.x;
                    if (label) setRegion(String(label));
                  }}
                />
              </div>
            </Card>
          </div>

          {/* 7) Sales by Product Container */}
          <div className="col-span-4">
            <Card title="Sales by Product Container" subtitle="Top 8 containers" accent={PALETTE[6]}>
              <div style={{ height: CH }}>
                <Plot
                  data={[
                    {
                      type: "bar",
                      orientation: "h",
                      y: salesByProductContainer.labels.slice().reverse(),
                      x: salesByProductContainer.values.slice().reverse(),
                      marker: { color: salesByProductContainer.labels.map((_, i) => PALETTE[(i + 1) % PALETTE.length]), opacity: 0.88 },
                      hovertemplate: "<b>%{y}</b><br>Sales: %{x:$,.0f}<extra></extra>",
                    },
                  ]}
                  layout={{
                    ...baseLayout,
                    height: CH,
                    margin: { l: 120, r: 12, t: 10, b: 30 },
                    xaxis: { gridcolor: "rgba(255,255,255,0.06)" },
                    yaxis: { gridcolor: "rgba(255,255,255,0.02)", tickfont: { size: 10 } },
                  }}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                />
              </div>
            </Card>
          </div>

          {/* 8) Profit vs Product Base Margin */}
          <div className="col-span-4">
            <Card title="Profit vs Product Base Margin" subtitle="Scatter (base margin vs profit)" accent={PALETTE[2]}>
              <div style={{ height: CH }}>
                <Plot
                  data={[
                    {
                      type: "scatter",
                      mode: "markers",
                      x: profitVsBaseMargin.map((p) => p.x),
                      y: profitVsBaseMargin.map((p) => p.y),
                      marker: {
                        size: 7,
                        opacity: 0.75,
                        color: profitVsBaseMargin.map((p) => {
                          if (p.cat === "Technology") return PALETTE[0];
                          if (p.cat === "Furniture") return PALETTE[1];
                          if (p.cat === "Office Supplies") return PALETTE[2];
                          return PALETTE[5];
                        }),
                      },
                      hovertemplate: "Base Margin: %{x:.2f}<br>Profit: %{y:$,.0f}<extra></extra>",
                    },
                  ]}
                  layout={{
                    ...baseLayout,
                    height: CH,
                    margin: { l: 52, r: 12, t: 10, b: 34 },
                    xaxis: { title: "Base Margin", gridcolor: "rgba(255,255,255,0.06)" },
                    yaxis: { title: "Profit", gridcolor: "rgba(255,255,255,0.06)" },
                  }}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                />
              </div>
            </Card>
          </div>

          {/* Insights panel (Option #3) */}
          <div className="col-span-4">
            <Card title="Key Findings" subtitle="Auto insights based on current filters" accent={PALETTE[0]}>
              <div className="p-3">
                <div className="text-[12px] text-slate-200 leading-6">
                  <div>• Top Region: <span className="text-slate-50 font-semibold">{insights.topRegion?.[0] ?? "—"}</span> ({insights.topRegion ? USD.format(insights.topRegion[1]) : "—"} sales)</div>
                  <div>• Top Category: <span className="text-slate-50 font-semibold">{insights.topCategory?.[0] ?? "—"}</span> ({insights.topCategory ? USD.format(insights.topCategory[1]) : "—"} sales)</div>
                  <div>• Top Segment: <span className="text-slate-50 font-semibold">{insights.topSegment?.[0] ?? "—"}</span> ({insights.topSegment ? USD.format(insights.topSegment[1]) : "—"} sales)</div>
                  <div>• Top State: <span className="text-slate-50 font-semibold">{insights.topState?.[0] ?? "—"}</span> ({insights.topState ? USD.format(insights.topState[1]) : "—"} sales)</div>
                  <div>• Best Profit Sub-Category: <span className="text-slate-50 font-semibold">{insights.bestSubcat?.[0] ?? "—"}</span> ({insights.bestSubcat ? USD.format(insights.bestSubcat[1]) : "—"} profit)</div>
                  <div>• Best Month: <span className="text-slate-50 font-semibold">{insights.bestMonth?.[0] ?? "—"}</span> ({insights.bestMonth ? USD.format(insights.bestMonth[1]) : "—"} sales)</div>
                  <div>• Overall Profit Margin: <span className="text-slate-50 font-semibold">{(insights.overallMargin * 100).toFixed(1)}%</span></div>
                </div>

                <div className="mt-2 text-[11px] text-slate-400/80">
                  Tip: Use dropdowns or click charts to drill down.
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
