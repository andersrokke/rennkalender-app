import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendMail } from "../_shared/mail.ts";

// Varsler administratorene om en ny tilbakemelding. Kalles av en trigger på
// public.feedback, med { id }.
//
// Funksjonen varsler bare. Raden ligger allerede i basen når dette kjører, så
// en feil her mister ingenting - den utsetter bare beskjeden til noen åpner
// feedback-fanen. Derfor svarer vi 200 med en forklaring i stedet for å feile
// hardt: en 500 ville bare fylt loggen med noe ingen kan gjøre noe med.

const APP_URL = Deno.env.get("APP_URL") ?? "https://alpint-rennkalender.netlify.app";

const KIND = { idea: "Forslag", bug: "Feil" } as const;
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function html(f: any, who: string) {
  const accent = f.kind === "bug" ? "#E32347" : "#2F6FE0";
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#6B7A8C;white-space:nowrap">${k}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`;
  return `<!doctype html><html lang="no"><body style="margin:0;background:#F3F6FA;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F1B2D">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
    <div style="background:${accent};padding:18px 22px;color:#fff">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Ski Competition</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px">${KIND[f.kind as keyof typeof KIND] ?? "Tilbakemelding"} fra ${esc(who)}</div>
    </div>
    <div style="padding:22px">
      <p style="margin:0 0 14px;font-size:17px;font-weight:700;line-height:1.35">${esc(f.title)}</p>
      ${f.body ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(f.body)}</p>` : ""}
      <table style="width:100%;font-size:13.5px;border-collapse:collapse;margin:0 0 18px">
        ${f.area ? row("Del av appen", f.area) : ""}
        ${f.user_agent ? row("Nettleser", f.user_agent.slice(0, 120)) : ""}
        ${row("Sak", "#" + f.id)}
      </table>
      <a href="${APP_URL}" style="display:inline-block;background:#0F1B2D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px">Åpne feedback-fanen</a>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const reply = (o: unknown) =>
    new Response(JSON.stringify(o, null, 1), { headers: { "content-type": "application/json" } });

  let id: number | undefined;
  try { id = (await req.json())?.id; } catch { /* tom body */ }
  if (!id) return reply({ sent: false, reason: "mangler id" });

  // Saken tas før varselet sendes: bare det første kallet får raden, fordi
  // notified_at må være tom. Funksjonen kan kalles av hvem som helst med den
  // offentlige nøkkelen, og uten dette kunne samme varsel sendes om og om igjen.
  const { data: f, error } = await supabase
    .from("feedback")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id).is("notified_at", null)
    .select("id, kind, title, body, area, user_agent, author:profiles!feedback_author_id_fkey(full_name)")
    .maybeSingle();
  if (error || !f) return reply({ sent: false, reason: error?.message ?? "allerede varslet, eller finnes ikke" });
  const frigi = () => supabase.from("feedback").update({ notified_at: null }).eq("id", f.id);

  // Mottakerne er de som er merket som administrator. Ingen adresse står i
  // koden, så den endres i basen og ikke i en ny utrulling.
  const { data: admins } = await supabase
    .from("profiles").select("id").eq("is_admin", true);
  const to: string[] = [];
  for (const a of admins ?? []) {
    const { data } = await supabase.auth.admin.getUserById(a.id);
    if (data?.user?.email) to.push(data.user.email);
  }
  if (!to.length) { await frigi(); return reply({ sent: false, reason: "ingen profil er merket is_admin" }); }

  const who = (f as any).author?.full_name ?? "en bruker";
  const r = await sendMail({
    to,
    subject: `${KIND[f.kind as keyof typeof KIND] ?? "Tilbakemelding"}: ${f.title}`,
    html: html(f, who),
  });
  // Gikk det ikke, frigis saken så et nytt forsøk kan varsle.
  if (!r.ok) await frigi();
  // Svaret går til den som kalte, og det kan være hvem som helst. Adressene
  // til administratorene hører ikke hjemme i det.
  return reply({ sent: r.ok, via: r.via, reason: r.error, mottakere: to.length, id: f.id });
});
