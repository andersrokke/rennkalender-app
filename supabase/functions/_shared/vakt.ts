// Sperre mot at en jobb settes i gang for ofte. Funksjonene kan kalles av
// alle som har den offentlige nøkkelen; ta_jobb() i basen sier ja bare når
// det har gått lenge nok siden sist.
const json = (b: unknown, status: number, ekstra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...ekstra } });

// Returnerer et svar som skal sendes tilbake hvis jobben ikke får kjøre nå,
// ellers null.
export async function forOfte(supabase: any, navn: string, sekunder: number, hoder: Record<string, string> = {}) {
  const { data, error } = await supabase.rpc("ta_jobb", { p_navn: navn, p_sekunder: sekunder });
  if (error) return json({ feil: "vakten svarte ikke" }, 503, hoder);
  if (data !== true) return json({ kjort: false, merknad: "Kjørt nylig. Prøv igjen senere." }, 429, hoder);
  return null;
}

// Den innloggede brukeren bak kallet, eller null når kallet bare har den
// offentlige nøkkelen.
export async function bruker(supabase: any, req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data?.user ?? null;
}
