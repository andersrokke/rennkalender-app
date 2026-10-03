import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Fetches FIS points lists + race results from an athlete's public FIS biography page.
// Callable from the app: supabase.functions.invoke('fis-athlete', { body: { fiscode: '423032' } })

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b, null, 1), { status, headers: { ...CORS, "content-type": "application/json" } });

const UA = { "user-agent": "Mozilla/5.0 Rennkalender/1.0 (public FIS data)" };
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const tokens = (html: string) => decode(html.replace(/<!--[\s\S]*?-->/g, "")).split(/<[^>]+>/).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);

const DISC_RE = /^(Slalom|Giant Slalom|Super G|Downhill|Alpine Combined|Parallel|Team Combined|Team Event|Team)$/;
const POS_RE = /^(\d{1,3}|DNF\d?|DNS\d?|DSQ\d?|DNQ\d?|NPS\d?|DQ|DQO)$/;
const NUM_RE = /^\d+(\.\d+)?$/;

async function resolveCompetitor(fiscode: string) {
  const r = await fetch(`https://www.fis-ski.com/DB/general/biographies.html?fiscode=${fiscode}&sectorcode=AL&search=true`, { headers: UA });
  const html = await r.text();
  const m = html.match(/athlete-biography\.html\?[^"']*competitorid=(\d+)/);
  return m ? m[1] : null;
}

function parsePoints(html: string) {
  const points: any[] = [];
  const pRe = /<a class="table-row" href="[^"]*fis-points-details\.html\?[^"]*listid=(\d+)"[\s\S]*?<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(html))) {
    const t = tokens(m[0]); const label = t[0];
    for (let i = 1; i < t.length; i++) {
      if (["DH", "SL", "GS", "SG", "AC"].includes(t[i])) {
        const pts = t[i + 1], rank = t[i + 2];
        if (pts && /^[\d.]+$/.test(pts)) {
          points.push({ list_id: +m[1], list_label: label, season: (label.match(/\d{4}\/\d{2}/) || [])[0] || null,
            discipline: t[i], points: +pts, rank: /^\d+$/.test(rank) ? +rank : null, base_list: t[i + 3] === "*" });
        }
      }
    }
  }
  return points;
}

// Row layout (desktop markup): date, place, place, discipline, NAT, CAT, CAT, category name, DISCIPLINE, position, [fis points], [cup points]
function parseResults(html: string) {
  const results: any[] = [];
  const rRe = /<a class="table-row" href="[^"]*results\.html\?[^"]*raceid=(\d+)"[\s\S]*?<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = rRe.exec(html))) {
    const t = tokens(m[0]);
    const dm = (t[0] || "").match(/(\d{2})-(\d{2})-(\d{4})/); if (!dm) continue;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const nat = t.find((x) => /^[A-Z]{3}$/.test(x) && !POS_RE.test(x)) || null;
    const catIdx = t.findIndex((x) => /^(FIS|NJC|NC|NJR|ENL|EC|WC|CIT|CHI|UNI|NAC|SAC|ANC|FEC|WJC|WSC|OWG|JUN|TRA|YOG|Masters)$/.test(x));
    const cat = catIdx >= 0 ? t[catIdx] : null;
    const catName = catIdx >= 0 ? t.slice(catIdx + 1).find((x) => /[a-z]/.test(x) && !DISC_RE.test(x)) || null : null;

    // The LAST discipline token is the one in the results column; everything after it is
    // position, then FIS points, then cup points — in that order.
    let dIdx = -1;
    for (let i = t.length - 1; i >= 0; i--) if (DISC_RE.test(t[i])) { dIdx = i; break; }
    const disc = dIdx >= 0 ? t[dIdx] : (t.find((x) => DISC_RE.test(x)) || null);
    const tail = dIdx >= 0 ? t.slice(dIdx + 1) : [];
    let pos: string | null = null, fp: number | null = null, cp: number | null = null;
    if (tail.length && POS_RE.test(tail[0])) {
      pos = tail[0];
      // FIS points are decimal in practice; cup points are integers. Prefer a decimal for points.
      if (tail[1] && NUM_RE.test(tail[1])) fp = +tail[1];
      if (tail[2] && NUM_RE.test(tail[2])) cp = +tail[2];
      if (fp !== null && cp === null && Number.isInteger(fp) && /^(WC|EC|NAC|SAC|ANC|FEC)$/.test(cat || "") && !String(tail[1]).includes(".")) {
        // single trailing integer in a cup race is ambiguous; keep as cup points, not FIS points
        cp = fp; fp = null;
      }
    }
    results.push({ fis_race_id: +m[1], race_date: date, place: t[1] || null, discipline: disc, nation: nat, category: cat, category_name: catName, position: pos, fis_points: fp, cup_points: cp });
  }
  return results;
}

