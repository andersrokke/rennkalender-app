import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { forOfte } from "../_shared/vakt.ts";
import { finnSted, dagsvaer } from "./sted.js";

// Henter været på renndagen for renn i fis_results som mangler det.
// Kilde: Open-Meteo sitt historiske arkiv (åpent, uten nøkkel). Sendes dit:
// koordinater og dato. Ingenting om løperne.
//
// Kjøres hver natt av pg_cron. Tar opptil 200 renndager per kjøring.

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { "content-type": "application/json" } });

// FIS sin nasjonskode -> ISO, for stedssøket når stedet ikke er kjent fra før.
const ISO: Record<string, string> = {
  NOR: "NO", SWE: "SE", FIN: "FI", DEN: "DK", ISL: "IS", AUT: "AT", GER: "DE", SUI: "CH", FRA: "FR", ITA: "IT",
  SLO: "SI", CRO: "HR", CZE: "CZ", SVK: "SK", POL: "PL", ESP: "ES", AND: "AD", GBR: "GB", BUL: "BG", GEO: "GE",
  USA: "US", CAN: "CA", NZL: "NZ", AUS: "AU", CHI: "CL", ARG: "AR", JPN: "JP", KOR: "KR", CHN: "CN", LIE: "LI",
};

async function sok(place: string, nation: string) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=5&language=en&format=json`;
  try {
    const r = await fetch(u);
    if (!r.ok) return null;
    const d = await r.json();
    const iso = ISO[nation];
    // Uten kjent land er et navnetreff for usikkert: heller ingen vær enn feil sted.
    const t = (d.results || []).find((x: any) => iso && x.country_code === iso);
    return t ? { lat: t.latitude, lng: t.longitude } : null;
  } catch { return null; }
}

async function vaer(lat: number, lng: number, dato: string) {
  const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${dato}&end_date=${dato}` +
    `&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,cloud_cover,weather_code&timezone=auto&wind_speed_unit=ms`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const d = await r.json();
  return { dag: dagsvaer(d.hourly), elevation: d.elevation ?? null };
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const stopp = await forOfte(supabase, "race-weather", 120);
  if (stopp) return stopp;

  const { data: mangler, error } = await supabase.rpc("vaer_mangler", { p_antall: 200 });
  if (error) return json({ feil: error.message }, 500);
  if (!mangler?.length) return json({ hentet: 0, mangler: 0 });

  const { data: steder } = await supabase.from("venues").select("name, country, lat, lng");
  const funnet = new Map<string, { lat: number; lng: number } | null>();
  let hentet = 0, uten = 0, feil = 0;

  // Fem om gangen: raskt nok, og langt under grensen hos kilden.
  for (let i = 0; i < mangler.length; i += 5) {
    await Promise.all(mangler.slice(i, i + 5).map(async (m: any) => {
      const k = `${m.place}|${m.nation}`;
      if (!funnet.has(k)) {
        const s = finnSted(m.place, m.nation, steder || []) as any;
        funnet.set(k, s ? { lat: s.lat, lng: s.lng } : await sok(m.place, m.nation));
      }
      const pos = funnet.get(k);
      const rad: any = { place: m.place, nation: m.nation, race_date: m.race_date, fetched_at: new Date().toISOString() };
      if (!pos) {
        uten++;
        await supabase.from("race_weather").upsert({ ...rad, funnet: false });
        return;
      }
      try {
        const v = await vaer(pos.lat, pos.lng, m.race_date);
        if (!v.dag) { uten++; await supabase.from("race_weather").upsert({ ...rad, lat: pos.lat, lng: pos.lng, funnet: false }); return; }
        const { error: e } = await supabase.from("race_weather")
          .upsert({ ...rad, lat: pos.lat, lng: pos.lng, elevation: v.elevation, ...v.dag, funnet: true });
        if (e) feil++; else hentet++;
      } catch { feil++; }   // nettfeil: prøves igjen neste natt
    }));
  }
  return json({ hentet, uten_sted: uten, feil, behandlet: mangler.length });
});
