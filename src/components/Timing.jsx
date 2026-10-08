import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import TimingImport from './TimingImport.jsx'

// Mellomtidsanalyse: hvor i løypa tid går tapt.
//
// Dette er spørsmålet videoanalyse selges på, men mellomtidene alene svarer på
// det meste av det - uten GPS, uten kamera. Grunnlaget er timing_runs, som
// allerede lå i basen ubrukt.
//
// KONVENSJON: splits_ms er kumulative mellomtider fra start, i millisekunder,
// én per passerte node. run_time_ms er totaltiden. Siste seksjon regnes som
// run_time_ms minus siste mellomtid. Importen må følge den samme konvensjonen.

export const s2 = (ms, lang) => (ms / 1000).toLocaleString(lang === 'en' ? 'en-GB' : 'nb-NO',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const delta = (ms, lang) =>
  ms === 0 ? (lang === 'en' ? '±0.00' : '±0,00')
    : (ms > 0 ? '+' : '−') + s2(Math.abs(ms), lang)

// Seksjonstider fra kumulative mellomtider. Null hvis løpet ikke er fullført,
// eller hvis tallene ikke stiger - da er raden noe annet enn vi tror.
export function sections(run) {
  if (run.run_time_ms == null) return null
  const sp = (run.splits_ms || []).filter(v => v != null && v > 0)
  const out = []
  let prev = 0
  for (const v of sp) { out.push(v - prev); prev = v }
  out.push(run.run_time_ms - prev)
  return out.every(v => v > 0) ? out : null
}

// Referansen er beste seksjonstid i økta, ikke beste totaltid. En løper kan ha
// beste seksjon uten å ha beste løp, og det er nettopp det man leter etter.
export function buildTable(runs) {
  const withSec = runs.map(r => ({ run: r, sec: sections(r) })).filter(x => x.sec)
  if (!withSec.length) return null
  const n = Math.max(...withSec.map(x => x.sec.length))
  // Uten mellomtider blir «seksjon 1» bare totaltiden om igjen.
  if (n < 2) return null
  // Løp med færre passeringer faller ut: de er ikke sammenlignbare seksjon for
  // seksjon. Samme økt betyr som regel samme løype, så det er sjelden.
  const usable = withSec.filter(x => x.sec.length === n)
  if (!usable.length) return null
  return {
    n,
    best: Array.from({ length: n }, (_, i) => Math.min(...usable.map(x => x.sec[i]))),
    bestTotal: Math.min(...usable.map(x => x.run.run_time_ms)),
    rows: usable
  }
}

// Hvor løperen selv taper mest, i snitt over egne løp i økta.
export function ownLoss(table, athleteId) {
  if (!table) return null
  const own = table.rows.filter(x => x.run.athlete_id === athleteId)
  if (!own.length) return null
  const lost = Array.from({ length: table.n }, (_, i) =>
    own.reduce((a, x) => a + (x.sec[i] - table.best[i]), 0) / own.length)
  let worst = 0
  lost.forEach((v, i) => { if (v > lost[worst]) worst = i })
  // Er hun raskest overalt, taper hun ikke tid noe sted.
  if (lost[worst] <= 0) return null
  return { lost, worst, runs: own.length }
}

export function SplitTable({ table, t }) {
  return (
    <div className="tm-wrap">
      <table className="tm">
        <thead>
          <tr>
            <th>{t('tmRun')}</th>
            {Array.from({ length: table.n }, (_, i) => <th key={i}>{t('tmSection')} {i + 1}</th>)}
            <th>{t('tmTotal')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="tm-ref">
            <td>{t('tmBest')}</td>
            {table.best.map((v, i) => <td key={i}>{s2(v, t.lang)}</td>)}
            <td>{s2(table.bestTotal, t.lang)}</td>
          </tr>
          {table.rows.map(({ run, sec }) => {
            // Verste seksjon i nettopp dette løpet, så blikket lander der.
            let worst = 0
            sec.forEach((v, i) => { if (v - table.best[i] > sec[worst] - table.best[worst]) worst = i })
            return (
              <tr key={run.id}>
                <td>
                  {run.athlete?.full_name || run.source_name}
                  {run.run_no != null && <em> · {t('tmRunNo')} {run.run_no}</em>}
                </td>
                {sec.map((v, i) => {
                  const d = v - table.best[i]
                  const cls = d === 0 ? 'tm-best' : i === worst ? 'tm-worst' : 'tm-lost'
                  return <td key={i} className={cls}>{d === 0 ? s2(v, t.lang) : delta(d, t.lang)}</td>
                })}
                <td className={run.run_time_ms === table.bestTotal ? 'tm-best' : ''}>
                  {s2(run.run_time_ms, t.lang)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Løpene per løper: beste, snitt og hvert enkelt løp. Dette er det treneren
// og løperen leser først; mellomtidene er et tillegg når tidtakeren har dem.
// Ukoblede løp grupperes på navnet fra fila, så de ikke forsvinner.
export function perLoper(runs) {
  const m = new Map()
  for (const r of runs) {
    const k = r.athlete_id || `kilde:${r.source_name}`
    const x = m.get(k) || { k, navn: r.athlete?.full_name || r.source_name, koblet: !!r.athlete_id, lop: [] }
    x.lop.push(r)
    m.set(k, x)
  }
  const ut = [...m.values()].map(x => {
    const tider = x.lop.filter(r => r.run_time_ms != null).map(r => r.run_time_ms)
    return { ...x, beste: tider.length ? Math.min(...tider) : null, snitt: tider.length ? tider.reduce((a, b) => a + b, 0) / tider.length : null,
      fullfort: tider.length, lop: [...x.lop].sort((a, b) => (a.run_no ?? 0) - (b.run_no ?? 0)) }
  })
  const oktBeste = ut.filter(x => x.beste != null).length ? Math.min(...ut.filter(x => x.beste != null).map(x => x.beste)) : null
  // Koblede først, så raskest først; navn uten tider sist.
  ut.sort((a, b) => Number(b.koblet) - Number(a.koblet) || (a.beste ?? Infinity) - (b.beste ?? Infinity) || a.navn.localeCompare(b.navn, 'nb'))
  return { rader: ut, oktBeste }
}

function LopTabell({ data, t, bareEgen = null }) {
  const rader = bareEgen ? data.rader.filter(x => x.k === bareEgen) : data.rader
  if (!rader.length) return null
  return (
    <div className="tm-wrap">
      <table className="tm tm-lop">
        <thead><tr>
          <th>{t('athleteCol')}</th><th>{t('tmRuns')}</th><th>{t('tmBest')}</th><th>{t('tmAvg')}</th><th className="tm-alle">{t('tmEach')}</th>
        </tr></thead>
        <tbody>
          {rader.map(x => (
            <tr key={x.k} className={x.koblet ? '' : 'tm-ukoblet'}>
              <td>{x.navn}{!x.koblet && <em> · {t('tmUnlinked')}</em>}</td>
              <td>{x.fullfort}{x.lop.length > x.fullfort && <em> / {x.lop.length}</em>}</td>
              <td className={x.beste != null && x.beste === data.oktBeste ? 'tm-best' : ''}>
                {x.beste == null ? '–' : <>{s2(x.beste, t.lang)}{data.oktBeste != null && x.beste !== data.oktBeste && <em> {delta(x.beste - data.oktBeste, t.lang)}</em>}</>}
              </td>
              <td>{x.snitt == null ? '–' : s2(x.snitt, t.lang)}</td>
              <td className="tm-alle">
                <span className="tm-lopliste">
                  {x.lop.map(r => (
                    <span key={r.id} className={`tm-ett${r.run_time_ms == null ? ' dnf' : r.run_time_ms === x.beste ? ' beste' : ''}`}
                      title={`${t('tmRunNo')} ${r.run_no ?? '–'}${r.bib ? ' · bib ' + r.bib : ''}`}>
                      {r.run_time_ms == null ? (r.status || 'DNF') : s2(r.run_time_ms, t.lang)}
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Timing({ profile, team = null, isCoach = false }) {
  const t = useT()
  const [imports, setImports] = useState([])
  const [pick, setPick] = useState(null)
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const kanLasteOpp = isCoach && !!team

  // RLS avgjør hva som er synlig: egne løp, barnas, eller lagets hvis du er
  // trener. Spørringen trenger ingen ekstra filtrering.
  useEffect(() => {
    let alive = true
    supabase.from('timing_imports')
      .select('id, session_date, discipline, venue, note, rows_total, rows_mapped')
      .order('session_date', { ascending: false }).limit(40)
      .then(({ data }) => {
        if (!alive) return
        setImports(data || [])
        setPick(p => (p && (data || []).some(i => i.id === p)) ? p : data?.[0]?.id || null)
        setLoading(false)
      })
    return () => { alive = false }
  }, [profile.id, nonce])

  async function slettOkt() {
    if (!pick || !window.confirm(t('tiDeleteConfirm'))) return
    const { error } = await supabase.from('timing_imports').delete().eq('id', pick)
    if (error) return alert(error.message)
    setPick(null); setNonce(n => n + 1)
  }
  const etterOpplasting = id => { setPick(id); setNonce(n => n + 1) }

  useEffect(() => {
    if (!pick) return setRuns([])
    let alive = true
    supabase.from('timing_runs')
      .select('id, run_no, bib, source_name, run_time_ms, splits_ms, status, athlete_id, athlete:profiles!timing_runs_athlete_id_fkey(id, full_name)')
      .eq('import_id', pick).order('run_no', { ascending: true })
      .then(({ data }) => { if (alive) setRuns(data || []) })
    return () => { alive = false }
  }, [pick])

  const table = useMemo(() => buildTable(runs), [runs])
  const lopene = useMemo(() => perLoper(runs), [runs])
  const mine = useMemo(() => ownLoss(table, profile.id), [table, profile.id])
  const session = imports.find(i => i.id === pick)
  const dnf = runs.filter(r => r.run_time_ms == null).length

  if (loading) return null

  if (!imports.length) return (
    <div className="card">
      <h2>{t('tmTitle')}</h2>
      <p className="muted">{kanLasteOpp ? t('tiEmptyCoach') : t('tmEmpty')}</p>
      {kanLasteOpp && <TimingImport team={team} profile={profile} onLagret={etterOpplasting} />}
    </div>
  )

  return (
    <div className="card">
      <h2>{t('tmTitle')}</h2>
      <p className="muted">{t('tmSub')}</p>
      {kanLasteOpp && <TimingImport team={team} profile={profile} onLagret={etterOpplasting} />}

      {imports.length > 1 && (
        <div className="row" style={{ margin: '12px 0' }}>
          <select style={{ width: 'auto' }} value={pick || ''} onChange={e => setPick(e.target.value)}>
            {imports.map(i => (
              <option key={i.id} value={i.id}>
                {i.session_date} · {i.discipline || '–'}{i.venue ? ` · ${i.venue}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {session && (
        <p className="muted">
          {session.rows_mapped} {t('tmOfRuns')} {session.rows_total} {t('tmMapped')}
          {session.note && <> · {session.note}</>}
        </p>
      )}

      {/* Løperen ser bare sine egne løp; treneren ser alle. Foreldre får
          barnets, siden RLS bare gir dem de radene. */}
      <LopTabell data={lopene} t={t} bareEgen={isCoach ? null : (lopene.rader.some(x => x.k === profile.id) ? profile.id : null)} />

      {table && (
        <>
          <h3 className="tm-h3">{t('tmSplitsTitle')}</h3>
          {mine && (
            <p className="tm-lead">
              {t('tmYouLose')} <b>{t('tmSection')} {mine.worst + 1}</b>
              {' '}<span className="tm-bad">{delta(mine.lost[mine.worst], t.lang)}</span>
              {' '}{mine.runs > 1 ? t('tmPerRun') : t('tmThisRun')}
            </p>
          )}
          <SplitTable table={table} t={t} />
          <p className="muted tm-note">{t('tmNote')}</p>
        </>
      )}

      {dnf > 0 && <p className="muted">{dnf} {t('tmDnf')}</p>}
      {kanLasteOpp && pick && (
        <div style={{ marginTop: 12 }}><button type="button" className="btn small link" onClick={slettOkt}>{t('tiDelete')}</button></div>
      )}
    </div>
  )
}
