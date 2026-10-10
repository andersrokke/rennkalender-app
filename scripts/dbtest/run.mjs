// Kjører alle migrasjonene fra bunnen mot en innebygd Postgres 17, og tester
// RLS, rettigheter og funksjonene slik hver rolle faktisk bruker dem.
//
//   npm run test:db
//
// Krever ikke Docker. embedded-postgres og pg hentes med --no-save første
// gang; de er 100 MB og hører ikke hjemme i package.json for en Netlify-bygging.
//
// Det dette fanger som smoke-testen i nettleseren ikke kan: rettighetsfeil.
// «permission denied for function ny_lagkode» gikk rett forbi nettleseren,
// fordi den mocker nettverket. Her kjøres alt mot en ekte database.
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { hentBruk } from './frontend-bruk.mjs'

const HER = dirname(fileURLToPath(import.meta.url))
const REPO = join(HER, '..', '..')
const MIG = `${REPO}/supabase/migrations`
const PORT = 54999

// pg_cron/pg_net/vault/pg_stat_statements finnes ikke i en naken Postgres.
// Shimmen lager objektene, så create extension-linjene tas bort.
const strip = sql => sql.replace(
  /create extension if not exists ["']?(pg_cron|pg_net|pg_stat_statements|supabase_vault|uuid-ossp)["']?[^;]*;/gi,
  '-- (utelatt i lokal validering)')

// Rydd etter forrige løp uansett hvordan det endte. Døde det midt i, kjørte
// aldri pgdb.stop(), og initdb nekter å bruke en mappe som ikke er tom.
rmSync(join(HER, '.data'), { recursive: true, force: true })
const pgdb = new EmbeddedPostgres({ databaseDir: join(HER, '.data'), user: 'postgres', password: 'x', port: PORT, persistent: false })
await pgdb.initialise(); await pgdb.start()
const c = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'x', database: 'postgres' })
await c.connect()

const fail = m => { console.error('FEIL  ' + m); process.exitCode = 1 }
// Et kast utenfor try/catch skal aldri avslutte løpet stille med «feil: 0».
process.on('unhandledRejection', e => {
  console.error('FEIL  uventet, løpet stoppet: ' + (e?.message || e))
  process.exit(1)
})
const ok = m => console.log('OK    ' + m)

await c.query(readFileSync(join(HER, 'shim.sql'), 'utf8'))
ok('shim lagt inn')

for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort()) {
  try { await c.query(strip(readFileSync(`${MIG}/${f}`, 'utf8'))); ok(f) }
  catch (e) { fail(`${f}: ${e.message}`); 
await pgdb.stop(); process.exit(1) }
}

// --- skjemaet ---
const q = async (sql, p) => (await c.query(sql, p)).rows
const cols = await q(`select column_name from information_schema.columns
  where table_schema='public' and table_name='feedback' order by 1`)
const want = ['admin_note','area','author_id','body','created_at','id','kind','notified_at','status','title','updated_at','user_agent']
const got = cols.map(r => r.column_name)
JSON.stringify(got) === JSON.stringify(want) ? ok(`feedback har ${got.length} kolonner`)
  : fail(`kolonner: ${JSON.stringify(got)}`)

const pol = (await q(`select policyname from pg_policies where tablename='feedback'`)).map(r => r.policyname).sort()
pol.length === 5 ? ok(`5 RLS-regler: ${pol.join(', ')}`) : fail(`RLS-regler: ${pol.join(', ')}`)

const fk = await q(`select conname from pg_constraint where conrelid='public.feedback'::regclass and contype='f'`)
fk.some(r => r.conname === 'feedback_author_id_fkey')
  ? ok('fremmednøkkelen heter feedback_author_id_fkey (brukes i select-en i appen)')
  : fail(`fremmednøkkel: ${fk.map(r => r.conname).join(', ')}`)

const rls = await q(`select relrowsecurity from pg_class where oid='public.feedback'::regclass`)
rls[0].relrowsecurity ? ok('RLS er på') : fail('RLS er AV')

const anonPriv = await q(`select privilege_type from information_schema.role_table_grants
  where table_name='feedback' and grantee='anon'`)
anonPriv.length === 0 ? ok('anon har ingen rettigheter på feedback') : fail(`anon har ${anonPriv.length}`)

// --- oppførsel ---
const [A, B, ADM] = ['11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']
for (const [id, mail, name] of [[A, 'a@test.rennkalender', 'Løper A'],
  [B, 'b@test.rennkalender', 'Løper B'], [ADM, 'anders.rokke@gmail.com', 'Anders']]) {
  // Profilen lages av handle_new_user()-triggeren, akkurat som i produksjon.
  await c.query(`insert into auth.users(id,email,raw_user_meta_data)
    values ($1,$2,jsonb_build_object('full_name',$3::text))`, [id, mail, name])
}
// Migrasjonen kjørte før brukerne fantes, så admin settes slik den ville blitt satt.
await c.query(`update public.profiles p set is_admin=true from auth.users u
  where u.id=p.id and lower(u.email)='anders.rokke@gmail.com'`)

const as = async (uid, sql, p) => {
  await c.query('begin')
  await c.query(`set local role authenticated`)
  await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [uid])
  try { const r = await c.query(sql, p); await c.query('commit'); return r }
  catch (e) { await c.query('rollback'); throw e }
}

await as(A, `insert into public.feedback(author_id,kind,area,title,body)
  values ($1,'idea','training','Vis værmelding på rennstedet','Hadde spart meg for et nettsted til')`, [A])
ok('løper A fikk sendt inn et forslag')

try {
  await as(A, `insert into public.feedback(author_id,kind,title,status,admin_note)
    values ($1,'bug','Juks','done','ferdig')`, [A])
  fail('en løper fikk sette status og administratornotat selv')
} catch { ok('en løper kan ikke sette status eller notat selv') }

try {
  await as(B, `insert into public.feedback(author_id,kind,title) values ($1,'bug','I annens navn')`, [A])
  fail('løper B fikk sende inn i A sitt navn')
} catch { ok('ingen kan sende inn i andres navn') }

const bSees = await as(B, 'select id from public.feedback')
bSees.rows.length === 0 ? ok('løper B ser ikke A sine saker') : fail(`B ser ${bSees.rows.length}`)
const aSees = await as(A, 'select id from public.feedback')
aSees.rows.length === 1 ? ok('løper A ser sin egen sak') : fail(`A ser ${aSees.rows.length}`)
const admSees = await as(ADM, 'select id,title from public.feedback')
admSees.rows.length === 1 ? ok('administrator ser alle saker') : fail(`admin ser ${admSees.rows.length}`)

const id = admSees.rows[0].id
try {
  await as(B, `update public.feedback set status='declined' where id=$1`, [id])
  const r = await as(ADM, 'select status from public.feedback where id=$1', [id])
  r.rows[0].status === 'new' ? ok('en løper får ikke endret status (raden ble ikke truffet)')
    : fail('en løper endret status')
} catch { ok('en løper får ikke endret status') }

await as(ADM, `update public.feedback set status='planned', admin_note='God idé, tas i neste runde' where id=$1`, [id])
const after = await as(ADM, 'select status,admin_note,updated_at>created_at as rort from public.feedback where id=$1', [id])
after.rows[0].status === 'planned' && after.rows[0].rort
  ? ok('administrator satte status og notat, og updated_at ble oppdatert')
  : fail(`triage: ${JSON.stringify(after.rows[0])}`)
const seen = await as(A, 'select admin_note from public.feedback where id=$1', [id])
seen.rows[0]?.admin_note ? ok('innsenderen ser svaret') : fail('innsenderen ser ikke svaret')

try { await as(A, `insert into public.feedback(author_id,kind,title) values ($1,'idea','ab')`, [A])
  fail('for kort tittel ble godtatt') } catch { ok('for kort tittel avvises') }
try { await as(A, `insert into public.feedback(author_id,kind,title) values ($1,'sludder','En tittel')`, [A])
  fail('ugyldig type ble godtatt') } catch { ok('ugyldig type avvises') }


// --- administratorsiden ---
const noAction = await q(`select c.conrelid::regclass::text t, a.attname
  from pg_constraint c join unnest(c.conkey) k(attnum) on true
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
  where c.contype='f' and c.confrelid='public.profiles'::regclass and c.confdeltype='a'`)
noAction.length === 0 ? ok('ingen fremmednøkkel mot profiles står lenger på no action')
  : fail(`står fortsatt på no action: ${noAction.map(r => r.t + '.' + r.attname).join(', ')}`)

try { await as(B, 'select public.admin_overview()'); fail('en vanlig bruker fikk lese oversikten') }
catch (e) { e.message.includes('Bare administrator') ? ok('en vanlig bruker avvises av admin_overview')
  : fail(`feil melding: ${e.message}`) }
for (const fn of ['admin_users()', 'admin_teams()', 'admin_activity()', 'admin_ops()', 'admin_invites()']) {
  try { await as(B, `select * from public.${fn}`); fail(`en vanlig bruker nådde ${fn}`) }
  catch (e) { if (!e.message.includes('Bare administrator')) fail(`${fn}: ${e.message}`) }
}
ok('alle oversiktsfunksjonene avviser vanlige brukere')

const ov = (await as(ADM, 'select public.admin_overview() as o')).rows[0].o
ov.brukere === 3 && ov.admins === 1 ? ok(`oversikten teller riktig (${ov.brukere} brukere, ${ov.admins} admin)`)
  : fail(`oversikt: ${JSON.stringify(ov)}`)

const us = await as(ADM, 'select * from public.admin_users()')
us.rows.length === 3 && us.rows.every(r => r.email)
  ? ok('admin_users gir e-post for alle tre') : fail(`admin_users: ${us.rows.length}`)

const ops = (await as(ADM, 'select public.admin_ops() as o')).rows[0].o
Array.isArray(ops.jobber) ? ok('admin_ops svarer selv uten pg_cron (tom jobbliste)')
  : fail(`admin_ops: ${JSON.stringify(ops)}`)

await as(ADM, `select public.admin_set_role($1,'coach')`, [B])
// Leses som superbruker: RLS på profiles slipper ikke engang en
// administrator til andres rader direkte, og det er hele grunnen til at
// admin_users() finnes.
const rb = await q('select role::text r from profiles where id=$1', [B])
rb[0].r === 'coach' ? ok('administrator forfremmet en løper til trener') : fail('rolle ble ikke satt')
try { await as(ADM, `select public.admin_set_role($1,'keiser')`, [B]); fail('ugyldig rolle godtatt') }
catch { ok('ugyldig rolle avvises') }
try { await as(B, `select public.admin_set_role($1,'athlete')`, [A]); fail('en trener endret roller') }
catch { ok('en trener kan ikke endre roller') }

try { await as(ADM, 'select public.admin_set_admin($1,false)', [ADM]); fail('siste administrator ble fjernet') }
catch (e) { e.message.includes('siste administrator') ? ok('den siste administratoren kan ikke fjerne seg selv')
  : fail(e.message) }
try { await as(ADM, 'select public.admin_delete_user($1)', [ADM]); fail('administrator slettet seg selv') }
catch { ok('administrator kan ikke slette seg selv') }

