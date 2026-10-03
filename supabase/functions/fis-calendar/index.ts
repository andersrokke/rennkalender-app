import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { lesKalender } from "./parse.js";

// Henter FIS-kalenderen for utvalgte cuper og holder rennene i appen i takt:
// nye arrangementer legges inn, flyttede får ny dato, avlyste merkes. Kjøres
// hver natt av cron. ?dry=1 viser hva som ville blitt gjort uten å skrive.
//
// Ingenting slettes. Leser siden ingen rader - fordi FIS har endret oppsettet
// eller er nede - gjøres det ingenting, og svaret sier det.

const UA = { "user-agent": "Mozilla/5.0 Rennkalender/1.0 (public FIS data)" };
// To slags utvalg: en cup (alle renn i kategorien, uansett land) eller et
// land (alle renn som går der, uansett kategori). De nordiske rennene er lagt
// inn for hånd med egne merknader, og hentes ikke herfra.
const CUPER = ["FEC"];
const LAND = ["AUT", "GER", "SUI", "FRA", "ITA"];
const ISO2: Record<string, string> = { CHN: "cn", KOR: "kr", JPN: "jp", KAZ: "kz", MGL: "mn", AUT: "at", GER: "de", SUI: "ch", FRA: "fr", ITA: "it" };
// Kartoppslag tar et drøyt sekund hver. Ett kjør slår opp steder til tida er
// brukt opp; resten tas neste natt. Rennene legges inn med en gang uansett,
// og får markør på kartet når stedet deres er slått opp.
const OPPSLAG_BUDSJETT_MS = 85_000;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b, null, 1), { status, headers: { "content-type": "application/json" } });

