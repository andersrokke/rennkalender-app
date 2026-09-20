import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Sends one reminder per athlete/race, 24h before the iSonen entry deadline,
// when the athlete has the race in their plan but is not entered.
// Runs hourly. ?dry=1 previews without sending.

const FROM = Deno.env.get("REMINDER_FROM") ?? "Rennkalender <no-reply@rennkalender.app>";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://alpint-rennkalender.netlify.app";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("nb-NO", { day: "numeric", month: "long" });
const fmtTime = (d: string) => new Date(d).toLocaleString("nb-NO", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });

function body(g: any) {
  const sure = g.certainty === "missing";
  const lead = sure
    ? `Du har <b>${g.place}</b> i sesongplanen din, men vi finner deg ikke på deltakerlisten i iSonen.`
    : `Du har <b>${g.place}</b> i sesongplanen din. Vi kan ikke se deltakerlisten for dette rennet, så husk å sjekke at du er påmeldt.`;
  return `<!doctype html><html lang="no"><body style="margin:0;background:#F3F6FA;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F1B2D">
  <div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(120deg,#E23B4E,#2F6FE0);padding:18px 22px;color:#fff">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Rennkalender</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px">Påmeldingsfrist i morgen</div>
    </div>
    <div style="padding:22px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.5">${lead}</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse;margin:0 0 18px">
        <tr><td style="padding:6px 0;color:#6B7A8C">Renn</td><td style="padding:6px 0;font-weight:600">${g.place}</td></tr>
        <tr><td style="padding:6px 0;color:#6B7A8C">Dato</td><td style="padding:6px 0;font-weight:600">${fmtDate(g.start_date)}</td></tr>
        <tr><td style="padding:6px 0;color:#6B7A8C">Påmeldingsfrist</td><td style="padding:6px 0;font-weight:600;color:#C2410C">${fmtTime(g.deadline)}</td></tr>
      </table>
      <a href="https://isonen.no" style="display:inline-block;background:#0F1B2D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px">Meld deg på i iSonen</a>
      <p style="margin:18px 0 0;font-size:12.5px;color:#6B7A8C;line-height:1.5">Du får denne e-posten fordi rennet ligger i planen din i Rennkalender. <a href="${APP_URL}" style="color:#2F6FE0">Åpne planen</a></p>
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
    const to = [g.email, ...(g.guardian_emails ?? [])].filter(Boolean);
    const subject = `Påmeldingsfrist i morgen: ${g.place}`;
    if (dry || !RESEND_KEY) { log.push({ ...g, to, subject, sent: false, reason: dry ? "dry run" : "no RESEND_API_KEY" }); continue; }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html: body(g) }),
    });
    const ok = r.ok;
    if (ok) await supabase.from("entry_reminders").insert({ athlete_id: g.athlete_id, race_id: g.race_id, certainty: g.certainty, sent_to: to.join(", ") });
    log.push({ athlete: g.athlete_name, race: g.place, to, certainty: g.certainty, sent: ok, status: r.status });
  }
  return new Response(JSON.stringify({ found: gaps?.length ?? 0, log }, null, 1), { headers: { "content-type": "application/json" } });
});