const inv = await as(ADM, `select public.admin_invite_coach('ny.trener@example.com','Velkommen') as id`)
inv.rows[0].id ? ok('invitasjon lagret selv om varselet ikke kom fram (ingen vault lokalt)')
  : fail('invitasjon ble ikke lagret')
// En bruker som har logget inn er i aktiv bruk og skal avvises.
await c.query(`update auth.users set last_sign_in_at = now() where id = $1`, [A])
try { await as(ADM, `select public.admin_invite_coach('a@test.rennkalender')`); fail('inviterte en aktiv bruker') }
catch (e) { e.message.includes('allerede i bruk') ? ok('adresse i aktiv bruk avvises') : fail(e.message) }
// En som er invitert, men aldri har logget inn, skal kunne inviteres på nytt.
await c.query(`insert into auth.users(id,email) values (gen_random_uuid(),'aldri.inne@example.com')`)
const again = await as(ADM, `select public.admin_invite_coach('aldri.inne@example.com') as id`)
again.rows[0].id ? ok('invitasjon kan sendes på nytt til en som aldri logget inn')
  : fail('fikk ikke sendt invitasjonen på nytt')
// Send på nytt: beholder notatet, nekter for en som har logget inn, og for andre enn administrator.
{
  await c.query(`update coach_invites set sent_at = now() - interval '2 days' where email = 'ny.trener@example.com'`)
  const r = await as(ADM, `select public.admin_resend_invite(' NY.trener@example.com') as id`)
  const etter = await c.query(`select note, sent_at from coach_invites where email = 'ny.trener@example.com'`)
  r.rows[0].id === inv.rows[0].id && etter.rows[0].note === 'Velkommen' && etter.rows[0].sent_at === null
    ? ok('invitasjon sendes på nytt med notatet i behold') : fail('send på nytt endret invitasjonen feil')
  await c.query(`update coach_invites set sent_at = now() where email = 'ny.trener@example.com'`)
  try { await as(ADM, `select public.admin_resend_invite('ny.trener@example.com')`); fail('sendte på nytt med en gang') }
  catch (e) { e.message.includes('nettopp') ? ok('send på nytt har ett minutts sperre') : fail(e.message) }
  await c.query(`update coach_invites set sent_at = null where email = 'ny.trener@example.com'`)
  try { await as(ADM, `select public.admin_resend_invite('a@test.rennkalender')`); fail('sendte på nytt til en som er inne') }
  catch (e) { e.message.includes('allerede logget inn') ? ok('send på nytt avvises for en som har logget inn') : fail(e.message) }
  try { await as(A, `select public.admin_resend_invite('ny.trener@example.com')`); fail('løper sendte invitasjon på nytt') }
  catch { ok('bare administrator kan sende invitasjon på nytt') }
}
try { await as(ADM, `select public.admin_invite_coach('ikke en adresse')`); fail('ugyldig adresse godtatt') }
catch { ok('ugyldig e-postadresse avvises') }
const inv2 = await as(ADM, `select public.admin_invite_coach('NY.Trener@Example.com ') as id`)
inv2.rows[0].id === inv.rows[0].id ? ok('samme adresse i annen skrivemåte oppdaterer invitasjonen, lager ikke en ny')
  : fail('fikk to invitasjoner for samme adresse')

// Sletting: løper A har en økt, og B står som created_by på den.
await as(A, `insert into training_sessions(athlete_id,date,discipline,created_by)
  values ($1,current_date,'GS',$2)`, [A, B])
await as(ADM, 'select public.admin_delete_user($1)', [B])
const left = await q('select count(*)::int n from auth.users')
const sess = await q('select created_by from training_sessions')
left[0].n === 3 && sess[0].created_by === null
  ? ok('brukeren ble slettet, og created_by på økta ble satt til null i stedet for å blokkere')
  : fail(`etter sletting: ${left[0].n} brukere, created_by=${sess[0].created_by}`)


// --- grupper og innsyn ---
const [H, C1, C2] = ['aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003']
for (const [id, mail, navn] of [[H, 'hoved@ntg.no', 'Hovedtrener'],
  [C1, 'oscar@ntg.no', 'Oscar'], [C2, 'kari@ntg.no', 'Kari']]) {
  await c.query(`insert into auth.users(id,email,raw_user_meta_data)
    values ($1,$2,jsonb_build_object('full_name',$3::text,'role','coach'))`, [id, mail, navn])
}
const lag = async (navn, eier, forelder) => (await c.query(
  `insert into teams(name,owner_id,parent_team_id) values ($1,$2,$3) returning id`,
  [navn, eier, forelder ?? null])).rows[0].id
const P = await lag('NTG Lillehammer', H, null)
const G1 = await lag('Oscar sin gruppe', C1, P)
const G2 = await lag('Kari sin gruppe', C2, P)
await c.query(`update profiles set team_id=$2 where id=$1`, [C1, G1])
await c.query(`update profiles set team_id=$2 where id=$1`, [C2, G2])

try { await c.query(`insert into teams(name,owner_id,parent_team_id) values ('Dypt',$1,$2)`, [C1, G1])
  fail('fikk lage en gruppe under en gruppe') }
catch (e) { e.message.includes('bare ett nivå') ? ok('to nivåer avvises') : fail(e.message) }
try { await c.query(`update teams set parent_team_id = id where id = $1`, [G1])
  fail('et lag fikk ligge under seg selv') }
catch { ok('et lag kan ikke ligge under seg selv') }
try { await c.query(`update teams set parent_team_id = $2 where id = $1`, [P, G1])
  fail('et lag med grupper under seg fikk en forelder') }
catch { ok('et lag med grupper under seg kan ikke selv flyttes ned') }

const ser = async (uid, t) => (await as(uid, 'select public.is_coach_of($1) as v', [t])).rows[0].v
await ser(H, G1) && await ser(H, G2) ? ok('hovedtreneren ser begge gruppene')
  : fail('hovedtreneren ser ikke gruppene')
await ser(C1, G1) ? ok('Oscar ser sin egen gruppe') : fail('Oscar ser ikke sin egen')
!(await ser(C1, G2)) ? ok('Oscar ser ikke Kari sin gruppe') : fail('Oscar ser Kari sin gruppe')

await as(H, 'select public.head_set_access($1,$2,true)', [C1, G2])
await ser(C1, G2) ? ok('hovedtreneren ga Oscar innsyn i Kari sin gruppe')
  : fail('innsynet virket ikke')
await as(H, 'select public.head_set_access($1,$2,false)', [C1, G2])
!(await ser(C1, G2)) ? ok('innsynet kan trekkes tilbake') : fail('innsynet ble hengende')

try { await as(C1, 'select public.head_set_access($1,$2,true)', [C2, G1])
  fail('en vanlig trener fikk gi innsyn') }
catch (e) { e.message.includes('Bare hovedtrener') ? ok('en vanlig trener kan ikke gi innsyn') : fail(e.message) }
try { await as(H, 'select public.head_set_access($1,$2,true)', [ADM, G1])
  fail('ga innsyn til en som ikke hører til laget') }
catch (e) { e.message.includes('hører ikke til') ? ok('utenforstående kan ikke få innsyn') : fail(e.message) }

const hov = (await as(H, 'select public.head_overview() as o')).rows[0].o
hov?.grupper?.length === 2 && hov.trenere?.length === 2
  ? ok(`hovedtrenerens bilde viser ${hov.grupper.length} grupper og ${hov.trenere.length} trenere`)
  : fail(`head_overview: ${JSON.stringify(hov)}`)
;(await as(C1, 'select public.head_overview() as o')).rows[0].o === null
  ? ok('en vanlig trener har ikke noe hovedtrenerbilde') : fail('Oscar fikk hovedtrenerbildet')

// Invitasjon som peker på laget: gruppa skal havne under med én gang.
await as(ADM, `select public.admin_invite_coach('ny@ntg.no', null, $1)`, [P])
const NY = 'aaaaaaaa-0000-0000-0000-000000000009'
await c.query(`insert into auth.users(id,email,raw_user_meta_data)
  values ($1,'ny@ntg.no',jsonb_build_object('full_name','Ny Trener','role','coach'))`, [NY])
const nyLag = (await as(NY, `select public.create_coach_team('Ny sin gruppe') as id`)).rows[0].id
const forelder = await q('select parent_team_id from teams where id=$1', [nyLag])
forelder[0].parent_team_id === P
  ? ok('en invitert trener sin gruppe havner under laget automatisk')
  : fail(`forelder ble ${forelder[0].parent_team_id}`)
