import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Én vei ut for all e-post fra appen.
//
// Uten eget domene kan ingen e-posttjeneste sende på dine vegne til andre enn
// deg selv: Resend krever verifisert domene, og å sende «fra» en gmail.no-
// adresse gjennom en tredjepart bryter Gmail sin egen autentisering, så det
// havner i søppelpost. Sender vi derimot gjennom Gmail, er avsenderen faktisk
// Gmail, og alt stemmer.
//
// Derfor: Gmail hvis den er satt opp, ellers Resend. Den dagen det finnes et
// domene settes RESEND_API_KEY og GMAIL_* fjernes - ingen kode endres.

const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("REMINDER_FROM") ?? "Ski Competition <no-reply@rennkalender.app>";

// Gmail skriver om avsenderadressen til den kontoen som faktisk logget inn,
// så et REMINDER_FROM som peker et annet sted blir stille overstyrt. Vi tar
// vare på visningsnavnet og bruker kontoens egen adresse.
function gmailFrom() {
  const navn = FROM.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() || "Ski Competition";
  return `${navn} <${GMAIL_USER}>`;
}

export type Sendt = { ok: boolean; via: string; error?: string };

export async function sendMail(
  { to, subject, html }: { to: string[]; subject: string; html: string },
): Promise<Sendt> {
  if (!to.length) return { ok: false, via: "-", error: "ingen mottakere" };

  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });
    try {
      await client.send({ from: gmailFrom(), to, subject, html, content: "auto" });
      return { ok: true, via: "gmail" };
    } catch (e) {
      return { ok: false, via: "gmail", error: String((e as Error)?.message ?? e).slice(0, 300) };
    } finally {
      // Lukkingen kan kaste hvis forbindelsen alt er borte. Da er e-posten
      // likevel sendt, og feilen her skal ikke overskrive det svaret.
      try { await client.close(); } catch { /* ignorert med vilje */ }
    }
  }

  if (RESEND_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (r.ok) return { ok: true, via: "resend" };
    return { ok: false, via: "resend", error: `${r.status}: ${(await r.text()).slice(0, 200)}` };
  }

  return { ok: false, via: "-", error: "ingen e-postkanal satt opp (GMAIL_USER/GMAIL_APP_PASSWORD eller RESEND_API_KEY)" };
}