async function fetchAthlete(competitorId: string) {
  const base = `https://www.fis-ski.com/DB/general/athlete-biography.html?sectorcode=AL&competitorid=${competitorId}`;
  const [hp, hr] = await Promise.all([
    fetch(base + "&type=fispoints", { headers: UA }).then((r) => r.text()),
    // Uten limit gir FIS bare de 50 siste rennene. Historikken i appen går
    // tilbake til 2023/24, så hele lista hentes.
    fetch(base + "&type=result&limit=1000", { headers: UA }).then((r) => r.text()),
  ]);
  const name = (hp.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/) || [])[1]?.trim() || null;
  const fisCode = (hp.match(/FIS Code[\s\S]{0,200}?(\d{5,7})/) || [])[1] || null;
  const birth = (hp.match(/Birthdate[\s\S]{0,200}?(\d{2})-(\d{2})-(\d{4})/) || []);
  const nation = (hp.match(/country__name-short">([A-Z]{3})/) || [])[1] || null;
  const club = (hp.match(/<h1[^>]*>[\s\S]*?<\/h1>[\s\S]{0,600}?<div[^>]*>\s*([^<]{3,80}?)\s*<\/div>/) || [])[1] || null;
  return { name, fisCode, club, nation, birth_year: birth[3] ? +birth[3] : null, points: parsePoints(hp), results: parseResults(hr) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* empty */ } }
  const fiscode = body.fiscode || u.searchParams.get("fiscode");
  const competitorid = body.competitorid || u.searchParams.get("competitorid");

  let targets: { fiscode?: string; competitorid?: string }[] = [];
  if (fiscode) targets = [{ fiscode: String(fiscode).trim() }];
  else if (competitorid) targets = [{ competitorid: String(competitorid).trim() }];
  else {
    const { data: p } = await supabase.from("profiles").select("fis_code").not("fis_code", "is", null);
    const { data: f } = await supabase.from("follows").select("fis_code");
    const { data: a } = await supabase.from("fis_athletes").select("fis_code, competitor_id");
    const codes = new Set([...(p || []), ...(f || []), ...(a || [])].map((x: any) => x.fis_code).filter(Boolean));
    const byCode = new Map((a || []).map((x) => [x.fis_code, x.competitor_id]));
    targets = [...codes].map((c) => ({ fiscode: c, competitorid: byCode.get(c) || undefined }));
  }

  const log: any[] = [];
  for (const t of targets) {
    try {
      let cid = t.competitorid;
      if (!cid && t.fiscode) {
        const { data: known } = await supabase.from("fis_athletes").select("competitor_id").eq("fis_code", t.fiscode).maybeSingle();
        cid = known?.competitor_id || (await resolveCompetitor(t.fiscode)) || undefined;
      }
      if (!cid) { log.push({ ...t, error: "Fant ikke FIS-profilen" }); continue; }
      const a = await fetchAthlete(cid);
      const code = a.fisCode || t.fiscode;
      if (!code) { log.push({ ...t, error: "no fis code" }); continue; }
      await supabase.from("fis_athletes").upsert({ fis_code: code, competitor_id: cid, name: a.name, club: a.club, nation: a.nation, birth_year: a.birth_year, updated_at: new Date().toISOString() });
      if (a.points.length) await supabase.from("fis_points").upsert(a.points.map((p) => ({ ...p, fis_code: code })), { onConflict: "fis_code,list_id,discipline" });
      if (a.results.length) await supabase.from("fis_results").upsert(a.results.map((r) => ({ ...r, fis_code: code })), { onConflict: "fis_code,fis_race_id" });
      log.push({ fis_code: code, competitor_id: cid, name: a.name, club: a.club, lists: new Set(a.points.map((p) => p.list_id)).size, results: a.results.length });
    } catch (e) { log.push({ ...t, error: String(e).slice(0, 200) }); }
  }
  return json(targets.length === 1 ? log[0] : log);
});