// En ferdig gruppe uten eier tas over når treneren gir laget samme navn.
const U14 = (await q(`insert into teams(name, owner_id, parent_team_id) values ('U14', null, $1) returning id`, [P]))[0].id
const NY2 = 'aaaaaaaa-0000-0000-0000-000000000010'
await as(ADM, `select public.admin_invite_coach('ny2@ntg.no', null, $1)`, [P])
await c.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'ny2@ntg.no',jsonb_build_object('full_name','Ny To','role','coach'))`, [NY2])
const tatt = (await as(NY2, `select public.create_coach_team(' u14 ') as id`)).rows[0].id
tatt === U14 && (await q('select owner_id from teams where id=$1', [U14]))[0].owner_id === NY2
  ? ok('en invitert trener tar over den ferdige gruppa med samme navn') : fail(`fikk ${tatt}, ventet ${U14}`)
;(await q(`select count(*)::int n from teams where parent_team_id=$1 and lower(name)='u14'`, [P]))[0].n === 1 ? ok('det ble ikke to U14') : fail('to grupper med samme navn')


// --- grupper i huset: se alle, flytt flere, døp og slett ---
{
  const TL = 'eeeeeeee-0000-0000-0000-000000000099'
  await c.query(`insert into auth.users(id,email) values ($1,'tl99@hus.test')`, [TL])
  await q(`insert into profiles(id, full_name, role, team_id) values ($1,'Test Husløper','athlete',null) on conflict (id) do update set role='athlete'`, [TL])
  await q(`update profiles set team_id=$2 where id=$1`, [TL, G1])
  const alle = (await as(H, 'select * from public.hus_lopere()')).rows
  const gr = (await as(H, 'select * from public.hus_grupper()')).rows
  gr.some(g => g.er_hus) && gr.length >= 3 ? ok('hovedtreneren ser huset og alle gruppene i det') : fail(`hus_grupper: ${gr.length}`)
  alle.length > 0 ? ok(`hovedtreneren ser alle løperne i huset (${alle.length})`) : fail('hus_lopere tomt')
  const iG1 = alle.filter(a => a.team_id === G1).map(a => a.id)
  const fra = alle.find(a => a.team_id === G1)
  if (fra) {
    const n = (await as(H, 'select public.flytt_lopere($1,$2) as n', [[fra.id], G2])).rows[0].n
    n === 1 && (await q('select team_id t from profiles where id=$1', [fra.id]))[0].t === G2 ? ok('hovedtreneren flytter en løper til en annen gruppe') : fail('flytt_lopere virket ikke')
    await as(H, 'select public.flytt_lopere($1,$2)', [[fra.id], G1])
  }
  try { await as(A, 'select public.flytt_lopere($1,$2)', [iG1, G2]); fail('en løper flyttet løpere') } catch { ok('bare trenere i huset flytter løpere') }
  const ny = (await as(H, `select public.opprett_gruppe('Midlertidig') as id`)).rows[0].id
  await as(H, 'select public.bytt_gruppe($1)', [P])
  await as(H, `select public.gi_gruppenavn($1, 'VG1')`, [ny])
  ;(await q('select name from teams where id=$1', [ny]))[0].name === 'VG1' ? ok('gruppa får nytt navn') : fail('nytt navn ble ikke lagret')
  try { await as(C1, `select public.gi_gruppenavn($1, 'Kapret')`, [ny]); fail('en annen trener døpte gruppa') } catch { ok('bare eier eller hovedtrener gir nytt navn') }
  await as(H, 'select public.slett_gruppe($1)', [ny])
  ;(await q('select count(*)::int n from teams where id=$1', [ny]))[0].n === 0 ? ok('tom gruppe slettes') : fail('gruppa ble ikke slettet')
  try { await as(H, 'select public.slett_gruppe($1)', [G1]); fail('slettet gruppe med løpere') } catch { ok('en gruppe med løpere slettes ikke') }
  await q('delete from profiles where id=$1', [TL]); await c.query('delete from auth.users where id=$1', [TL])
}

// --- hovedtreneren inviterer selv ---
const iv = await as(H, `select public.head_invite_coach('trener4@ntg.no','Velkommen') as id`)
iv.rows[0].id ? ok('hovedtreneren fikk invitert en trener selv') : fail('invitasjon feilet')
const iRad = await q(`select parent_team_id, invited_by from coach_invites where email='trener4@ntg.no'`)
iRad[0].parent_team_id === P && iRad[0].invited_by === H
  ? ok('invitasjonen peker på hovedtrenerens eget lag')
  : fail(`invitasjon: ${JSON.stringify(iRad[0])}`)

try { await as(C1, `select public.head_invite_coach('enda.en@ntg.no')`)
  fail('en gruppetrener fikk invitere videre') }
catch (e) { e.message.includes('eie et lag') ? ok('en gruppetrener kan ikke invitere videre') : fail(e.message) }

// Taket: ti ubrukte invitasjoner om gangen.
for (let i = 0; i < 9; i++) await as(H, `select public.head_invite_coach($1)`, [`tak${i}@ntg.no`])
try { await as(H, `select public.head_invite_coach('for.mange@ntg.no')`)
  fail('taket på ti ble ikke håndhevet') }
catch (e) { e.message.includes('ti invitasjoner') ? ok('taket på ti ubrukte invitasjoner holder') : fail(e.message) }

const mine = await as(H, 'select count(*)::int n from public.head_invites()')
mine.rows[0].n === 10 ? ok('hovedtreneren ser sine ti invitasjoner') : fail(`ser ${mine.rows[0].n}`)
const andres = await as(C1, 'select count(*)::int n from public.head_invites()')
andres.rows[0].n === 0 ? ok('en gruppetrener ser ingen invitasjoner') : fail(`ser ${andres.rows[0].n}`)


// --- én bryter for «alle ser alt» ---
!(await ser(C1, G2)) ? ok('utgangspunktet: Oscar ser ikke Kari sin gruppe') : fail('Oscar ser den alt')
await as(H, 'select public.head_set_open(true)')
await ser(C1, G2) && await ser(C2, G1)
  ? ok('med bryteren på ser begge trenerne hverandres grupper')
  : fail('bryteren ga ikke innsyn')
// Regelen skal også gjelde en som kommer til etterpå.
const SEN = 'aaaaaaaa-0000-0000-0000-00000000000a'
await c.query(`insert into auth.users(id,email,raw_user_meta_data)
  values ($1,'sen@ntg.no',jsonb_build_object('full_name','Sen Trener','role','coach'))`, [SEN])
const GSEN = await lag('Sen sin gruppe', SEN, P)
await ser(SEN, G1) ? ok('en trener som kommer til etterpå er dekket av regelen')
  : fail('den nye treneren fikk ikke innsyn')
!(await ser(ADM, G1)) ? ok('bryteren gjelder bare trenere i huset')
  : fail('en utenforstående fikk innsyn')
await as(H, 'select public.head_set_open(false)')
!(await ser(C1, G2)) && !(await ser(SEN, G1))
  ? ok('bryteren av fjerner innsynet igjen') : fail('innsynet ble hengende')
const hov2 = (await as(H, 'select public.head_overview() as o')).rows[0].o
hov2.lag.alle_ser_alt === false ? ok('hovedtrenerbildet vet at bryteren er av')
  : fail('bryterens tilstand mangler i bildet')
try { await as(C1, 'select public.head_set_open(true)'); fail('en gruppetrener fikk skru på bryteren') }
catch (e) { e.message.includes('Bare hovedtrener') ? ok('en gruppetrener kan ikke skru på bryteren') : fail(e.message) }


// --- lesbar lagkode, ny kode, og fjerning ---
const koder = await q('select invite_code from teams')
const gyldig = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
koder.every(k => gyldig.test(k.invite_code))
  ? ok(`alle ${koder.length} lagkoder er seks lesbare tegn (f.eks. ${koder[0].invite_code})`)
  : fail(`koder: ${koder.map(k => k.invite_code).join(', ')}`)
new Set(koder.map(k => k.invite_code)).size === koder.length
  ? ok('ingen lag deler kode') : fail('to lag har samme kode')

// Ny konto som skal bli med i Oscar sin gruppe.
const L1 = 'bbbbbbbb-0000-0000-0000-000000000001'
await c.query(`insert into auth.users(id,email,raw_user_meta_data)
  values ($1,'lop1@test.no',jsonb_build_object('full_name','Løper Én'))`, [L1])
const g1kode = (await q('select invite_code k from teams where id=$1', [G1]))[0].k

// Skrevet med små bokstaver, slik folk faktisk taster den.
await as(L1, 'select public.join_team($1)', [g1kode.toLowerCase()])
const etterJoin = await q('select team_id from profiles where id=$1', [L1])
etterJoin[0].team_id === G1 ? ok('koden virker skrevet med små bokstaver')
  : fail('join_team godtok ikke små bokstaver')

// Ny kode gjør den gamle ugyldig.
const nyKode = (await as(C1, 'select public.ny_invitasjonskode($1) as k', [G1])).rows[0].k
gyldig.test(nyKode) && nyKode !== g1kode ? ok('treneren fikk en ny, lesbar kode')
  : fail(`ny kode: ${nyKode}`)
const L2 = 'bbbbbbbb-0000-0000-0000-000000000002'
await c.query(`insert into auth.users(id,email,raw_user_meta_data)
  values ($1,'lop2@test.no',jsonb_build_object('full_name','Løper To'))`, [L2])
;(await as(L2, 'select public.join_team($1) as t', [g1kode])).rows[0].t === null
  ? ok('den gamle koden er ugyldig etter bytte') : fail('den gamle koden virket fortsatt')
await as(L2, 'select public.join_team($1)', [nyKode])
ok('den nye koden virker')

try { await as(L2, 'select public.ny_invitasjonskode($1)', [G1]); fail('en løper fikk lage ny kode') }
catch (e) { e.message.includes('Bare treneren') ? ok('en løper kan ikke lage ny kode') : fail(e.message) }

// Fjerning.
await as(C1, `insert into athlete_races(athlete_id,race_id,team_id,status)
  select $1, id, $2, 'planned' from races limit 1`, [L1, G1]).catch(() => {})
await as(C1, 'select public.fjern_fra_lag($1)', [L1])
const etterFjern = await q('select team_id from profiles where id=$1', [L1])
etterFjern[0].team_id === null ? ok('treneren fjernet løperen fra gruppa')
  : fail('løperen ble stående')
try { await as(C2, 'select public.fjern_fra_lag($1)', [L2]); fail('en annen trener fikk fjerne fra fremmed gruppe') }
catch (e) { e.message.includes('Bare treneren') ? ok('en trener kan ikke fjerne fra en gruppe hun ikke har') : fail(e.message) }
try { await as(C1, 'select public.fjern_fra_lag($1)', [C1]); fail('treneren fjernet seg selv') }
catch { ok('treneren kan ikke fjerne seg selv') }


// --- innendørs ---
const innendors = await q(`select count(*)::int n from slopes where indoor`)
const kolonne = await q(`select count(*)::int n from information_schema.columns
  where table_schema='public' and table_name='slopes' and column_name='indoor'`)
kolonne[0].n === 1 ? ok('slopes har en indoor-kolonne') : fail('indoor-kolonnen mangler')
await c.query(`insert into slopes(resort,name,source,indoor) values ('SNØ Lørenskog','Racing','user',true)
  on conflict (resort,name) do update set indoor = true`)
const hall = await q(`select id from slopes where resort='SNØ Lørenskog' limit 1`)
await as(A, `insert into training_sessions(athlete_id,date,discipline,weather,slope_id)
  values ($1,current_date,'GS','indoor',$2)`, [A, hall[0].id])
ok('«innendørs» godtas som vær')
try { await as(A, `insert into training_sessions(athlete_id,date,discipline,weather)
    values ($1,current_date,'GS','tornado')`, [A])
  fail('ugyldig vær ble godtatt') }
catch { ok('ugyldig vær avvises fortsatt') }


// --- en vanlig bruker må kunne opprette et lag ---
const NYT = 'cccccccc-0000-0000-0000-000000000001'
await c.query(`insert into auth.users(id,email,raw_user_meta_data)
  values ($1,'fersk@test.no',jsonb_build_object('full_name','Fersk Trener','role','coach'))`, [NYT])
// Rett innsetting i lagtabellen er stengt: lag opprettes gjennom funksjonene,
// som kontrollerer hvem man er. Ellers kunne hvem som helst lage en gruppe
// under et lag de ikke hører til.
try {
  await as(NYT, `insert into teams(name,owner_id) values ('Rett inn',$1)`, [NYT])
  fail('en innlogget bruker satte inn et lag direkte')
} catch { ok('lag kan ikke settes inn direkte i tabellen') }
const viaFn = await as(NYT, `select public.create_coach_team('Via funksjon','Testklubben') as id`)
const nyRad = await q('select name, club from teams where id=$1', [viaFn.rows[0].id])
nyRad[0].club === 'Testklubben' ? ok('create_coach_team tar imot klubb') : fail('klubb ble ikke satt')
const nyeKoder = await q(`select invite_code from teams where name in ('Via funksjon')`)
nyeKoder.length === 1 && nyeKoder.every(k => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(k.invite_code))
  ? ok('det nye laget fikk en lesbar kode') : fail(`koder: ${JSON.stringify(nyeKoder)}`)



// --- grupper for alle trenere i huset ---
// Kari (C1) eier G1 under P. Hun oppretter en gruppe til: den skal havne
// under P, eies av henne, og hun skal stå i den etterpå.
const u16 = (await as(C1, `select public.opprett_gruppe('Teknikk U16') as id`)).rows[0].id
const u16rad = await q('select parent_team_id, owner_id from teams where id=$1', [u16])
const c1na = await q('select team_id from profiles where id=$1', [C1])
u16rad[0].parent_team_id === P && u16rad[0].owner_id === C1 && c1na[0].team_id === G1
  ? ok('en gruppetrener opprettet en gruppe til under huset, og blir stående der hun sto') : fail(`opprett_gruppe: ${JSON.stringify([u16rad[0], c1na[0]])}`)
try { await as(C1, `select public.opprett_gruppe('teknikk u16')`); fail('to grupper med samme navn') } catch { ok('to grupper i huset kan ikke hete det samme') }
await as(C1, 'select public.bytt_gruppe($1)', [G1])
;(await q('select team_id from profiles where id=$1', [C1]))[0].team_id === G1
  ? ok('treneren byttet tilbake til sin første gruppe') : fail('bytt_gruppe virket ikke')
try { await as(C1, 'select public.bytt_gruppe($1)', [G2]); fail('byttet til en gruppe hun ikke er trener for') }
catch (e) { e.message.includes('ikke trener') ? ok('kan ikke bytte til en gruppe man ikke er trener for') : fail(e.message) }
const hOpp = (await as(H, `select public.opprett_gruppe('Oscars gruppe') as id`)).rows[0].id
;(await q('select parent_team_id from teams where id=$1', [hOpp]))[0].parent_team_id === P
  ? ok('hovedtreneren opprettet en gruppe til seg selv under huset') : fail('hovedtrenerens gruppe havnet feil')
await as(H, 'select public.bytt_gruppe($1)', [P])
try { await as(ADM, `select public.opprett_gruppe('Snik')`); fail('en utenforstående opprettet gruppe i huset') }
catch (e) { ok('en som ikke står i huset kan ikke opprette grupper der') }
try { await as(L2, `select public.opprett_gruppe('Løpergruppe')`); fail('en løper opprettet gruppe') }
catch { ok('en løper kan ikke opprette grupper') }

const mineGr = (await as(H, 'select * from public.mine_grupper()')).rows
mineGr[0]?.er_hus && mineGr.length >= 4 ? ok(`mine_grupper gir huset først og ${mineGr.length} lag for hovedtreneren`)
  : fail(`mine_grupper: ${JSON.stringify(mineGr.map(m => m.name))}`)

// Flytting: L2 står i G1. Hovedtreneren flytter henne til G2.
await as(H, `insert into athlete_races(athlete_id,race_id,team_id,status)
  select $1, id, $2, 'planned' from races limit 1`, [L2, G1]).catch(() => {})
await as(H, 'select public.flytt_loper($1,$2)', [L2, G2])
const l2 = await q('select team_id from profiles where id=$1', [L2])
const gamle = await q('select count(*)::int n from athlete_races where athlete_id=$1 and team_id=$2', [L2, G1])
l2[0].team_id === G2 && gamle[0].n === 0 ? ok('løperen ble flyttet, og den gamle gruppas planer for henne er borte')
  : fail(`flytt: team=${l2[0].team_id}, gamle planer=${gamle[0].n}`)
try { await as(C1, 'select public.flytt_loper($1,$2)', [L2, G1]); fail('Kari flyttet en løper ut av en gruppe hun ikke har') }
catch (e) { e.message.includes('ikke trener') ? ok('kan ikke flytte en løper fra en gruppe man ikke er trener for') : fail(e.message) }

// Overdragelse: H gir G1 til C2.
await as(H, 'select public.sett_gruppetrener($1,$2)', [G1, C2])
;(await q('select owner_id from teams where id=$1', [G1]))[0].owner_id === C2
  ? ok('hovedtreneren ga en gruppe til en annen trener') : fail('overdragelsen skjedde ikke')
await as(H, 'select public.sett_gruppetrener($1,$2)', [G1, C1])
try { await as(C1, 'select public.sett_gruppetrener($1,$2)', [G2, C1]); fail('en gruppetrener tok en gruppe') }
catch (e) { e.message.includes('Bare hovedtrener') ? ok('bare hovedtreneren kan gi bort grupper') : fail(e.message) }
try { await as(H, 'select public.sett_gruppetrener($1,$2)', [P, C1]); fail('huset ble gitt bort') }
catch (e) { e.message.includes('Huset selv') ? ok('huset selv kan ikke gis bort') : fail(e.message) }

// Vernet: direkte oppdatering som authenticated.
try { await as(L2, 'update profiles set is_admin = true where id = $1', [L2]); fail('en løper gjorde seg selv til administrator') }
catch (e) { e.message.includes('is_admin') ? ok('is_admin kan ikke settes direkte - hullet er tettet') : fail(e.message) }
try { await as(L2, 'update profiles set team_id = $2 where id = $1', [L2, G1]); fail('en løper hoppet inn i et lag uten kode') }
catch (e) { e.message.includes('byttes gjennom') ? ok('team_id kan ikke settes direkte') : fail(e.message) }
await as(L2, 'update profiles set team_id = null where id = $1', [L2])
ok('å gå ut av laget (team_id = null) er fortsatt lov direkte')
await as(L2, 'update profiles set full_name = $2 where id = $1', [L2, 'Løper To'])
ok('andre felt kan fortsatt oppdateres direkte')
const g2kode = (await q('select invite_code k from teams where id=$1', [G2]))[0].k
await as(L2, 'select public.join_team($1)', [g2kode])
;(await q('select team_id from profiles where id=$1', [L2]))[0].team_id === G2
  ? ok('join_team går gjennom vernet (security definer)') : fail('join_team ble stoppet av vernet')
const NYC = 'cccccccc-0000-0000-0000-000000000002'
await c.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'nyc@test.no','{"full_name":"Ny Coach"}')`, [NYC])
const nyLagId = (await as(NYC, `select public.create_coach_team('Eget lag') as id`)).rows[0].id
const nyc = await q('select team_id, role::text r from profiles where id=$1', [NYC])
nyc[0].team_id === nyLagId && nyc[0].r === 'coach' ? ok('create_coach_team setter team_id og rolle selv')
  : fail(`create_coach_team: ${JSON.stringify(nyc[0])}`)

