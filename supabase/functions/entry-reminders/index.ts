import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendMail } from "../_shared/mail.ts";

// Sends up to two reminders per athlete/race: within seven days of the entry
// deadline, and again within 24 hours, when the race is in the athlete's plan
// but the athlete is not on the entry list. Guardians get their own wording.
// Runs hourly. ?dry=1 previews without sending.

const APP_URL = Deno.env.get("APP_URL") ?? "https://alpint-rennkalender.netlify.app";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("nb-NO", { day: "numeric", month: "long" });
const fmtTime = (d: string) => new Date(d).toLocaleString("nb-NO", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });

// Én e-post, to stemmer: til løperen («du») og til de foresatte («Lukas»).
// kind er 'd7' (opptil en uke før fristen) eller 'd1' (under et døgn før).
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function dagerTil(d: string) { return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 864e5)); }
function overskrift(g: any) {
  if (g.kind === "d1") return "Påmeldingsfrist i morgen";
  const n = dagerTil(g.deadline);
  return n <= 1 ? "Påmeldingsfrist i morgen" : `Påmeldingsfrist om ${n} dager`;
}
function body(g: any, tilForesatt: boolean) {
  const sure = g.certainty === "missing";
  const navn = esc(g.athlete_name || "Barnet ditt");
  const sted = esc(g.place);
  const lead = tilForesatt
    ? (sure
      ? `${navn} har <b>${sted}</b> i sesongplanen, men står ikke på deltakerlisten i iSonen.`
      : `${navn} har <b>${sted}</b> i sesongplanen. Vi kan ikke se deltakerlisten for dette rennet, så sjekk at påmeldingen er gjort.`)
    : (sure
      ? `Du har <b>${sted}</b> i sesongplanen din, men vi finner deg ikke på deltakerlisten i iSonen.`
      : `Du har <b>${sted}</b> i sesongplanen din. Vi kan ikke se deltakerlisten for dette rennet, så husk å sjekke at du er påmeldt.`);
  const fot = tilForesatt
    ? `Du får denne e-posten fordi du er koblet til ${navn} som foresatt i Ski Competition. Varslene slår du av under «Påmelding» i appen.`
    : `Du får denne e-posten fordi rennet ligger i planen din i Ski Competition.`;
  return `<!doctype html><html lang="no"><body style="margin:0;background:#F3F6FA;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F1B2D">
  <div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(120deg,#E23B4E,#2F6FE0);padding:18px 22px;color:#fff">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Ski Competition</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px">${overskrift(g)}</div>
    </div>
    <div style="padding:22px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.5">${lead}</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse;margin:0 0 18px">
        <tr><td style="padding:6px 0;color:#6B7A8C">Renn</td><td style="padding:6px 0;font-weight:600">${sted}</td></tr>
        <tr><td style="padding:6px 0;color:#6B7A8C">Dato</td><td style="padding:6px 0;font-weight:600">${fmtDate(g.start_date)}</td></tr>
        <tr><td style="padding:6px 0;color:#6B7A8C">Påmeldingsfrist</td><td style="padding:6px 0;font-weight:600;color:#C2410C">${fmtTime(g.deadline)}</td></tr>
      </table>
      <a href="https://isonen.no" style="display:inline-block;background:#0F1B2D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px">Åpne iSonen</a>
      <p style="margin:18px 0 0;font-size:12.5px;color:#6B7A8C;line-height:1.5">${fot} <a href="${APP_URL}" style="color:#2F6FE0">Åpne appen</a></p>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const { data: gaps, error } = await supabase.rpc("entry_gaps");
  if (error) return new Response(error.message, { status: 500 });
  const log: any[] = [];

  for (const g of gaps ?? []) {
    const kind = g.kind === "d7" ? "d7" : "d1";
    const foresatte: string[] = (g.guardian_emails ?? []).filter(Boolean);
    const subject = `${overskrift(g)}: ${g.place}`;
    const subjectForesatt = `${overskrift(g)} for ${g.athlete_name || "barnet ditt"}: ${g.place}`;
    if (dry) { log.push({ athlete: g.athlete_name, race: g.place, kind, to: g.email, foresatte, subject, sent: false, reason: "dry run" }); continue; }
    // Løperen og de foresatte får hver sin e-post, med hver sin tekst.
    const r1 = g.email ? await sendMail({ to: [g.email], subject, html: body(g, false) }) : { ok: false, error: "mangler adresse" } as any;
    const r2 = foresatte.length ? await sendMail({ to: foresatte, subject: subjectForesatt, html: body(g, true) }) : null;
    // Varselet regnes som sendt når minst én mottaker fikk det; ellers prøves det igjen neste time.
    if (r1.ok || r2?.ok) {
      const til = [r1.ok ? g.email : null, ...(r2?.ok ? foresatte : [])].filter(Boolean).join(", ");
      await supabase.from("entry_reminders").insert({ athlete_id: g.athlete_id, race_id: g.race_id, certainty: g.certainty, sent_to: til, kind });
    }
    log.push({ athlete: g.athlete_name, race: g.place, kind, certainty: g.certainty, loper: r1.ok, foresatte: r2 ? r2.ok : null, reason: r1.error || r2?.error });
  }
  return new Response(JSON.stringify({ found: gaps?.length ?? 0, log }, null, 1), { headers: { "content-type": "application/json" } });
});