// Koordinater til et sted som ikke finnes fra før. Svarer null heller enn å
// gjette: et renn uten markør er bedre enn en markør i feil land.
async function finnKoordinater(sted: string, nasjon: string) {
  const land = ISO2[nasjon];
  if (!land) return null;
  const sok = async (q: string) => {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${land}&q=${encodeURIComponent(q)}`, { headers: UA });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.[0] ? { lat: +d[0].lat, lng: +d[0].lon } : null;
  };
  // FIS skriver gjerne to navn («Fassa | San Giovanni di Fassa»,
  // «Sarentino/Sarntal»). Hele navnet prøves først, så hver del for seg.
  const forsok = [sted, sted.replace(/\b(Ski )?Resorts?\b/gi, "").trim(),
    ...sted.split(/[|\/,(]/).map((d) => d.replace(/\)/g, "").trim())].filter((q, i, a) => q.length > 2 && a.indexOf(q) === i);
  try {
    for (const q of forsok.slice(0, 3)) {
      const k = await sok(q);
      if (k) return k;
      await new Promise((f) => setTimeout(f, 1100));
    }
    return null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* tom kropp */ } }
  const dry = u.searchParams.get("dry") === "1" || body.dry === true;
  const season = /^\d{4}$/.test(String(body.season ?? "")) ? String(body.season) : "2027";
  const start = Date.now();
  const cuper = (Array.isArray(body.categories) ? body.categories : CUPER).filter((c: string) => CUPER.includes(c));
  const land = (Array.isArray(body.nations) ? body.nations : LAND).filter((n: string) => LAND.includes(n));
  const utvalg = [...cuper.map((c: string) => ({ cup: c, nasjon: null as string | null })), ...land.map((n: string) => ({ cup: null as string | null, nasjon: n }))];

  const logg: any[] = [];
  for (const u of utvalg) {
    const cup = u.cup ?? u.nasjon;
    try {
      const r = await fetch(`https://www.fis-ski.com/DB/alpine-skiing/calendar-results.html?sectorcode=AL&seasoncode=${season}&categorycode=${u.cup ?? ""}&nationcode=${u.nasjon ?? ""}&seasonmonth=X-${season}&saveselection=-1`, { headers: UA });
      if (!r.ok) { logg.push({ cup, feil: `FIS svarte ${r.status}` }); continue; }
      // Et landutvalg hos FIS gir både renn som går i landet og renn landet
      // arrangerer andre steder. Vertslandet leses av stedsnavnet; bare renn
      // som faktisk går i landet tas med.
      const funnet = lesKalender(await r.text()).filter((x: any) => u.cup ? x.category === u.cup : x.host === u.nasjon)
        .map((x: any) => ({ ...x, host_nation: x.host, organiser_nation: x.nation !== x.host ? x.nation : null }));
      if (!funnet.length) { logg.push({ cup, funnet: 0, merknad: "Ingen rader lest - ingenting endret" }); continue; }

      const navn = [...new Set(funnet.map((x: any) => x.place))];
      const { data: kjente } = await supabase.from("venues").select("id, name").in("name", navn);
      const sted = new Map((kjente || []).map((v: any) => [v.name, v.id]));
      const nyeSteder: any[] = [];
      let utsatt = 0;
      for (const x of funnet) {
        if (sted.has(x.place)) continue;
        sted.set(x.place, null);
        if (Date.now() - start > OPPSLAG_BUDSJETT_MS) { utsatt++; continue; }
        const k = await finnKoordinater(x.place, x.host_nation);
        nyeSteder.push({ sted: x.place, land: x.host_nation, koordinater: k });
        sted.set(x.place, null);
        if (!k || dry) continue;
        const { data: ny } = await supabase.from("venues")
          .upsert({ name: x.place, country: x.host_nation, lat: k.lat, lng: k.lng }, { onConflict: "name" }).select("id").single();
        if (ny) sted.set(x.place, ny.id);
        // Nominatim ber om høyst ett oppslag i sekundet.
        await new Promise((f) => setTimeout(f, 1100));
      }

      const { data: finnes } = await supabase.from("races")
        .select("id, fis_event_id, start_date, end_date, place, events, gender, venue_id, note")
        .in("fis_event_id", funnet.map((x: any) => x.fis_event_id));
      const gammel = new Map((finnes || []).map((x: any) => [x.fis_event_id, x]));
      const nye: any[] = [], endret: any[] = [];
      for (const x of funnet) {
        const g: any = gammel.get(x.fis_event_id);
        const note = x.cancelled ? "Avlyst" : null;
        const rad = { start_date: x.start_date, end_date: x.end_date, place: x.place, events: x.events, gender: x.gender };
        if (!g) {
          nye.push({ ...rad, fis_event_id: x.fis_event_id, host_nation: x.host_nation, organiser_nation: x.organiser_nation, category: x.category, season, venue_id: sted.get(x.place) ?? null, note });
          continue;
        }
        const diff: any = {};
        // Stedsnavnet på et renn som alt ligger inne står: FIS pusser på
        // skrivemåten («Peio» blir «Pejo»), og noen navn er ryddet for hånd.
        for (const [k, v] of Object.entries(rad)) if (k !== "place" && g[k] !== v) diff[k] = v;
        // En merknad noen har skrevet for hånd står; bare «Avlyst» styres herfra.
        if (x.cancelled && g.note !== "Avlyst") diff.note = "Avlyst";
        if (!x.cancelled && g.note === "Avlyst") diff.note = null;
        if (g.venue_id == null && sted.get(x.place)) diff.venue_id = sted.get(x.place);
        if (Object.keys(diff).length) endret.push({ id: g.id, fis_event_id: x.fis_event_id, sted: x.place, diff });
      }
      if (!dry) {
        if (nye.length) { const { error } = await supabase.from("races").insert(nye); if (error) throw error; }
        for (const e of endret) { const { error } = await supabase.from("races").update(e.diff).eq("id", e.id); if (error) throw error; }
      }
      logg.push({ utvalg: cup, funnet: funnet.length, nye: nye.length, endret, nyeSteder, stederUtsattTilNesteKjor: utsatt });
    } catch (e) { logg.push({ cup, feil: String((e as any)?.message ?? e).slice(0, 200) }); }
  }
  return json({ dry, season, logg });
});