// Huset selv under «alle ser alt»: en løper rett på P skal synes for gruppetrenerne.
!(await ser(C1, P)) ? ok('uten bryteren ser ikke Kari huset selv') : fail('Kari ser huset uten bryteren')
await as(H, 'select public.head_set_open(true)')
await ser(C1, P) ? ok('med «alle ser alt» ser Kari også løperne som står rett på huset') : fail('huset selv er fortsatt usynlig')
await as(H, 'select public.head_set_open(false)')


// --- skigymnas, åpen tilknytning og eierskapsbasert trenerrett ---
const skoler = (await as(L2, 'select * from public.skigymnas()')).rows
skoler.length === 9 ? ok(`ni skigymnas finnes fra start (${skoler.map(s => s.name).slice(0, 3).join(', ')} …)`)
  : fail(`skigymnas: ${skoler.length}`)
const GEILO = skoler.find(s => s.name === 'NTG Geilo').id
;(await q('select owner_id from teams where id=$1', [GEILO]))[0].owner_id === null
  ? ok('et skigymnas finnes uten at noen trener har startet') : fail('skigymnaset har eier')

const [S1, S2, SC, SX] = ['dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002',
  'dddddddd-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004']
for (const [id, mail, navn] of [[S1, 's1@test.no', 'Skole Én'], [S2, 's2@test.no', 'Skole To'],
  [SC, 'sc@test.no', 'Geilo Trener'], [SX, 'sx@test.no', 'Selverklært']]) {
  await c.query(`insert into auth.users(id,email,raw_user_meta_data)
    values ($1,$2,jsonb_build_object('full_name',$3::text))`, [id, mail, navn])
}
await as(S1, 'select public.velg_skigymnas($1)', [GEILO])
await as(S2, 'select public.velg_skigymnas($1)', [GEILO])
;(await q('select team_id from profiles where id=$1', [S1]))[0].team_id === GEILO
  ? ok('en løper knyttet seg til skigymnaset uten kode og uten trener') : fail('velg_skigymnas virket ikke')
const serAndre = await as(S1, 'select id from profiles where id = $1', [S2])
serAndre.rows.length === 0 ? ok('to løpere som bare har valgt samme skigymnas ser ikke hverandre')
  : fail('løpere på skigymnaset ser hverandre')
try { await as(S1, 'select public.velg_skigymnas($1)', [G1]); fail('valgte et lag som ikke er skigymnas') }
catch (e) { e.message.includes('ikke et skigymnas') ? ok('bare skigymnas kan velges uten kode') : fail(e.message) }

// Selverklært trener: rollen settes her som om registreringen hadde gitt den
// (direkte endring er stengt), og så går hun inn med lagkoden.
await q(`update profiles set role = 'coach' where id = $1`, [SX])
const g2k = (await q('select invite_code k from teams where id=$1', [G2]))[0].k
await as(SX, 'select public.join_team($1)', [g2k])
!(await ser(SX, G2)) ? ok('rollen «trener» pluss lagkoden gir ikke trenerrett - det gjør bare eierskap')
  : fail('en selverklært trener ble trener for laget')
;(await as(SX, 'select id from profiles where team_id = $1 and id <> $2', [G2, SX])).rows.length >= 0
try { await as(SX, `select public.opprett_gruppe('Snikgruppe')`); fail('selverklært trener opprettet gruppe i huset') }
catch { ok('en selverklært trener kan ikke opprette grupper i huset') }

// Administrator setter inn en trener: invitasjon med skigymnaset som hus.
await as(ADM, `select public.admin_invite_coach('sc@test.no', null, $1)`, [GEILO])
const scGruppe = (await as(SC, `select public.create_coach_team('Geilo Fart') as id`)).rows[0].id
;(await q('select parent_team_id from teams where id=$1', [scGruppe]))[0].parent_team_id === GEILO
  ? ok('en invitert trener fikk gruppa si under skigymnaset') : fail('gruppa havnet ikke under skigymnaset')
const ledigeL = (await as(SC, 'select * from public.ledige_lopere()')).rows
ledigeL.length === 2 ? ok('treneren ser de to løperne som alt står på skigymnaset') : fail(`ledigeL: ${ledigeL.length}`)
;(await as(C1, 'select * from public.ledige_lopere()')).rows.every(l => l.id !== S1)
  ? ok('en trener på et annet skigymnas ser dem ikke') : fail('ledigeL løpere lekker til andre hus')
await as(SC, 'select public.flytt_loper($1,$2)', [S1, scGruppe])
;(await q('select team_id from profiles where id=$1', [S1]))[0].team_id === scGruppe
  ? ok('treneren hentet en løper som alt var registrert inn i gruppa si') : fail('hent inn virket ikke')
try { await as(C1, 'select public.flytt_loper($1,$2)', [S2, G1]); fail('trener fra annet hus hentet løper') }
catch { ok('en trener kan ikke hente løpere fra et annet skigymnas') }
try { await as(S1, 'select public.velg_skigymnas($1)', [GEILO]); fail('løper i gruppe byttet seg ut med et klikk') }
catch (e) { e.message.includes('Gå ut av laget') ? ok('en løper i en gruppe må gå ut før hun velger skigymnas på nytt') : fail(e.message) }

