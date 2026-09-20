# Drift av Rennkalender

Alt bakenfor appen — database, edge-funksjoner og cron — ligger i `supabase/` i
dette repoet. Produksjonsprosjektet er `hggzbixirdaamvkjvgul` (eu-west-1).

Grunnregelen er at **produksjon aldri endres for hånd**. Skjemaendringer blir
migrasjonsfiler, funksjonsendringer blir filer under `supabase/functions/`, og
begge deler går ut via `supabase db push` og `supabase functions deploy`.

---

## Innhold

- [Kom i gang](#kom-i-gang)
- [Skjemaendringer](#skjemaendringer)
- [Edge-funksjoner](#edge-funksjoner)
- [Cron-jobbene](#cron-jobbene)
- [Hemmeligheter](#hemmeligheter)
- [Datakildene](#datakildene)
- [Når en kilde endrer format](#når-en-kilde-endrer-format)
- [Testbrukere](#testbrukere)

---

## Kom i gang

Du trenger Docker (eller OrbStack) og Supabase CLI.

```bash
npm install
npx supabase login
npx supabase link --project-ref hggzbixirdaamvkjvgul
npx supabase start
npx supabase db reset
```

`db reset` bygger databasen fra bunnen av `supabase/migrations/` og kjører
`supabase/seed.sql`, som legger inn testbrukerne. Resultatet skal være det
samme skjemaet som i produksjon.

Sjekk at det stemmer:

```bash
npx supabase db diff --linked --schema public
```

Tom utskrift betyr at lokalt og produksjon er like.

### Migrasjonshistorikken

Produksjonsdatabasen har 19 migrasjoner registrert i
`supabase_migrations.schema_migrations` som aldri fantes som filer. De er
squashet til én baseline:

| Fil | Innhold |
| --- | --- |
| `20260906144029_baseline_remote_schema.sql` | Hele skjemaet slik det så ut 2026-09-20 |
| `20260920095646_cron_jobs_via_vault.sql` | Cron-jobbene, med nøkkelen flyttet til Vault |

Baseline har med vilje samme versjonsnummer som den første av de 19. Produksjon
har allerede den versjonen registrert, så `db push` hopper over den i stedet for
å prøve å kjøre hele skjemaet på nytt.

De 18 andre versjonene ligger fortsatt igjen i produksjonens historikk uten
tilhørende fil. Det er harmløst — `db push` bryr seg bare om lokale filer som
mangler i produksjon — men `supabase migration list` vil vise dem som
uparede. Vil du rydde det bort, kjør `supabase migration squash --linked`.

---

## Skjemaendringer

Aldri i SQL-editoren i produksjon. Slik gjør du det i stedet:

```bash
# 1. Endre lokalt - i Studio på localhost:54323, eller med SQL mot lokal db
npx supabase db diff -f beskrivende_navn

# 2. Les gjennom fila som dukket opp i supabase/migrations/
# 3. Test at den bygger rent fra bunnen
npx supabase db reset

# 4. Commit, og send til produksjon
npx supabase db push
```

`db diff` sammenligner den lokale databasen mot migrasjonene og skriver
forskjellen til en ny fil. Det er denne fila som er sannheten, ikke det du
klikket deg fram til i Studio.

Tre ting `db diff` er kjent for å ikke ta med. Skriv dem inn for hånd:

- **Rettigheter (`grant` / `revoke`)** — særlig `revoke ... from anon` på nye
  funksjoner. Uten det får anonyme brukere `execute` fra Supabase sine default
  privileges.
- **`security_invoker` på views** — uten den kjører viewet med eierens
  rettigheter, og RLS på tabellene under blir omgått. Begge views i dette
  prosjektet har den på.
- **Cron-jobber og Vault-hemmeligheter** — ligger utenfor `public`.

Etter en endring i `public`, kjør en kontroll:

```bash
npx supabase db diff --linked --schema public   # skal være tom
```

og se over sikkerhetsvarslene i Supabase-dashbordet (Advisors) — de fanger opp
tabeller uten RLS og views uten `security_invoker`.

---

## Edge-funksjoner

Fem funksjoner, alle med `verify_jwt = true`. De kjører som `service_role`
gjennom `SUPABASE_SERVICE_ROLE_KEY`, og går derfor forbi RLS.

| Funksjon | Kalles av | Gjør |
| --- | --- | --- |
| `fis-list-import` | cron 04:45 | Laster ned FIS sin punktliste (zip) og fyller `fis_list_athletes` |
| `isonen-signups` | cron 05:00 | Teller påmeldte i iSonen, kobler renn til arrangement, henter deltakerlister |
| `fis-cup-standings` | cron 05:15 | Henter cupstillinger (EC, ANC, NAC, FEC, SAC, WC) |
| `fis-athlete` | cron 05:30 + appen | Henter FIS-profil, poenghistorikk og resultater per løper |
| `entry-reminders` | cron :05 hver time | Sender e-post om påmeldingsfrist som går ut om under et døgn |

Deploy:

```bash
npx supabase functions deploy fis-athlete
npx supabase functions deploy            # alle
```

Kjør en funksjon manuelt uten å vente på cron:

```bash
curl -X POST "https://hggzbixirdaamvkjvgul.supabase.co/functions/v1/entry-reminders?dry=1" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

`entry-reminders` har `?dry=1`, som viser hvem som ville fått e-post uten å
sende noe. `fis-cup-standings` har `?preview=1` med samme idé.
`fis-list-import` hopper over jobben hvis den nyeste lista allerede er
importert — tving med `?force=1`.

### Slettet: `fis-debug`

Fantes i produksjon fram til 2026-09-20 og er fjernet. Den hentet en vilkårlig
URL oppgitt av kalleren (`?url=...`) og returnerte innholdet — altså en vei inn
i Supabase sitt nettverk for alle som hadde anon-nøkkelen. Den skal ikke
gjenopprettes. Trenger du å se på HTML-en fra FIS, gjør det lokalt med `curl`.

---

## Cron-jobbene

Definert i `supabase/migrations/20260920095646_cron_jobs_via_vault.sql`. Alle
tider er **UTC** (norsk tid er +1 om vinteren, +2 om sommeren).

| Jobb | UTC | Funksjon | Timeout |
| --- | --- | --- | --- |
| `fis-list-import-daily` | 04:45 | `fis-list-import` | 170 s |
| `isonen-signups-daily` | 05:00 | `isonen-signups` | 120 s |
| `fis-cup-standings-daily` | 05:15 | `fis-cup-standings` (`season: 2027`) | 170 s |
| `fis-athlete-daily` | 05:30 | `fis-athlete` | 120 s |
| `entry-reminders-hourly` | :05 hver time | `entry-reminders` | 60 s |

Rekkefølgen på morgenen er ikke tilfeldig: punktlista importeres først, fordi
både `isonen-signups` og `fis-cup-standings` slår opp i `fis_list_athletes` for
å koble navn og `competitor_id` til en FIS-kode.

Alle går gjennom `public.invoke_edge_function(slug, body, timeout_ms)`, som
henter prosjekt-URL og nøkkel fra Vault. Funksjonen kan poste til hvilken som
helst edge-funksjon med en gyldig nøkkel, så `execute` er trukket tilbake fra
alle andre enn `postgres`, som cron kjører som.

Sesongen i `fis-cup-standings` er hardkodet til `2027` i jobbdefinisjonen. Den
må endres manuelt ved sesongskifte — lag en ny migrasjon som kjører
`cron.schedule` på nytt med samme jobbnavn.

### Se hva som har skjedd

```sql
select jobname, schedule, active from cron.job order by jobname;

select j.jobname, r.status, r.start_time, r.return_message
from cron.job_run_details r join cron.job j using (jobid)
order by r.start_time desc limit 20;

-- Svaret fra edge-funksjonen (pg_net logger det separat)
select id, status_code, left(content, 400) as content, created
from net._http_response order by created desc limit 20;
```

En jobb som ser vellykket ut i `cron.job_run_details` betyr bare at HTTP-kallet
ble sendt. Om importen faktisk gikk bra ser du i `net._http_response`, eller på
`imported_at` og `athletes` i `fis_lists`.

### Skru av en jobb midlertidig

```sql
update cron.job set active = false where jobname = 'isonen-signups-daily';
```

Husk at neste `db push` ikke rører `active` — `cron.schedule` setter bare
tidspunkt og kommando.

---

## Hemmeligheter

To steder, med hver sin hensikt.

### Supabase-secrets (edge-funksjonene)

Settes i dashbordet under **Edge Functions → Secrets**, eller med CLI:

```bash
npx supabase secrets set RESEND_API_KEY=re_... REMINDER_FROM='Rennkalender <no-reply@rennkalender.app>' APP_URL=https://alpint-rennkalender.netlify.app
npx supabase secrets list
```

| Navn | Brukes av | Hvis den mangler |
| --- | --- | --- |
| `RESEND_API_KEY` | `entry-reminders` | **Ingen e-post blir sendt.** Funksjonen kjører, logger hvem som skulle fått påminnelse, og markerer dem som ikke sendt. Ingen feilmelding — det ser ut som om alt går bra. |
| `REMINDER_FROM` | `entry-reminders` | Faller tilbake på `Rennkalender <no-reply@rennkalender.app>`. Domenet må være verifisert hos Resend, ellers avviser de sendingen. |
| `APP_URL` | `entry-reminders` | Faller tilbake på `https://alpint-rennkalender.netlify.app`. Brukes i «Åpne planen»-lenka nederst i e-posten. |

`SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY` settes av plattformen selv og
skal ikke legges inn manuelt.

Den stille feilen er verdt å merke seg: mangler `RESEND_API_KEY`, går
`entry-reminders` rundt hver time uten å sende noe og uten å klage. Sjekk med
`?dry=1` — svaret sier `"reason": "no RESEND_API_KEY"` når nøkkelen mangler.

### Vault (cron-jobbene)

Cron kjører inne i databasen og når ikke Supabase-secrets. Nøkkelen ligger
derfor i Vault:

| Navn | Innhold |
| --- | --- |
| `project_url` | `https://hggzbixirdaamvkjvgul.supabase.co` |
| `cron_anon_key` | Anon-nøkkelen jobbene autentiserer med |

Settes opp én gang med `scripts/bootstrap-cron-secrets.sql`. Skriptet plukker
nøkkelen ut av de gamle jobbdefinisjonene, så den aldri må skrives inn for
hånd. Kjør det **før** cron-migrasjonen, ellers skrives den gamle definisjonen
over og nøkkelen er borte.

Bytte nøkkel senere:

```sql
select vault.update_secret(id, '<ny anon key>') from vault.secrets where name = 'cron_anon_key';
```

Jobbene plukker den opp ved neste kjøring. Ingen migrasjon nødvendig.

---

## Datakildene

Fire kilder, ingen av dem med en avtale i bunnen. Alle kan endre seg uten
varsel.

### 1. FIS punktlister (zip)

`https://www.fis-ski.com/DB/alpine-skiing/fis-points-lists.html` →
`https://www.fis-ski.com/DB/v2/download/fis-list/ALFP<nr><år>F.zip`

Zip-fila inneholder tre semikolon- eller tabdelte filer: `*hdr.csv` (om lista),
`*com.csv` (løperne) og `*pts.csv` (poengene, én rad per disiplin).
`fis-list-import` finner lenkene med et regex på HTML-en, velger den nyeste,
og kobler `com` og `pts` på `competitorid`.

Lagres i `fis_lists` og `fis_list_athletes`. Dette er grunnlaget for alt annet:
`name_key` (etternavn + fornavn, normalisert) er nøkkelen både `isonen-signups`
og `fis-cup-standings` bruker for å finne igjen en løper.

### 2. FIS profilsider (HTML)

`https://www.fis-ski.com/DB/general/athlete-biography.html?competitorid=...`
med `&type=fispoints` og `&type=result`.

`fis-athlete` skraper HTML-en med regex mot `<a class="table-row">` og tolker
tekstinnholdet mellom taggene som kolonner. Finner den ikke `competitorid`,
slår den først opp i `biographies.html?fiscode=...`.

Lagres i `fis_athletes`, `fis_points` og `fis_results`.

Dette er den skjøreste av de fire. Kolonnerekkefølgen er antatt, ikke lest fra
en header, og koden gjetter seg fram til hva som er FIS-poeng og hva som er
cup-poeng ut fra om tallet har desimaler.

### 3. FIS cupstillinger (HTML)

`https://www.fis-ski.com/DB/alpine-skiing/cup-standings.html?cupcode=...&seasoncode=...`

Én side gir sammenlagt og alle disipliner. `fis-cup-standings` leser rader som
`[navn, NAT, "Overall", "ALL", plass, poeng, "Slalom", "SL", plass, poeng, ...]`
og kobler `competitorid` til FIS-kode via `fis_list_athletes`.

Lagres i `fis_cup_standings`. Funksjonen sletter og skriver inn på nytt per
kombinasjon av cup, sesong og kjønn.

### 4. iSonen GraphQL

`https://isonen.no/api/graphql`, tre operasjoner: `findEvents`,
`getPublicEvent` og `getPublicEventParticipants`.

Dette er et udokumentert, offentlig endepunkt. `isonen-signups` søker opp
arrangementer på sted og dato, kobler dem til `races.isonen_id`, og teller
påmeldte. Er deltakerlista gjort offentlig av arrangøren, hentes den også og
kobles mot FIS-punktlista for startrekkefølge.

Lagres i `race_signups` (antall over tid), `race_entries` (deltakere per
disiplin) og `races.isonen_id` / `signup_deadline` / `max_attendees`.

Navnene på deltakerne brukes bare til å koble mot FIS-lista, og lagres ikke.
Stedsnavn matches med en aliastabell i funksjonen (`ALIAS`) — `Oslo Indoor
Skiing Arena` heter «SNØ Lørenskog» hos iSonen, og den slags.

---

## Når en kilde endrer format

Ingen av de fire kildene er stabile API-er, og ingen av dem varsler før de
endrer seg. Fellestrekket er at **funksjonene feiler stille**: de skraper det
de finner, finner ingenting, og skriver null rader uten å kaste feil. Cron
rapporterer suksess. Appen viser gammel data.

Derfor er det nedenfor som er den faktiske overvåkingen.

### Se at det går galt

```sql
-- FIS-punktlista: importert i natt, med rader?
select list_id, name, published, athletes, imported_at from fis_lists order by list_id desc limit 3;

-- iSonen: telles det fortsatt påmeldte?
select max(counted_at) as siste, count(*) as rader_siste_døgn
from race_signups where counted_at > now() - interval '1 day';

-- Cupstillinger: friske?
select cup, season, gender, count(*), max(fetched_at) from fis_cup_standings group by 1,2,3 order by 1,2,3;

-- FIS-profiler: oppdatert?
select fis_code, name, updated_at from fis_athletes order by updated_at desc limit 10;
```

Rader som ikke har flyttet seg siden i går morges er signalet. Et tomt resultat
fra en jobb som rapporterer suksess betyr nesten alltid at kilden har endret
seg.

### Feilsøking per kilde

**FIS punktliste (`fis-list-import`).** Svaret fra funksjonen inneholder
`ptsHeader`. Endrer FIS kolonnenavn i `pts.csv`, står `imported` fortsatt
riktig, men alle poengene blir `null`. Kjør `?force=1` og se på `ptsHeader` i
svaret — kolonnene koden leter etter er `competitorid`, `disciplinecode`,
`fispoints` og `position`. Endres selve filnavnmønsteret (`ALFP<nr><år>F.zip`),
finner regexet ingen lenker og funksjonen svarer `no list links found`.

**FIS profilsider (`fis-athlete`).** Endrer FIS på markupen, slutter
`<a class="table-row">` å matche og både `points` og `results` blir tomme
lister. Kall funksjonen direkte med en kjent løper og se på svaret:

```bash
curl -X POST "https://hggzbixirdaamvkjvgul.supabase.co/functions/v1/fis-athlete" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "content-type: application/json" \
  -d '{"fiscode":"423032"}'
```

`lists: 0, results: 0` for en løper som åpenbart har resultater betyr at
parseren må skrives om. Sammenlign med HTML-en du får av `curl` mot
profilsiden. Legg merke til at kolonnetolkningen bygger på at den *siste*
disiplin-tokenen i rada er resultatkolonnen — flyttes kolonnene, er det den
antagelsen som ryker først.

**FIS cupstillinger (`fis-cup-standings`).** Bruk `?preview=1`, som returnerer
de seks første radene den finner uten å skrive noe:

```bash
curl "https://hggzbixirdaamvkjvgul.supabase.co/functions/v1/fis-cup-standings?cup=EC&season=2027&gender=M&preview=1" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Tomt `sample` med en `url` som gir treff i nettleseren betyr at radmønsteret er
endret.

**iSonen (`isonen-signups`).** Endrer de GraphQL-skjemaet, kaster `gql()` med
feilmeldingen fra serveren, og den havner i `log`-arrayet i svaret. Kjør
funksjonen manuelt og les loggen. `no match <sted> <dato>` for mange renn på
rad betyr som regel at arrangementsnavnene har endret seg — utvid `ALIAS` i
`supabase/functions/isonen-signups/index.ts`. Er `publicEventSearch` borte helt,
må spørringene skrives om mot det nye skjemaet.

### Når du har fikset det

Rett i fila under `supabase/functions/`, deploy, og kjør jobben manuelt før du
lar cron ta over igjen:

```bash
npx supabase functions deploy isonen-signups
curl -X POST "https://hggzbixirdaamvkjvgul.supabase.co/functions/v1/isonen-signups" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Merk at `isonen-signups` legger inn en ny rad i `race_signups` hver gang den
kjøres. Kjører du den ti ganger mens du feilsøker, får grafen over påmeldte ti
punkter fra samme minutt. Det er stygt, men harmløst — `race_signup_latest`
plukker bare den nyeste.

---

## Testbrukere

Fem brukere på `@test.rennkalender`, alle med passordet `Testpassord1!` og
`profiles.is_test = true`.

| E-post | Navn | Rolle |
| --- | --- | --- |
| `trener@test.rennkalender` | Test Trener | trener, eier laget «Testlaget» |
| `lukas@test.rennkalender` | Lukas Testløper | løper i Testlaget, FIS 423032 |
| `storm@test.rennkalender` | Storm Testløper | løper i Testlaget, FIS 423033 |
| `forelder@test.rennkalender` | Test Forelder | forelder, koblet til Lukas |
| `svensk@test.rennkalender` | Svensk Åkare | løper uten lag (solo) |

**Gjenopprette** — `supabase/seed.sql`. Kjøres automatisk av
`supabase db reset` lokalt. Mot produksjon: lim inn fila i SQL-editoren.
Den er idempotent, så brukere som allerede finnes blir stående med rennene
sine.

**Slette** — `scripts/drop-test-users.sql`. Kjør denne før ekte brukere
slippes inn. Den tar bare brukere som både ligger på testdomenet og har
`is_test = true`, og stopper hvis et testlag har fått medlemmer utenfra.

---

## Ting som er verdt å vite

**`team_season`-viewet brukes ikke.** Verken `src/` eller den bygde `dist/`
refererer til det. Det ligger i baseline fordi produksjon har det. Vil du bli
kvitt det, lag en migrasjon med `drop view public.team_season;` — men sjekk
først at ingen annen klient bruker det.

**Alle funksjoner er `security definer`.** De går forbi RLS med vilje, og
begrenser i stedet seg selv med `auth.uid()` og `is_coach_of()` / 
`is_guardian_of()` inni kroppen. Legger du til en ny funksjon, må du gjøre det
samme — og huske `revoke execute ... from anon`.

**`entry_gaps()` og `handle_new_user()` er ikke tilgjengelige for
`authenticated`.** Den første fordi den returnerer e-postadresser til løpere og
foreldre og bare skal kalles av `entry-reminders`. Den andre fordi den er en
trigger.

**`race_entries` vokser.** `isonen-signups` skriver en ny `batch` hver gang
deltakerlista hentes, og ingenting sletter de gamle. Spørringene tar bare
siste batch, så det virker som det skal, men tabellen blir stadig større.
Rydding er ikke satt opp.
