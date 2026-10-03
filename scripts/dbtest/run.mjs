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



// --- grupper for alle trenere i huset ---
// Kari (C1) eier G1 under P. Hun oppretter en gruppe til: den skal havne
// under P, eies av henne, og hun skal stå i den etterpå.
const u16 = (await as(C1, `select public.opprett_gruppe('Teknikk U16') as id`)).rows[0].id
const u16rad = await q('select parent_team_id, owner_id from teams where id=$1', [u16])
const c1na = await q('select team_id from profiles where id=$1', [C1])
u16rad[0].parent_team_id === P && u16rad[0].owner_id === C1 && c1na[0].team_id === u16
  ? ok('en gruppetrener opprettet en gruppe til under huset, og står i den') : fail(`opprett_gruppe: ${JSON.stringify([u16rad[0], c1na[0]])}`)
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

// Selverklært trener: setter rollen selv og går inn med lagkoden.
await as(SX, `update profiles set role = 'coach' where id = $1`, [SX])
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