// Hovedtrener settes av administrator, og skolen overlever at hun slettes.
try { await as(SC, 'select public.admin_set_team_owner($1,$2)', [GEILO, SC]); fail('en trener tok skigymnaset selv') }
catch (e) { e.message.includes('Bare administrator') ? ok('ingen kan ta et skigymnas selv') : fail(e.message) }
await as(ADM, 'select public.admin_set_team_owner($1,$2)', [GEILO, SC])
await ser(SC, GEILO) ? ok('administrator satte hovedtrener, og hun ser huset') : fail('hovedtrener ser ikke huset')
await c.query('delete from auth.users where id = $1', [SC])
const skoleEtter = await q('select owner_id, (select count(*)::int from teams where id=$1) n from teams where id=$1', [GEILO])
skoleEtter[0]?.n === 1 && skoleEtter[0].owner_id === null ? ok('skigymnaset står igjen uten eier når hovedtreneren slettes')
  : fail(`skigymnaset skoleEtter sletting: ${JSON.stringify(skoleEtter)}`)

// Foreldrekoden: dedikert, lesbar, byttbar.
const forKode = (await q('select link_code k from profiles where id=$1', [S2]))[0].k
;/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(forKode) ? ok(`foreldrekoden er seks lesbare tegn (${forKode})`) : fail(`foreldrekode: ${forKode}`)
const FOR = 'dddddddd-0000-0000-0000-000000000009'
await c.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'far@test.no','{"full_name":"Far"}')`, [FOR])
const nyK = (await as(S2, 'select public.bytt_foreldrekode() as k')).rows[0].k
;(await as(FOR, 'select * from public.link_guardian($1)', [forKode])).rows.length === 0
  ? ok('den gamle foreldrekoden er ugyldig etter bytte') : fail('den gamle foreldrekoden virket etter bytte')
await as(FOR, 'select * from public.link_guardian($1)', [nyK.toLowerCase()])
;(await as(FOR, 'select id from profiles where id = $1', [S2])).rows.length === 1
  ? ok('forelderen koblet seg til med den nye koden, skrevet med små bokstaver') : fail('foreldrekobling virket ikke')
const s2fis = '9990002'
await c.query('update profiles set fis_code = $2 where id = $1', [S2, s2fis])
;(await as(FOR, 'select * from public.link_guardian($1)', [s2fis])).rows.length === 0
  ? ok('FIS-koden kan ikke brukes til å koble seg på som forelder') : fail('FIS-koden virket som foreldrekode')

const adminRader = (await as(ADM, 'select * from public.admin_users()')).rows
const s2rad = adminRader.find(u => u.id === S2)
s2rad?.hus_navn === 'NTG Geilo' && s2rad.skigymnas && s2rad.pa_huset && s2rad.foresatte === 'Far'
  ? ok('admin-oversikten viser skigymnas, at løperen står uten gruppe, og foresatte')
  : fail(`admin_users: ${JSON.stringify(s2rad)}`)


// --- kostnadene hører til de foresatte ---
const rennId = (await q(`insert into races(start_date,end_date,place,host_nation,category,events,gender)
  values (current_date + 10, current_date + 11, 'Åre', 'SWE', 'FIS', 'GS', 'M') returning id`))[0].id
await as(FOR, 'select public.sett_flypris($1,$2,$3)', [S2, rennId, 2400])
;(await q('select flight_cost::int c from race_plan_details where athlete_id=$1 and race_id=$2', [S2, rennId]))[0]?.c === 2400
  ? ok('en foresatt førte flypris for barnet sitt') : fail('flyprisen ble ikke lagret')
await as(S2, `insert into race_plan_details(athlete_id,race_id,travel_mode) values ($1,$2,'flight')
  on conflict (athlete_id,race_id) do update set travel_mode='flight'`, [S2, rennId])
await as(FOR, 'select public.sett_flypris($1,$2,$3)', [S2, rennId, 3100])
const rpd = (await q('select flight_cost::int c, travel_mode m from race_plan_details where athlete_id=$1 and race_id=$2', [S2, rennId]))[0]
rpd.c === 3100 && rpd.m === 'flight' ? ok('flyprisen endres uten å røre løperens reisemåte') : fail(`race_plan_details: ${JSON.stringify(rpd)}`)
try { await as(H, 'select public.sett_flypris($1,$2,$3)', [S2, rennId, 1]); fail('en som ikke er foresatt førte flypris') }
catch (e) { e.message.includes('Bare foresatte') ? ok('bare foresatte kan føre flypris') : fail(e.message) }
try { await as(FOR, `update race_plan_details set travel_mode='car' where athlete_id=$1`, [S2])
  const m = (await q('select travel_mode m from race_plan_details where athlete_id=$1 and race_id=$2', [S2, rennId]))[0].m
  m === 'flight' ? ok('en foresatt kan ikke endre resten av reiseplanen') : fail('foresatt endret reisemåte') }
catch { ok('en foresatt kan ikke endre resten av reiseplanen') }


// --- løperens egne renn kommer opp hos treneren ---
const l1lag = G1, l1trener = C1
const forL1 = (await q('select team_id t, role r from profiles where id=$1', [L1]))[0]
const forC1 = (await q('select role r from profiles where id=$1', [C1]))[0].r
await q(`update profiles set team_id=$2, role='athlete' where id=$1`, [L1, G1])
await q(`update profiles set role='coach' where id=$1`, [C1])
const hosTrener = async () => (await as(l1trener, 'select * from public.team_race_athletes()')).rows.filter(r => r.race_id === rennId)
;(await hosTrener()).length === 0 ? ok('utgangspunkt: rennet er ikke i lagets plan, og treneren ser det ikke') : fail('rennet var synlig før noen la det inn')
await as(L1, `insert into athlete_races(athlete_id, race_id, team_id, status) values ($1,$2,null,'wish')`, [L1, rennId])
const etterOnske = await hosTrener()
etterOnske.some(r => r.athlete_id === L1 && r.status === 'wish' && !r.assigned)
  ? ok('et renn løperen selv legger inn kommer opp hos treneren, uten at treneren har lagt det i planen')
  : fail(`treneren ser ikke løperens renn: ${JSON.stringify(etterOnske)}`)
;(await q('select count(*)::int n from team_races where team_id=$1 and race_id=$2', [l1lag, rennId]))[0].n === 0
  ? ok('rennet er fortsatt ikke i lagets plan - lagkameratene får det ikke i sin sesong') : fail('løperens renn havnet i lagets plan')
// Dialogen: løperen har svart, treneren ikke. Løperen kan ikke godkjenne seg selv.
etterOnske.some(r => r.athlete_id === L1 && r.answered === true) ? ok('løperens eget valg teller som svar') : fail('ønsket ble ikke regnet som svar')
await as(L1, `update athlete_races set assigned_by=$1, coach_note='ok fra trener' where athlete_id=$1 and race_id=$2`, [L1, rennId])
{ const r = (await q('select assigned_by a, coach_note n from athlete_races where athlete_id=$1 and race_id=$2', [L1, rennId]))[0]
  r.a === null && r.n === null ? ok('løperen kan ikke sette trenerens godkjenning eller notat selv') : fail(`løperen skrev trenerens felt: ${JSON.stringify(r)}`) }
await as(l1trener, 'select public.assign_race($1,$2)', [rennId, [L1]])
;(await hosTrener()).some(r => r.athlete_id === L1 && r.assigned && r.answered && r.status === 'wish')
  ? ok('trener sier ja til et ønske: begge har svart') : fail('ja til ønske ga ikke avtale')
await as(L1, `delete from athlete_races where athlete_id=$1 and race_id=$2`, [L1, rennId])
await as(l1trener, 'select public.assign_race($1,$2)', [rennId, [L1]])
;(await hosTrener()).some(r => r.athlete_id === L1 && r.assigned && r.answered === false)
  ? ok('trener setter opp en løper: venter på løperens svar') : fail('tildeling ble regnet som løperens svar')
await as(L1, `update athlete_races set status='planned' where athlete_id=$1 and race_id=$2`, [L1, rennId])
;(await hosTrener()).some(r => r.athlete_id === L1 && r.assigned && r.answered === true)
  ? ok('løperen bekrefter, og tildelingen står') : fail('bekreftelsen ble ikke registrert, eller tildelingen forsvant')
// Nei fra treneren: opphever tildelingen, synlig for løperen, og løperen kan ikke fjerne det. Ja opphever nei.
await as(l1trener, `select public.decline_race($1,$2,'Vi tar Hafjell uka etter')`, [rennId, [L1]])
{ const r = (await hosTrener()).find(r => r.athlete_id === L1)
  r.declined && !r.assigned && r.coach_note === 'Vi tar Hafjell uka etter' ? ok('trener sier nei med begrunnelse') : fail(`nei: ${JSON.stringify(r)}`) }
await as(L1, `update athlete_races set coach_declined_at=null, coach_note=null, status='wish' where athlete_id=$1 and race_id=$2`, [L1, rennId])
;(await q('select coach_declined_at d, coach_note n from athlete_races where athlete_id=$1 and race_id=$2', [L1, rennId]))[0].d !== null ? ok('løperen kan ikke fjerne trenerens nei') : fail('løperen fjernet nei')
try { await as(L1, `select public.decline_race($1,$2)`, [rennId, [L1]]); fail('løper sa nei som trener') } catch { ok('bare trener kan si nei') }
await as(l1trener, `select public.coach_race_note($1,$2,'Ny kommentar')`, [rennId, L1])
;(await q('select coach_note n from athlete_races where athlete_id=$1 and race_id=$2', [L1, rennId]))[0].n === 'Ny kommentar' ? ok('trener skriver kommentar til løperen') : fail('kommentar ble ikke lagret')
await as(l1trener, 'select public.assign_race($1,$2)', [rennId, [L1]])
;(await hosTrener()).some(r => r.athlete_id === L1 && r.assigned && !r.declined) ? ok('et ja opphever nei') : fail('nei ble stående etter ja')
await as(L1, `update athlete_races set status='unavailable' where athlete_id=$1 and race_id=$2`, [L1, rennId])
;(await hosTrener()).length === 0 ? ok('«kan ikke» alene gjør ikke rennet til lagets sak') : fail('«kan ikke» ga treneren et renn')
await as(L1, `delete from athlete_races where athlete_id=$1 and race_id=$2`, [L1, rennId])
await q(`update profiles set team_id=$2, role=$3 where id=$1`, [L1, forL1.t, forL1.r])
await q(`update profiles set role=$2 where id=$1`, [C1, forC1])

// --- påmelding for foreldre ---
// FOR er foresatt for S2. Et renn i planen med frist om tre dager skal gi
// d7-varsel; når fristen er under et døgn unna, d1-varsel. Hvert sendes én gang.
const pmRenn = (await q(`insert into races(start_date,end_date,place,host_nation,category,events,gender,signup_deadline)
  values (current_date + 12, current_date + 13, 'Hafjell', 'NOR', 'FIS', 'GS', 'M', now() + interval '3 days') returning id`))[0].id
await as(S2, `insert into athlete_races(athlete_id, race_id, team_id, status) values ($1,$2,null,'planned')`, [S2, pmRenn])
const hull = async () => (await q('select * from public.entry_gaps()')).filter(g => g.race_id === pmRenn)
let h = await hull()
h.length === 1 && h[0].kind === 'd7' && h[0].guardian_emails.length === 1
  ? ok('frist om tre dager gir sju-dagers varsel til løper og foresatt') : fail(`entry_gaps d7: ${JSON.stringify(h)}`)
await q(`insert into entry_reminders(athlete_id, race_id, certainty, kind) values ($1,$2,'unknown','d7')`, [S2, pmRenn])
;(await hull()).length === 0 ? ok('sju-dagers varselet sendes bare én gang') : fail('d7 kom to ganger')
await q(`update races set signup_deadline = now() + interval '10 hours' where id=$1`, [pmRenn])
h = await hull()
h.length === 1 && h[0].kind === 'd1' ? ok('under et døgn før fristen kommer et nytt varsel, selv om sju-dagers er sendt') : fail(`entry_gaps d1: ${JSON.stringify(h)}`)
await as(FOR, `update profiles set entry_alerts = false where id=$1`, [FOR])
;(await hull())[0].guardian_emails.length === 0 ? ok('en forelder som har slått av varsler får ikke e-post; løperen får fortsatt')
  : fail('forelder med varsler av står fortsatt som mottaker')
await as(FOR, `update profiles set entry_alerts = true where id=$1`, [FOR])
try { await as(FOR, 'select * from public.entry_gaps()'); fail('en innlogget bruker kunne lese hvem som mangler påmelding') }
catch { ok('entry_gaps kan ikke kalles av innloggede brukere') }

const pm = (await as(FOR, 'select * from public.barnas_pamelding()')).rows
const pmRad = pm.find(r => r.race_id === pmRenn)
pmRad && pmRad.athlete_id === S2 && pmRad.status === 'planned' && pmRad.frist_kilde === 'isonen' && !pmRad.pa_lista && !pmRad.lista_kjent
  ? ok('forelderen ser barnets renn med frist, kilde og at påmeldingen ikke er bekreftet') : fail(`barnas_pamelding: ${JSON.stringify(pmRad)}`)
await q(`insert into race_entries(race_id, discipline, fis_code, batch) values ($1,'GS',(select fis_code from profiles where id=$2), now())`, [pmRenn, S2])
const s2kode = (await q('select fis_code f from profiles where id=$1', [S2]))[0].f
if (s2kode) {
  const etter = (await as(FOR, 'select * from public.barnas_pamelding()')).rows.find(r => r.race_id === pmRenn)
  etter.pa_lista && etter.lista_kjent ? ok('står barnet på deltakerlista, viser oversikten det') : fail(`pa_lista: ${JSON.stringify(etter)}`)
  ;(await hull()).length === 0 ? ok('den som står på deltakerlista får ikke varsel') : fail('varsel til en som er påmeldt')
} else ok('S2 har ingen FIS-kode i testen - deltakerlista hoppes over')
;(await as(H, 'select * from public.barnas_pamelding()')).rows.length === 0
  ? ok('den som ikke er foresatt får en tom oversikt') : fail('barnas_pamelding lakk til en som ikke er foresatt')
const utRenn = (await q(`insert into races(start_date,end_date,place,host_nation,category,events,gender)
  values (current_date + 45, current_date + 46, 'Åre', 'SWE', 'FIS', 'GS', 'M') returning id`))[0].id
const norskRenn = (await q(`insert into races(start_date,end_date,place,host_nation,category,events,gender)
  values (current_date + 45, current_date + 46, 'Geilo', 'NOR', 'FIS', 'GS', 'M') returning id`))[0].id
await as(S2, `insert into athlete_races(athlete_id, race_id, team_id, status) values ($1,$2,null,'planned'), ($1,$3,null,'planned')`, [S2, utRenn, norskRenn])
const frister = (await as(FOR, 'select race_id, frist_kilde, (frist at time zone \'Europe/Oslo\')::date - current_date as dager from public.barnas_pamelding()')).rows
const ut = frister.find(r => r.race_id === utRenn), nor = frister.find(r => r.race_id === norskRenn)
ut?.frist_kilde === 'forbund' && Number(ut.dager) === 25
  ? ok('renn utenfor Norge får forbundets frist: 20 dager før start, til 23:59 den dagen') : fail(`frist i utlandet: ${JSON.stringify(ut)}`)
nor && nor.frist_kilde === null ? ok('norsk renn uten frist fra iSonen eller trener står fortsatt som ukjent') : fail(`norsk frist: ${JSON.stringify(nor)}`)
await q('delete from athlete_races where race_id in ($1,$2)', [utRenn, norskRenn])
await q('delete from races where id in ($1,$2)', [utRenn, norskRenn])
await q('delete from race_entries where race_id=$1', [pmRenn])
await q('delete from entry_reminders where race_id=$1', [pmRenn])
await q('delete from athlete_races where race_id=$1', [pmRenn])
await q('delete from races where id=$1', [pmRenn])

// --- favoritter ---
await q(`insert into fis_lists(list_id, list_no, season_code, name) values (1, 1, 2027, '1st FIS points list 2026/2027') on conflict do nothing`)
await q(`insert into fis_list_athletes(fis_code, list_id, last_name, first_name, nation, gender, birth_year, club, sl, gs, name_key)
  values ('990001', 1, 'BRAATHEN', 'Aase Marie', 'NOR', 'W', 2008, 'Geilo IL', 41.2, 55.0, 'braathen|aase marie'),
         ('990002', 1, 'Berg', 'Jonas', 'NOR', 'M', 2007, 'Bærum SK', 60.1, 48.3, 'berg|jonas')`)
const sok = async (hvem, tekst) => (await as(hvem, 'select * from public.fis_sok($1)', [tekst])).rows
;(await sok(S2, 'åse bråthen')).map(r => r.fis_code).join() === '990001' ? ok('søk på navn finner løperen, med nordiske tegn og i vilkårlig rekkefølge') : fail('fis_sok på navn')
;(await sok(S2, 'braathen aase')).length === 1 && (await sok(S2, 'Bråthen')).length === 1 ? ok('søket treffer både med nordiske tegn og med FIS sin skrivemåte (aa, oe, ae)') : fail('fis_sok skrivemåter')
;(await sok(S2, '990002'))[0]?.last_name === 'Berg' ? ok('søk på FIS-kode finner løperen') : fail('fis_sok på kode')
;(await sok(S2, 'be')).length === 0 ? ok('for korte søk svarer tomt') : fail('fis_sok svarte på to tegn')
await as(S2, `insert into follows(user_id, fis_code) values ($1, '990001')`, [S2])
const ft = (await as(S2, 'select * from public.favoritt_tabell()')).rows
ft.some(r => r.fis_code === '990001' && r.favoritt && !r.egen && Number(r.sl) === 41.2)
  ? ok('favoritt-tabellen viser den man følger med poeng') : fail(`favoritt_tabell: ${JSON.stringify(ft)}`)
!ft.some(r => r.fis_code === '990002') ? ok('løpere man ikke følger er ikke med') : fail('favoritt_tabell tok med en man ikke følger')
;(await as(FOR, 'select * from public.favoritt_tabell()')).rows.every(r => r.fis_code !== '990001')
  ? ok('andres favoritter er ikke synlige') : fail('favoritter lakk mellom brukere')
// --- tidtaking kobles når løperen registrerer seg ---
// Treneren C1 lastet opp en økt før løperne fantes. Når «Hugo Testesen» kommer
// inn på laget, kobles «Hugo»-løpene; «Kari» passer to løpere og kobles ikke.
{
  const lag = (await q('select team_id t from profiles where id=$1', [C1]))[0].t
  const imp = (await q(`insert into timing_imports(team_id, uploaded_by, filename) values ($1,$2,'okt.csv') returning id`, [lag, C1]))[0].id
  for (const [navn, bib, tid] of [['Hugo', '94', 28630], ['Hugo', '94', 29695], ['TESTESEN Ole Magnus', '1', 28471], ['#30', '30', 28675]])
    await q(`insert into timing_runs(import_id, team_id, athlete_id, source_name, bib, run_no, run_time_ms, status) values ($1,$2,null,$3,$4,1,$5,'OK')`, [imp, lag, navn, bib, tid])
  const HUGO = 'eeeeeeee-0000-0000-0000-000000000001', OLE = 'eeeeeeee-0000-0000-0000-000000000002', K1 = 'eeeeeeee-0000-0000-0000-000000000003', K2 = 'eeeeeeee-0000-0000-0000-000000000004'
  for (const [id, navn] of [[HUGO, 'Hugo Testesen'], [OLE, 'Ole Magnus Testesen'], [K1, 'Kari Prøve'], [K2, 'Kari Øvelse']]) {
    await c.query(`insert into auth.users(id,email) values ($1,$2)`, [id, id.slice(-4) + '@tidtaking.test'])
    await q(`insert into profiles(id, full_name, role, team_id) values ($1,$2,'athlete',null) on conflict (id) do update set full_name=excluded.full_name, role='athlete', team_id=null`, [id, navn])
    await q(`update profiles set team_id=$2 where id=$1`, [id, lag])
  }
  // To Kari-er på laget, så kommer en fil med «Kari»: ingen av dem får løpene.
  await q(`insert into timing_runs(import_id, team_id, athlete_id, source_name, bib, run_no, run_time_ms, status) values ($1,$2,null,'Kari','13',1,29712,'OK')`, [imp, lag])
  await q(`update profiles set full_name='Kari Prøve' where id=$1`, [K1])
  const hvem = async navn => (await q(`select athlete_id a from timing_runs where import_id=$1 and source_name=$2`, [imp, navn])).map(r => r.a)
  ;(await hvem('Hugo')).every(a => a === HUGO) ? ok('fornavnet i fila kobles til løperen som kom inn') : fail('Hugo ble ikke koblet')
  ;(await hvem('TESTESEN Ole Magnus')).every(a => a === OLE) ? ok('HC Timing-navn med etternavn først kobles også') : fail('Ole Magnus ble ikke koblet')
  ;(await hvem('Kari')).every(a => a === null) ? ok('et fornavn to løpere deler kobles ikke') : fail('Kari ble koblet til feil løper')
  ;(await hvem('#30')).every(a => a === null) ? ok('løp uten navn rører ikke') : fail('#30 ble koblet')
  ;(await q(`select athlete_id a from timing_aliases where team_id=$1 and source_name='Hugo'`, [lag]))[0]?.a === HUGO ? ok('navnet huskes til neste opplasting') : fail('alias ble ikke lagret')
  // Neste opplasting: raden kobles i basen selv om skjemaet ikke gjorde det.
  await q(`insert into timing_runs(import_id, team_id, athlete_id, source_name, bib, run_no, run_time_ms, status) values ($1,$2,null,'Hugo','94',3,28000,'OK')`, [imp, lag])
  await q(`insert into timing_runs(import_id, team_id, athlete_id, source_name, bib, run_no, run_time_ms, status) values ($1,$2,null,'Ole Magnus','1',3,28100,'OK')`, [imp, lag])
  await q(`insert into timing_runs(import_id, team_id, athlete_id, source_name, bib, run_no, run_time_ms, status) values ($1,$2,null,'Kari','13',3,28200,'OK')`, [imp, lag])
  ;(await q(`select athlete_id a from timing_runs where import_id=$1 and run_no=3 and source_name='Hugo'`, [imp]))[0].a === HUGO ? ok('ny rad kobles via husket navn') : fail('ny Hugo-rad ble ikke koblet')
  ;(await q(`select athlete_id a from timing_runs where import_id=$1 and run_no=3 and source_name='Ole Magnus'`, [imp]))[0].a === OLE ? ok('ny rad kobles via entydig navn i huset') : fail('ny Ole Magnus-rad ble ikke koblet')
  ;(await q(`select athlete_id a from timing_runs where import_id=$1 and run_no=3 and source_name='Kari'`, [imp]))[0].a === null ? ok('ny rad med tvetydig navn kobles ikke') : fail('Kari ble koblet i basen')
  await q(`delete from timing_imports where id=$1`, [imp])
  await q(`delete from timing_aliases where team_id=$1 and source_name in ('Hugo','TESTESEN Ole Magnus')`, [lag])
  for (const id of [HUGO, OLE, K1, K2]) { await q('delete from profiles where id=$1', [id]); await c.query('delete from auth.users where id=$1', [id]) }
}

// --- vær og føre på renn ---
// S2 har kjørt et renn. S2 kan føre føret; en løper som ikke kjørte og
// forelderen kan ikke. Alle innloggede kan lese.
await q(`insert into fis_athletes(fis_code, name) values ($1, 'Test') on conflict do nothing`, [s2kode])
await q(`insert into fis_results(fis_code, fis_race_id, race_date, place, nation, discipline, position)
  values ($1, 880001, current_date - 30, 'Aal', 'NOR', 'Slalom', '12')`, [s2kode])
const foreRad = `insert into race_conditions(place, nation, race_date, fore, set_by) values ('Aal','NOR', current_date - 30, $2, $1)
  on conflict (place, nation, race_date) do update set fore = excluded.fore, set_by = excluded.set_by`
await as(S2, foreRad, [S2, 'ice'])
;(await q(`select fore from race_conditions where place='Aal'`))[0]?.fore === 'ice' ? ok('løperen som kjørte kan føre føret') : fail('føret ble ikke lagret')
try { await as(S1, foreRad, [S1, 'soft']); fail('en løper som ikke kjørte rennet førte føret') }
catch { ok('en løper som ikke kjørte rennet kan ikke føre føret') }
try { await as(FOR, foreRad, [FOR, 'soft']); fail('en forelder førte føret') }
catch { ok('en forelder kan ikke føre føret') }
try { await as(S2, foreRad, [S1, 'hard']); fail('føret ble ført i en annens navn') }
catch { ok('føret kan ikke føres i en annens navn') }
try { await as(S2, foreRad, [S2, 'gjørme']); fail('ukjent føre godtatt') }
catch { ok('bare kjente føretyper godtas') }
;(await as(FOR, `select fore from race_conditions where place='Aal'`)).rows[0]?.fore === 'ice' ? ok('forelderen kan lese føret') : fail('forelderen ser ikke føret')
try { await as(S2, `insert into race_weather(place, nation, race_date, temp_middag) values ('Aal','NOR', current_date - 30, 20)`); fail('en bruker skrev vær') }
catch { ok('vanlige brukere kan ikke skrive vær') }
;(await q(`select count(*)::int n from public.vaer_mangler(50) where place='Aal'`))[0].n === 1 ? ok('renndagen står som manglende vær') : fail('vaer_mangler fant ikke renndagen')
await q(`insert into race_weather(place, nation, race_date, funnet) values ('Aal','NOR', current_date - 30, false)`)
;(await q(`select count(*)::int n from public.vaer_mangler(50) where place='Aal'`))[0].n === 0 ? ok('et sted som ikke ble funnet prøves ikke hver natt') : fail('ikke-funnet sted står fortsatt i køen')
try { await as(S2, 'select * from public.vaer_mangler(5)'); fail('en bruker kalte vaer_mangler') }
catch { ok('vaer_mangler er bare for jobben') }
await q(`delete from race_conditions where place='Aal'`); await q(`delete from race_weather where place='Aal'`); await q(`delete from fis_results where fis_race_id = 880001`)

await q(`delete from follows where fis_code in ('990001','990002')`)
await q(`delete from fis_list_athletes where fis_code in ('990001','990002')`)

// --- opplasting av tidtaking ---
// Treneren for gruppa lagrer en økt med løp; løperen ser sine egne, en annen
// løper ser ingenting, og en trener uten rett til gruppa får ikke lagret.
await q(`update profiles set team_id=$2, role='athlete' where id=$1`, [L1, G1])
await q(`update profiles set role='coach' where id=$1`, [C1])
const tiImp = (await as(C1, `insert into timing_imports(team_id, uploaded_by, filename, session_date, discipline, rows_total, rows_mapped)
  values ($1, $2, 'hc.csv', current_date, 'GS', 2, 1) returning id`, [G1, C1])).rows[0].id
await as(C1, `insert into timing_runs(import_id, team_id, athlete_id, source_name, bib, run_no, run_time_ms, status, splits_ms)
  values ($1, $2, $3, 'TESTESEN Kari', '11', 1, 46320, 'OK', '{12390,34930}'), ($1, $2, null, 'UKJENT Person', '12', 1, null, 'DNF', '{13530}')`, [tiImp, G1, L1])
await as(C1, `insert into timing_aliases(team_id, source_name, athlete_id, created_by) values ($1, 'TESTESEN Kari', $2, $3)`, [G1, L1, C1])
;(await as(C1, 'select count(*)::int n from timing_runs where import_id=$1', [tiImp])).rows[0].n === 2
  ? ok('treneren lagrer en økt med tider for gruppa si') : fail('treneren ser ikke egne opplastede løp')
const l1Ser = (await as(L1, 'select source_name from timing_runs where import_id=$1', [tiImp])).rows
l1Ser.length === 1 && l1Ser[0].source_name === 'TESTESEN Kari' ? ok('løperen ser sine egne tider, ikke de andres') : fail(`løperen ser: ${JSON.stringify(l1Ser)}`)
;(await as(S2, 'select count(*)::int n from timing_runs where import_id=$1', [tiImp])).rows[0].n === 0
  ? ok('en løper utenfor gruppa ser ingen av tidene') : fail('tider lakk til en annen løper')
await stoppetTi()
async function stoppetTi() {
  try { await as(S2, `insert into timing_imports(team_id, uploaded_by, filename, session_date, discipline) values ($1, $2, 'x.csv', current_date, 'GS')`, [G1, S2])
    fail('en som ikke er trener for gruppa lastet opp tidtaking') }
  catch { ok('bare treneren for gruppa kan laste opp tidtaking') }
}
await as(C1, 'delete from timing_imports where id=$1', [tiImp])
;(await q('select count(*)::int n from timing_runs where import_id=$1', [tiImp]))[0].n === 0
  ? ok('sletter treneren økta, forsvinner tidene med den') : fail('løp ble liggende etter at økta ble slettet')
await q(`delete from timing_aliases where team_id=$1`, [G1])

// --- herding: lag, rolle og foreldrekode ---
const stoppet = async (hvem, sql, p) => { try { await as(hvem, sql, p); return false } catch { return true } }
await stoppet(S2, `insert into teams(name, owner_id, parent_team_id) values ('Snik', $1, $2)`, [S2, P])
  ? ok('en løper kan ikke opprette en gruppe under et lag rett i tabellen') : fail('gruppe opprettet direkte under et hus')
await stoppet(S2, `update profiles set role = 'coach' where id = $1`, [S2])
  ? ok('ingen kan gjøre seg selv til trener ved å endre profilen') : fail('rolle satt til trener direkte')
;(await as(S2, `update profiles set role = 'athlete' where id = $1 returning role`, [S2])).rows.length === 1
  ? ok('rollen kan fortsatt settes til løper eller forelder') : fail('rolle løper ble stoppet')
await stoppet(C1, `update teams set parent_team_id = null where id = $1`, [G1])
  ? ok('en gruppetrener kan ikke flytte gruppa si ut av huset') : fail('parent_team_id endret direkte')
await stoppet(C1, `update teams set coaches_see_all = true where id = $1`, [G1])
  ? ok('«alle ser alt» kan ikke slås på rett i tabellen') : fail('coaches_see_all endret direkte')
await stoppet(C1, `update teams set owner_id = $2 where id = $1`, [G1, S2])
  ? ok('eierskap til et lag kan ikke gis bort rett i tabellen') : fail('owner_id endret direkte')
await stoppet(S2, `select link_code from profiles where id = $1`, [S2])
  ? ok('foreldrekoden kan ikke leses rett fra profiltabellen') : fail('link_code lesbar direkte')
;(await as(S2, 'select public.min_foreldrekode() as k')).rows[0].k === (await q('select link_code k from profiles where id=$1', [S2]))[0].k
  ? ok('løperen får sin egen foreldrekode gjennom funksjonen') : fail('min_foreldrekode ga feil kode')
;(await as(FOR, 'select public.min_foreldrekode() as k')).rows[0].k === null
  ? ok('en forelder får ingen kode') : fail('min_foreldrekode svarte en forelder')
await stoppet(S2, `update profiles set link_code = 'AAAAAA' where id = $1`, [S2])
  ? ok('foreldrekoden kan ikke settes direkte') : fail('link_code satt direkte')
await stoppet(S2, `insert into guardians(parent_id, athlete_id) values ($1, $2)`, [H, S2])
  ? ok('foresatte kan ikke legges inn rett i tabellen') : fail('guardians satt inn direkte')
;(await as(S2, `select id, full_name, role from profiles where id = $1`, [S2])).rows.length === 1
  ? ok('resten av profilen leses som før') : fail('profilen kunne ikke leses')

// --- modusen bestemmer, også i databasen ---
await ser(H, G1) ? ok('utgangspunkt: hovedtreneren er trener for gruppa') : fail('H er ikke trener i utgangspunktet')
await as(H, `update profiles set role = 'parent' where id = $1`, [H])
!(await ser(H, G1)) && !(await ser(H, P)) ? ok('i foreldremodus har lageieren ingen trenerrett, heller ikke til sitt eget lag')
  : fail('foreldremodus beholdt trenerrettighetene')
;(await as(H, 'select id from profiles where team_id = $1', [G2])).rows.length === 0
  ? ok('i foreldremodus kan hun ikke lese løperne i gruppene') : fail('foreldremodus leser løpere')
try { await as(H, `select public.opprett_gruppe('Skal ikke gå')`); fail('opprettet gruppe i foreldremodus') }
catch { ok('i foreldremodus kan hun ikke opprette grupper') }
await as(H, `update profiles set role = 'athlete' where id = $1`, [H])
!(await ser(H, G1)) ? ok('i løpermodus har hun heller ingen trenerrett') : fail('løpermodus beholdt trenerrettighetene')
await c.query(`update profiles set role = 'coach' where id = $1`, [H])
await ser(H, G1) ? ok('tilbake som trener er rettighetene tilbake') : fail('trenerrett kom ikke tilbake')

// --- forsøkssperre på kodene ---
const GJ = 'eeeeeeee-0000-0000-0000-000000000001'
await c.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'gjett@test.no','{"full_name":"Gjetter"}')`, [GJ])
for (let i = 0; i < 10; i++) await as(GJ, 'select * from public.link_guardian($1)', ['FEIL' + i + 'X'])
const riktig = (await q('select link_code k from profiles where id=$1', [L2]))[0].k
try { await as(GJ, 'select * from public.link_guardian($1)', [riktig]); fail('ellevte forsøk slapp gjennom') }
catch (e) { e.message.includes('For mange forsøk') ? ok('etter ti feil foreldrekoder stopper det - også for riktig kode') : fail(e.message) }
for (let i = 0; i < 10; i++) await as(GJ, 'select public.join_team($1)', ['NEI' + i + 'XX'])
try { await as(GJ, 'select public.join_team($1)', [g2k]); fail('ellevte lagkode-forsøk slapp gjennom') }
catch (e) { e.message.includes('For mange forsøk') ? ok('etter ti feil lagkoder stopper det') : fail(e.message) }
;(await as(GJ, 'select count(*)::int n from kodeforsok').catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n === -1
  ? ok('forsøksloggen kan ikke leses av brukeren') : fail('kodeforsok er lesbar')
;(await q(`select count(*)::int n from information_schema.columns where table_name='feedback' and column_name='notified_at'`))[0].n === 1
  ? ok('feedback har notified_at, så et varsel bare sendes én gang') : fail('notified_at mangler')

// --- rettighetsrevisjon: alt frontend kaller, som authenticated ---
//
// Smoke-testen i nettleseren mocker nettverket og kan aldri se en
// rettighetsfeil. «permission denied for function ny_lagkode» gikk rett
// forbi den. Dette er sjekken som skulle fanget den.
const bruk = hentBruk(REPO)
const OP = { select: ['SELECT'], insert: ['INSERT'], update: ['UPDATE'], delete: ['DELETE'],
  upsert: ['INSERT', 'UPDATE'], '?': ['SELECT'] }
let revFeil = 0
for (const [tabell, ops] of Object.entries(bruk.tabeller)) {
  const finnes = await q(`select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=$1 and c.relkind in ('r','v')`, [tabell])
  if (!finnes.length) { fail(`frontend bruker tabellen «${tabell}», som ikke finnes`); revFeil++; continue }
  for (const op of ops) for (const priv of OP[op]) {
    // Lesetilgang kan være gitt per kolonne (profiles: alt unntatt foreldrekoden).
    const ok = (await q(`select has_table_privilege('authenticated', 'public.' || $1, $2)
      or ($2 = 'SELECT' and has_any_column_privilege('authenticated', 'public.' || $1, 'SELECT')) as ok`, [tabell, priv]))[0].ok
    if (!ok) { fail(`authenticated mangler ${priv} på ${tabell} (frontend gjør ${op})`); revFeil++ }
  }
}
ok(`tabeller: ${Object.keys(bruk.tabeller).length} tabeller/views, alle operasjoner frontend gjør er tillatt`)

for (const fn of bruk.rpc) {
  const rader = await q(`select p.oid::regprocedure::text as sig,
      has_function_privilege('authenticated', p.oid, 'execute') as ok
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=$1`, [fn])
  if (!rader.length) { fail(`frontend kaller rpc «${fn}», som ikke finnes i basen`); revFeil++; continue }
  for (const r of rader) if (!r.ok) { fail(`authenticated kan ikke kalle ${r.sig}`); revFeil++ }
}
ok(`rpc: alle ${bruk.rpc.length} funksjoner frontend kaller finnes og kan kalles`)

// Kolonnestandarder som kaller en funksjon i public: evalueres som den som
// setter inn raden. Nøyaktig klassen ny_lagkode-feilen var i.
const defs = await q(`select c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid) as uttrykk
  from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'`)
let defSjekket = 0
for (const d of defs) {
  for (const m of d.uttrykk.matchAll(/(?:public\.)?([a-z_]+)\(/g)) {
    const navn = m[1]
    const iPublic = await q(`select p.oid::regprocedure::text as sig,
        has_function_privilege('authenticated', p.oid, 'execute') as ok
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=$1`, [navn])
    for (const r of iPublic) {
      defSjekket++
      if (!r.ok) { fail(`kolonnestandard ${d.relname}.${d.attname} kaller ${r.sig}, som authenticated ikke kan kjøre`); revFeil++ }
    }
  }
}
ok(`kolonnestandarder: ${defSjekket} funksjonskall i public, alle kjørbare for authenticated`)

// anon har grants på alt (Supabase-standard); RLS er det som holder dem ute.
// Da må RLS være på overalt.
const utenRls = await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1`)
utenRls.length === 0 ? ok('RLS er på i hver eneste tabell i public')
  : (fail(`tabeller uten RLS: ${utenRls.map(r => r.relname).join(', ')}`), revFeil++)

const views = await q(`select c.relname, coalesce(array_to_string(c.reloptions, ','), '') as opts
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v' order by 1`)
for (const v of views) {
  /security_invoker=(true|on)/.test(v.opts) ? ok(`view ${v.relname} har security_invoker`)
    : (fail(`view ${v.relname} mangler security_invoker - RLS omgås gjennom den`), revFeil++)
}
// Ingen klientrolle skal ha TRUNCATE, og uinnloggede skal ikke kunne skrive.
const forMye = await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and ((grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES'))
     or (grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))) order by 1, 2, 3`)
forMye.length === 0 ? ok('ingen klientrolle har TRUNCATE, og uinnloggede har ingen skriverett')
  : (fail(`for vide rettigheter: ${forMye.slice(0, 5).map(r => `${r.grantee} ${r.privilege_type} ${r.table_name}`).join(', ')}`), revFeil++)
// Kolonnene i profiles som klienten får lese må stemme med lista i appen.
const lesbare = (await q(`select column_name c from information_schema.columns where table_schema='public' and table_name='profiles'
  and has_column_privilege('authenticated', 'public.profiles', column_name, 'SELECT') order by 1`)).map(r => r.c)
const iAppen = (await import('../../src/profil.js')).PROFIL_FELT.split(',').map(x => x.trim()).sort()
JSON.stringify(lesbare) === JSON.stringify(iAppen) ? ok('appens profilkolonner er nøyaktig de klienten får lese')
  : (fail(`profilkolonner: basen gir ${lesbare.join(',')} - appen ber om ${iAppen.join(',')}`), revFeil++)
!lesbare.includes('link_code') ? ok('foreldrekoden er ikke blant kolonnene klienten får lese') : (fail('link_code er lesbar'), revFeil++)
if (!revFeil) ok('rettighetsrevisjon: ingen avvik')

// --- slett kontoen min ---
// Til slutt, fordi brukerne forsvinner. En løper med plan, logg, foresatt og
// favoritt sletter seg selv, og alt som hang på henne er borte.
const SLETT = '9a9a9a9a-0000-0000-0000-000000000001', SLETTFOR = '9a9a9a9a-0000-0000-0000-000000000002'
await c.query(`insert into auth.users(id, email, raw_user_meta_data) values
  ($1, 'slettes@test.no', jsonb_build_object('full_name', 'Skal Slettes')), ($2, 'slettfor@test.no', jsonb_build_object('full_name', 'Blir Igjen', 'role', 'parent'))`, [SLETT, SLETTFOR])
const slRenn = (await q(`insert into races(start_date,end_date,place,host_nation,category,events,gender)
  values (current_date + 30, current_date + 31, 'Voss', 'NOR', 'FIS', 'SL', 'M') returning id`))[0].id
await q(`insert into athlete_races(athlete_id, race_id, status) values ($1, $2, 'planned')`, [SLETT, slRenn])
await q(`insert into training_sessions(athlete_id, date, discipline) values ($1, current_date, 'SL')`, [SLETT])
await q(`insert into guardians(parent_id, athlete_id) values ($1, $2)`, [SLETTFOR, SLETT])
await q(`insert into follows(user_id, fis_code) values ($1, '423032')`, [SLETT])
await q(`insert into kodeforsok(user_id, slag) values ($1, 'lag')`, [SLETT])
await as(SLETT, 'select public.slett_min_konto()')
const rester = (await q(`select (select count(*) from auth.users where id = $1)::int as bruker, (select count(*) from profiles where id = $1)::int as profil,
  (select count(*) from athlete_races where athlete_id = $1)::int as plan, (select count(*) from training_sessions where athlete_id = $1)::int as logg,
  (select count(*) from guardians where athlete_id = $1)::int as foresatte, (select count(*) from follows where user_id = $1)::int as favoritter,
  (select count(*) from kodeforsok where user_id = $1)::int as forsok`, [SLETT]))[0]
Object.values(rester).every(n => n === 0) ? ok('slett kontoen min: bruker, profil, plan, logg, foresatte, favoritter og forsøk er borte')
  : fail(`rester etter sletting: ${JSON.stringify(rester)}`)
;(await q('select count(*)::int n from profiles where id = $1', [SLETTFOR]))[0].n === 1 && (await q('select count(*)::int n from races where id = $1', [slRenn]))[0].n === 1
  ? ok('forelderen og rennet står igjen - bare den som slettet seg er borte') : fail('slettingen tok med seg mer enn brukeren')
const husFor = (await q('select count(*)::int n from teams where id = $1', [P]))[0].n
await q(`update profiles set is_admin = true where id = $1`, [H])
await q(`update profiles set is_admin = false where id <> $1`, [H])
try { await as(H, 'select public.slett_min_konto()'); fail('eneste administrator slettet seg selv') }
catch (e) { e.message.includes('eneste administrator') ? ok('eneste administrator kan ikke slette seg selv') : fail(e.message) }
await q(`update profiles set is_admin = true where id = $1`, [ADM])
await q(`update profiles set is_admin = false where id = $1`, [H])
await as(H, 'select public.slett_min_konto()')
;(await q('select count(*)::int n from teams where id = $1', [P]))[0].n === husFor && (await q('select owner_id o from teams where id = $1', [P]))[0].o === null
  ? ok('et lag med grupper blir stående uten eier når hovedtreneren sletter seg') : fail('huset forsvant eller har fortsatt eier')
try { await c.query(`set role anon`); await c.query('select public.slett_min_konto()'); fail('uinnlogget kunne kalle slett_min_konto') }
catch { ok('uinnloggede kan ikke kalle slett_min_konto') } finally { await c.query('reset role') }

// Lukk klienten først; ellers svarer serveren med «terminating connection»
// mens den stenges, og en ren kjøring ser ut som en krasj.
await c.end()
await pgdb.stop()
console.log(process.exitCode ? '\nNOE FEILET' : '\nAlt gikk gjennom')
