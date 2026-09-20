import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Collects aggregated signup counts from iSonen's public GraphQL API for Norwegian alpine races,
// and (for start-order prediction) matches each entry to the FIS points list by name + club.
// Names are used for matching only and are never stored.

const ISONEN = "https://isonen.no/api/graphql";
async function gql(operationName: string, query: string, variables: unknown) {
  const r = await fetch(ISONEN, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Rennkalender/1.0 (aggregated counts only)" }, body: JSON.stringify({ operationName, query, variables }) });
  const j = await r.json();
  if (j.errors && !j.data) throw new Error(JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}
const SEARCH = `query findEvents($where: PublicEventSearchWhereInput!, $pagination: PaginationInput!){ publicEventSearch(where:$where, pagination:$pagination){ publicEventsCount publicEvents{ id title locationName scheduleStartDateTime scheduleEndDateTime scheduleSignUpEndDateTime status competitionType{name} } } }`;
const EVENT = `query getPublicEvent($where: PublicEventWhereUniqueInput!){ publicEvent(where:$where){ id title status maxAttendees scheduleSignUpEndDateTime showAttendeeList participants{count} teams{count} } }`;
const PARTS = `query getPublicEventParticipants($where: PublicEventWhereUniqueInput!){ publicEvent(where:$where){ participants{ count data{ firstName lastName club activities{ status activity{ className exerciseName } } } } } }`;

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const nameKey = (last: string, first: string) => norm(last) + "|" + norm(first);
const DISC: Record<string, string> = { slalam: "SL", slalom: "SL", storslalam: "GS", storslalom: "GS", giant: "GS", super: "SG", superg: "SG", utfor: "DH", downhill: "DH" };
const discOf = (ex: string) => { const k = norm(ex).replace(/ /g, ""); for (const [w, d] of Object.entries(DISC)) if (k.includes(w)) return d; return null; };
const ALIAS: Record<string, string[]> = { "Oslo Indoor Skiing Arena": ["sno", "lorenskog"], "Gaustablikk-Rjukan": ["gaustablikk", "rjukan", "gausta"], "Varingskollen, Hakadal": ["varingskollen", "hakadal"], "Jølster": ["jolster"], "Ål": ["al", "aal", "al skisenter"] };
function matches(place: string, ev: { title: string; locationName: string }) {
  const hay = " " + norm(ev.title + " " + ev.locationName) + " ";
  return (ALIAS[place] || [place]).some((k) => hay.includes(" " + norm(k) + " "));
}

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const force = url.searchParams.get("relink") === "1";
  const { data: races, error } = await supabase.from("races").select("id, place, start_date, end_date, isonen_id").eq("host_nation", "NOR").order("start_date");
  if (error) return new Response(error.message, { status: 500 });
  const log: string[] = []; let linked = 0, counted = 0, entries = 0, matched = 0;
  const batch = new Date().toISOString();

  for (const r of races!) {
    try {
      if (!r.isonen_id || force) {
        if (r.place === "TBD") continue;
        const from = new Date(r.start_date + "T00:00:00Z").getTime() - 2 * 864e5, to = new Date(r.end_date + "T00:00:00Z").getTime() + 2 * 864e5;
        const d = await gql("findEvents", SEARCH, { where: { sfName: "Norges Skiforbund", sport: "Alpint", startDate: String(from), endDate: String(to) }, pagination: { take: 30, skip: 0 } });
        const hit = (d.publicEventSearch.publicEvents as any[]).find((e) => matches(r.place, e));
        if (!hit) { log.push(`no match ${r.place} ${r.start_date}`); continue; }
        await supabase.from("races").update({ isonen_id: hit.id, isonen_title: hit.title, signup_deadline: hit.scheduleSignUpEndDateTime }).eq("id", r.id);
        r.isonen_id = hit.id; linked++; log.push(`linked ${r.place} ${r.start_date} -> ${hit.title}`);
      }
      const d = await gql("getPublicEvent", EVENT, { where: { id: r.isonen_id } });
      const ev = d.publicEvent; if (!ev) { log.push(`gone ${r.place}`); continue; }
      await supabase.from("race_signups").insert({ race_id: r.id, participants: ev.participants.count, teams: ev.teams?.count ?? 0 });
      await supabase.from("races").update({ max_attendees: ev.maxAttendees, signup_deadline: ev.scheduleSignUpEndDateTime }).eq("id", r.id);
      counted++;

      // Entries for start-order prediction (only when the organiser has made the list public)
      if (ev.showAttendeeList && ev.participants.count > 0) {
        const pd = await gql("getPublicEventParticipants", PARTS, { where: { id: r.isonen_id } });
        const parts = (pd?.publicEvent?.participants?.data || []) as any[];
        const rows: any[] = [];
        for (const p of parts) {
          const discs = new Set<string>();
          for (const a of p.activities || []) { if (a.status && a.status !== "ACTIVE") continue; const dc = discOf(a.activity?.exerciseName || ""); if (dc) discs.add(dc); }
          if (!discs.size) continue;
          const key = nameKey(p.lastName, p.firstName);
          let { data: cands } = await supabase.from("fis_list_athletes").select("fis_code, club, nation, sl, gs, sg, dh").eq("name_key", key);
          if (!cands?.length) {
            const { data: c2 } = await supabase.from("fis_list_athletes").select("fis_code, club, nation, sl, gs, sg, dh, name_key").like("name_key", norm(p.lastName) + "|" + norm(p.firstName).split(" ")[0] + "%");
            cands = c2 || [];
          }
          let best = null as any;
          if (cands?.length === 1) best = cands[0];
          else if (cands && cands.length > 1) {
            const pc = norm(p.club);
            best = cands.find((c) => pc && norm(c.club || "").includes(pc.split(" ")[0])) || cands.find((c) => c.nation === "NOR") || null;
          }
          for (const dc of discs) {
            rows.push({ race_id: r.id, discipline: dc, class_name: (p.activities.find((a: any) => discOf(a.activity?.exerciseName || "") === dc)?.activity?.className) || null, club: p.club || null,
              fis_code: best?.fis_code || null, points: best ? best[dc.toLowerCase()] ?? null : null, batch });
            if (best) matched++;
          }
        }
        if (rows.length) { const { error: e2 } = await supabase.from("race_entries").insert(rows); if (e2) throw e2; entries += rows.length; }
      }
    } catch (e) { log.push(`error ${r.place}: ${String(e).slice(0, 160)}`); }
  }
  return new Response(JSON.stringify({ linked, counted, entries, matched, log }, null, 1), { headers: { "content-type": "application/json" } });
});
