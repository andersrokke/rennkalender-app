import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendMail } from "../_shared/mail.ts";

// Inviterer en trener. Kalles av admin_invite_coach() med { id }.
//
// generateLink («invite») oppretter brukeren og gir oss lenken uten å sende
// noe selv. Da slipper vi Supabase sin standardmal, og kan sende en norsk
// velkomst som faktisk forklarer hva treneren skal gjøre etterpå.
//
// role = 'coach' legges i metadataene. handle_new_user() leser dem når raden
// i auth.users opprettes, så profilen er trener fra første sekund - treneren
// slipper å velge rolle selv og kan ikke velge feil.

const APP_URL = Deno.env.get("APP_URL") ?? "https://alpint-rennkalender.netlify.app";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function html(link: string, note: string | null, fra: string | null) {
  const steg = [
    ["Sett et passord", "Lenken under tar deg rett inn. Velg et passord du husker, eller logg inn med Google."],
    ["Gi laget et navn", "Første gang du er inne blir du bedt om det. Navnet ser løperne dine."],
    ["Del lagkoden", "Under «Lag og profil» finner du en kode. Løperne oppgir den når de registrerer seg, og havner rett på laget ditt."],
    ["Planlegg", "Når løperne er inne kan du sette opp treningsdager med bakke, gren og klokkeslett, og følge sesongen deres."],
  ];
  return `<!doctype html><html lang="no"><body style="margin:0;background:#F3F6FA;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F1B2D">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(120deg,#E23B4E,#2F6FE0);padding:22px;color:#fff">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Ski Competition</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px">Du er invitert som trener</div>
    </div>
    <div style="padding:22px">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
        ${fra ? `${esc(fra)} har invitert deg` : "Du er invitert"} til å bruke Ski Competition som trener.
        Her planlegger du sesongen for laget, setter opp treningsdager og ser hvor løperne dine ligger an.
      </p>
      ${note ? `<p style="margin:0 0 16px;padding:12px 14px;background:#EBF1FE;border-radius:10px;font-size:14.5px;line-height:1.5">${esc(note)}</p>` : ""}
      <a href="${link}" style="display:inline-block;background:#0F1B2D;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700;font-size:15px">Kom i gang</a>
      <p style="margin:18px 0 8px;font-size:13px;color:#6B7A8C">Lenken virker én gang, og har kort levetid. Har den gått ut, be om en ny.</p>

      <div style="margin-top:22px;border-top:1px solid #E2E8F0;padding-top:18px">
        <p style="margin:0 0 14px;font-size:15px;font-weight:700">Slik kommer du i gang</p>
        ${steg.map(([t, b], i) => `
        <div style="display:flex;gap:12px;margin-bottom:14px">
          <div style="flex:0 0 26px;height:26px;border-radius:999px;background:#2F6FE0;color:#fff;font-weight:700;font-size:13px;text-align:center;line-height:26px">${i + 1}</div>
          <div><div style="font-weight:650;font-size:14.5px">${t}</div>
          <div style="font-size:14px;color:#4A5B72;line-height:1.5">${b}</div></div>
        </div>`).join("")}
      </div>

      <p style="margin:18px 0 0;font-size:12.5px;color:#6B7A8C;line-height:1.5">
        Var ikke dette ventet, kan du se bort fra e-posten. Da skjer det ingenting.
        <a href="${APP_URL}" style="color:#2F6FE0">${APP_URL.replace(/^https?:\/\//, "")}</a>
      </p>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const reply = (o: unknown, code = 200) =>
    new Response(JSON.stringify(o, null, 1), { status: code, headers: { "content-type": "application/json" } });

  let id: number | undefined;
  try { id = (await req.json())?.id; } catch { /* tom body */ }
  if (!id) return reply({ sent: false, reason: "mangler id" });

  // Invitasjonen tas før den sendes: bare det første kallet får raden, fordi
  // sent_at må være tom. Funksjonen kan kalles av hvem som helst med den
  // offentlige nøkkelen, og uten dette kunne samme invitasjon sendes om og om
  // igjen. En ny utsending går gjennom invitasjonsfunksjonene i basen, som
  // nullstiller sent_at - og de krever administrator eller hovedtrener.
  const { data: inv } = await supabase
    .from("coach_invites")
    .update({ sent_at: new Date().toISOString(), send_error: null })
    .eq("id", id).is("sent_at", null)
    .select("id, email, note, invited_by:profiles!coach_invites_invited_by_fkey(full_name)")
    .maybeSingle();
  if (!inv) return reply({ sent: false, reason: "allerede sendt, eller finnes ikke" });

  // Feiler noe under, skrives grunnen på invitasjonen og den frigis igjen. Da
  // står den i lista med en forklaring i stedet for å se ut som om den gikk fint.
  const giUpp = async (grunn: string) => {
    await supabase.from("coach_invites")
      .update({ send_error: grunn.slice(0, 500), sent_at: null }).eq("id", inv.id);
    return reply({ sent: false, reason: grunn });
  };

  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "invite",
    email: inv.email,
    options: { data: { role: "coach" }, redirectTo: APP_URL },
  });
  if (linkErr || !link?.properties?.action_link) {
    return giUpp(linkErr?.message ?? "fikk ikke laget innloggingslenke");
  }
  const fra = (inv as any).invited_by?.full_name ?? null;
  const r = await sendMail({
    to: [inv.email],
    subject: "Du er invitert som trener i Ski Competition",
    html: html(link.properties.action_link, inv.note, fra),
  });
  if (!r.ok) return giUpp(`${r.via}: ${r.error}`);

  // Adressen står ikke i svaret: det går til den som kalte.
  return reply({ sent: true, id: inv.id });
});
