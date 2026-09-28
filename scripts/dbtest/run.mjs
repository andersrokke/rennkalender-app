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
import { readFileSync, readdirSync } from 'node:fs'
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

const pgdb = new EmbeddedPostgres({ databaseDir: join(HER, '.data'), user: 'postgres', password: 'x', port: PORT, persistent: false })
await pgdb.initialise(); await pgdb.start()
const c = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'x', database: 'postgres' })
await c.connect()

const fail = m => { console.error('FEIL  ' + m); process.exitCode = 1 }
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
const want = ['admin_note','area','author_id','body','created_at','id','kind','status','title','updated_at','user_agent']
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
try { await as(L2, 'select public.join_team($1)', [g1kode]); fail('den gamle koden virket fortsatt') }
catch (e) { e.message.includes('Ugyldig') ? ok('den gamle koden er ugyldig etter bytte') : fail(e.message) }
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
// Rett innsetting, slik «Opprett lag»-skjermen gjorde det: default-verdien
// invite_code kjøres da med brukerens egne rettigheter.
try {
  await as(NYT, `insert into teams(name,owner_id) values ('Rett inn',$1)`, [NYT])
  ok('en innlogget bruker kan sette inn et lag direkte (default-verdien virker)')
} catch (e) { fail(`direkte innsetting: ${e.message}`) }
const viaFn = await as(NYT, `select public.create_coach_team('Via funksjon','Testklubben') as id`)
const nyRad = await q('select name, club from teams where id=$1', [viaFn.rows[0].id])
nyRad[0].club === 'Testklubben' ? ok('create_coach_team tar imot klubb') : fail('klubb ble ikke satt')
const nyeKoder = await q(`select invite_code from teams where name in ('Rett inn','Via funksjon')`)
nyeKoder.length === 2 && nyeKoder.every(k => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(k.invite_code))
  ? ok('begge nye lag fikk en lesbar kode') : fail(`koder: ${JSON.stringify(nyeKoder)}`)


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
    const ok = (await q(`select has_table_privilege('authenticated', 'public.' || $1, $2) as ok`, [tabell, priv]))[0].ok
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
if (!revFeil) ok('rettighetsrevisjon: ingen avvik')

// Lukk klienten først; ellers svarer serveren med «terminating connection»
// mens den stenges, og en ren kjøring ser ut som en krasj.
await c.end()
await pgdb.stop()
console.log(process.exitCode ? '\nNOE FEILET' : '\nAlt gikk gjennom')
