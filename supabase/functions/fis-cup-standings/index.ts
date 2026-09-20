import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Imports FIS cup standings for a season. One page gives Overall + every discipline column.
// POST { cup:'EC', season:'2027', gender:'M' }  |  ?cup=EC&season=2027&gender=M[&preview=1]
// No args: refreshes the default set (EC, ANC, NAC, FEC, SAC, WC) for both genders, current season.

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, GET, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const UA = { "user-agent": "Mozilla/5.0 Rennkalender/1.0 (public FIS data)" };
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
const tokens = (h: string) => decode(h.replace(/<!--[\s\S]*?-->/g, "")).split(/<[^>]+>/).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
const DISC: Record<string, string> = { ALL: "ALL", SL: "SL", GS: "GS", SG: "SG", DH: "DH", AC: "AC" };

// Row tokens: [name, NAT, "Overall", "ALL", rank, pts, "Slalom", "SL", rank, pts, ...]
async function fetchCup(cup: string, season: string, gender: string) {
  const url = `https://www.fis-ski.com/DB/alpine-skiing/cup-standings.html?sectorcode=AL&seasoncode=${season}&cupcode=${cup}&disciplinecode=ALL&gendercode=${gender}&nationcode=&search=true`;
  const html = await (await fetch(url, { headers: UA })).text();
  const out: any[] = [];
  const rRe = /<a[^>]+class="table-row[^"]*"[^>]*href="[^"]*competitorid=(\d+)[^"]*"[\s\S]*?<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = rRe.exec(html))) {
    const t = tokens(m[0]);
    const name = t[0] || null;
    const nation = t.find((x) => /^[A-Z]{3}$/.test(x)) || null;
    for (let i = 0; i < t.length; i++) {
      const d = DISC[t[i]];
      if (d && /^\d{1,3}$/.test(t[i + 1] || "") && /^\d+(\.\d+)?$/.test(t[i + 2] || "")) {
        out.push({ competitor_id: m[1], name, nation, discipline: d, rank: +t[i + 1], points: +t[i + 2] });
      }
    }
  }
  return { url, rows: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const u = new URL(req.url);
  let b: any = {}; if (req.method === "POST") { try { b = await req.json(); } catch { /* */ } }
  const preview = (b.preview || u.searchParams.get("preview")) === "1";
  const season = String(b.season || u.searchParams.get("season") || "2027");
  const one = b.cup || u.searchParams.get("cup");
  const jobs = one
    ? [{ cup: String(one).toUpperCase(), gender: String(b.gender || u.searchParams.get("gender") || "M").toUpperCase() }]
    : ["EC", "ANC", "NAC", "FEC", "SAC", "WC"].flatMap((c) => [{ cup: c, gender: "M" }, { cup: c, gender: "W" }]);

  const log: any[] = [];
  for (const j of jobs) {
    try {
      const r = await fetchCup(j.cup, season, j.gender);
      if (preview) { log.push({ ...j, count: r.rows.length, sample: r.rows.slice(0, 6), url: r.url }); continue; }
      if (!r.rows.length) { log.push({ ...j, imported: 0 }); continue; }
      // map competitorid -> fis code from the imported FIS list
      const ids = [...new Set(r.rows.map((x) => x.competitor_id))];
      const map = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await supabase.from("fis_list_athletes").select("fis_code, competitor_id").in("competitor_id", ids.slice(i, i + 500));
        (data || []).forEach((x: any) => map.set(String(x.competitor_id), x.fis_code));
      }
      const rows = r.rows.map((x) => ({ ...x, cup: j.cup, season, gender: j.gender, fis_code: map.get(x.competitor_id) || null, fetched_at: new Date().toISOString() }));
      await supabase.from("fis_cup_standings").delete().eq("cup", j.cup).eq("season", season).eq("gender", j.gender);
      const { error } = await supabase.from("fis_cup_standings").upsert(rows, { onConflict: "cup,season,gender,discipline,competitor_id" });
      if (error) throw new Error(error.message);
      log.push({ ...j, imported: rows.length, matched: rows.filter((x) => x.fis_code).length });
    } catch (e) { log.push({ ...j, error: String(e).slice(0, 160) }); }
  }
  return json(log);
});
