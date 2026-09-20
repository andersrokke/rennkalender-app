import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate@0.8.2";

// Imports the latest FIS alpine points list (full list zip: hdr/com/pts files) into fis_list_athletes.

const UA = { "user-agent": "Mozilla/5.0 Rennkalender/1.0 (public FIS data)" };
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
const nameKey = (last: string, first: string) => norm(last) + "|" + norm(first);

function parseDelimited(text: string): { header: string[]; rows: string[][] } {
  const firstLine = text.slice(0, text.indexOf("\n"));
  const delim = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const header = rows.shift()!.map((h) => h.trim().toLowerCase());
  return { header, rows: rows.filter((r) => r.length > 1) };
}
const table = (files: Record<string, Uint8Array>, suffix: string) => {
  const n = Object.keys(files).find((k) => k.toLowerCase().endsWith(suffix));
  return n ? parseDelimited(new TextDecoder("utf-8").decode(files[n])) : null;
};
const num = (v?: string) => (v && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const u = new URL(req.url);
  let file = u.searchParams.get("file");
  if (!file) {
    const page = await (await fetch("https://www.fis-ski.com/DB/alpine-skiing/fis-points-lists.html", { headers: UA })).text();
    const files = [...page.matchAll(/fis-list\/(ALFP(\d+)(\d{2})F\.zip)/g)].map((m) => ({ f: m[1], n: +m[2], y: +m[3] }));
    files.sort((a, b) => b.y - a.y || b.n - a.n);
    if (!files.length) return new Response("no list links found", { status: 500 });
    file = files[0].f;
  }
  const m = file.match(/ALFP(\d+)(\d{2})F/)!;
  const listNo = +m[1], seasonCode = 2000 + +m[2];
  const { data: have } = await supabase.from("fis_lists").select("list_id, list_no, season_code, athletes").order("list_id", { ascending: false }).limit(1);
  if (have?.[0] && have[0].season_code === seasonCode && have[0].list_no === listNo && (have[0].athletes || 0) > 0 && u.searchParams.get("force") !== "1") {
    return new Response(JSON.stringify({ skipped: true, file }), { headers: { "content-type": "application/json" } });
  }
  const zip = new Uint8Array(await (await fetch(`https://www.fis-ski.com/DB/v2/download/fis-list/${file}`, { headers: UA })).arrayBuffer());
  const files = unzipSync(zip);
  const hdr = table(files, "hdr.csv"), com = table(files, "com.csv"), pts = table(files, "pts.csv");
  if (!com || !pts) return new Response(JSON.stringify({ error: "missing files", names: Object.keys(files) }), { status: 500 });

  // header/list info
  let listId = 0, listName = file, published: string | null = null;
  if (hdr) {
    const c = (n: string) => hdr.header.indexOf(n);
    const r = hdr.rows[0];
    listId = num(r[c("listid")]) || 0; listName = r[c("listname")] || file; published = (r[c("listpublished")] || r[c("published")] || "").slice(0, 10) || null;
  }
  if (!listId) listId = seasonCode * 100 + listNo;

  // points by competitorid
  const pc = (n: string) => pts.header.indexOf(n);
  const iPCid = pc("competitorid"), iDisc = pc("disciplinecode"), iPts = pc("fispoints"), iPos = pc("position");
  const pmap = new Map<string, any>();
  for (const r of pts.rows) {
    const cid = r[iPCid]; if (!cid) continue;
    const d = (r[iDisc] || "").toUpperCase();
    const o = pmap.get(cid) || {}; o[d.toLowerCase()] = num(r[iPts]); o[d.toLowerCase() + "_pos"] = num(r[iPos]); pmap.set(cid, o);
  }

  await supabase.from("fis_lists").upsert({ list_id: listId, list_no: listNo, season_code: seasonCode, name: listName, published, athletes: 0 });
  const c = (n: string) => com.header.indexOf(n);
  const iCid = c("competitorid"), iFis = c("fiscode"), iLast = c("lastname"), iFirst = c("firstname"), iNat = c("nationcode"), iGen = c("gender"), iBirth = c("birthdate"), iClub = c("skiclub");
  const batch: any[] = []; let count = 0;
  const flush = async () => { if (!batch.length) return; const { error } = await supabase.from("fis_list_athletes").upsert(batch); if (error) throw new Error(error.message); count += batch.length; batch.length = 0; };
  for (const r of com.rows) {
    const fis = (r[iFis] || "").trim(); if (!fis) continue;
    const p = pmap.get(r[iCid]) || {};
    const by = (r[iBirth] || "").match(/(\d{4})/);
    batch.push({
      fis_code: fis, list_id: listId, competitor_id: r[iCid], last_name: r[iLast], first_name: r[iFirst], nation: r[iNat], gender: (r[iGen] || "").slice(0, 1) || null,
      birth_year: by ? +by[1] : null, club: r[iClub] || null,
      dh: p.dh ?? null, sl: p.sl ?? null, gs: p.gs ?? null, sg: p.sg ?? null, ac: p.ac ?? null,
      dh_pos: p.dh_pos ?? null, sl_pos: p.sl_pos ?? null, gs_pos: p.gs_pos ?? null, sg_pos: p.sg_pos ?? null, ac_pos: p.ac_pos ?? null,
      name_key: nameKey(r[iLast], r[iFirst]),
    });
    if (batch.length >= 1000) await flush();
  }
  await flush();
  await supabase.from("fis_lists").update({ athletes: count, imported_at: new Date().toISOString() }).eq("list_id", listId);
  return new Response(JSON.stringify({ file, listId, listName, published, ptsHeader: pts.header, imported: count, withPoints: pmap.size }), { headers: { "content-type": "application/json" } });
});
