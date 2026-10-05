import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { MONTHS, days } from '../util'
import { useTeamAssign, chipState, isGoing } from './useTeamAssign'

const key = (a, r) => `${a}|${r}`

// Athletes down, races across, so the coach can lay out a whole season at once.
// Colour is the athlete's own status, a dot means the coach assigned it — the
// same encoding as the chips in «Lagets sesong».
export default function SeasonMatrix({ team }) {
  const t = useT()
  const { rows, apply, loading } = useTeamAssign(team.id)
  const [races, setRaces] = useState([])
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ year: 'all', gender: 'all', disc: 'all', maxPts: '', month: 'all', cat: 'all' })
  const drag = useRef(null)

  // Rennene i matrisa er de team_race_athletes() gir: lagets plan pluss renn
  // løperne selv har lagt inn.
  const rennIder = [...new Set(rows.map(r => r.race_id))].sort((a, b) => a - b).join(',')
  useEffect(() => {
    if (!rennIder) { setRaces([]); return }
    let av = false
    supabase.from('races').select('*').in('id', rennIder.split(',').map(Number))
      .then(({ data }) => { if (!av) setRaces((data || []).sort((a, b) => a.start_date.localeCompare(b.start_date))) })
    return () => { av = true }
  }, [rennIder])

  const stored = useMemo(() => new Set(rows.filter(r => r.assigned).map(r => key(r.athlete_id, r.race_id))), [rows])
  useEffect(() => { setDraft(new Set(stored)) }, [stored])

  const athletes = useMemo(() => {
    const m = new Map()
    rows.forEach(r => m.set(r.athlete_id, r))
    return [...m.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name))
  }, [rows])
  const cell = (a, r) => rows.find(x => x.athlete_id === a && x.race_id === r)

  // --- filters -------------------------------------------------------------
  const years = [...new Set(athletes.map(a => a.birth_year).filter(Boolean))].sort()
  const cats = [...new Set(races.flatMap(r => (r.category || '').split(' • ')).filter(Boolean))].sort()
  const shownAthletes = athletes.filter(a =>
    (f.year === 'all' || String(a.birth_year) === f.year) &&
    (f.gender === 'all' || a.gender === f.gender) &&
    (!f.maxPts || (a[f.disc === 'all' ? 'gs' : f.disc.toLowerCase()] != null &&
      Number(a[f.disc === 'all' ? 'gs' : f.disc.toLowerCase()]) <= Number(f.maxPts))))
  const shownRaces = races.filter(r =>
    (f.month === 'all' || r.start_date.slice(0, 7) === f.month) &&
    (f.disc === 'all' || (r.events || '').includes(f.disc)) &&
    (f.cat === 'all' || (r.category || '').split(' • ').includes(f.cat)))

  const months = useMemo(() => {
    const out = []
    shownRaces.forEach(r => {
      const mk = r.start_date.slice(0, 7)
      const last = out[out.length - 1]
      if (last && last.mk === mk) last.count++
      else out.push({ mk, count: 1 })
    })
    return out
  }, [shownRaces])

  // --- draft ---------------------------------------------------------------
  const locked = (a, r) => chipState(cell(a, r)) === 'unavailable'
  const set = (a, r, on) => setDraft(d => {
    if (locked(a, r)) return d
    const n = new Set(d)
    on ? n.add(key(a, r)) : n.delete(key(a, r))
    return n
  })
  const toggleMany = (pairs, on) => setDraft(d => {
    const n = new Set(d)
    pairs.forEach(([a, r]) => { if (!locked(a, r)) on ? n.add(key(a, r)) : n.delete(key(a, r)) })
    return n
  })
  const rowPairs = a => shownRaces.map(r => [a, r.id])
  const colPairs = r => shownAthletes.map(a => [a.athlete_id, r])
  const allOn = pairs => pairs.every(([a, r]) => locked(a, r) || draft?.has(key(a, r)))

  // drag across cells: the first cell decides whether we are turning on or off
  const onDown = (a, r) => {
    if (locked(a, r)) return
    const on = !draft.has(key(a, r))
    drag.current = on
    set(a, r, on)
  }
  const onEnter = (a, r) => { if (drag.current !== null && drag.current !== undefined) set(a, r, drag.current) }
  useEffect(() => {
    const up = () => { drag.current = null }
    addEventListener('pointerup', up)
    return () => removeEventListener('pointerup', up)
  }, [])

  // load per athlete, reflecting the draft the coach is building
  const load = a => {
    const list = shownRaces.filter(r => {
      const c = cell(a, r.id)
      if (chipState(c) === 'unavailable') return false
      return draft?.has(key(a, r.id)) || isGoing(c)
    })
    return { n: list.length, d: list.reduce((s, r) => s + days(r), 0) }
  }

  const added = draft ? [...draft].filter(k => !stored.has(k)) : []
  const removed = draft ? [...stored].filter(k => !draft.has(k)) : []
  async function save() {
    setBusy(true)
    const byRace = {}
    added.forEach(k => { const [a, r] = k.split('|'); (byRace[r] = byRace[r] || { add: [], rem: [] }).add.push(a) })
    removed.forEach(k => { const [a, r] = k.split('|'); (byRace[r] = byRace[r] || { add: [], rem: [] }).rem.push(a) })
    for (const [r, v] of Object.entries(byRace)) await apply(Number(r), v.add, v.rem)
    setBusy(false)
  }

  if (loading) return <div className="page muted">{t('loading')}</div>
  if (!races.length) return <div className="page"><div className="card"><p className="muted">{t('coachEmpty')}</p></div></div>
  if (!athletes.length) return <div className="page"><div className="card"><p className="muted">{t('noAthletesYet')}</p></div></div>

  const Sel = ({ k, navn, opts }) => (
    <label>{navn}
      <select value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
  const mndLang = m => MONTHS[m] || (x => x.charAt(0).toUpperCase() + x.slice(1))(new Date(m + '-15').toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' }))
  const mnd = m => mndLang(m).slice(0, 3).toLowerCase()
  const datoer = r => {
    const a = r.start_date, b = r.end_date && r.end_date !== a ? r.end_date : null
    if (!b) return `${Number(a.slice(8))}. ${mnd(a.slice(0, 7))}`
    return a.slice(0, 7) === b.slice(0, 7)
      ? `${Number(a.slice(8))}.–${Number(b.slice(8))}. ${mnd(a.slice(0, 7))}`
      : `${Number(a.slice(8))}. ${mnd(a.slice(0, 7))} – ${Number(b.slice(8))}. ${mnd(b.slice(0, 7))}`
  }
  const grener = r => ['SL', 'GS', 'SG', 'DH', 'AC'].filter(g => (r.events || '').includes(g))
  // Første renn i hver måned får en strek foran seg, så månedene skilles nedover også.
  const forst = new Set(shownRaces.filter((r, i) => i === 0 || shownRaces[i - 1].start_date.slice(0, 7) !== r.start_date.slice(0, 7)).map(r => r.id))
  const KORT = { wish: t('st_wish'), planned: t('st_planned'), entered: t('st_entered') + ' ✓', unavailable: t('st_unavailable') }

  return (
    <div className="mx-page">
      <div className="mx-top">
        <div>
          <h2>{t('mxTitle')}</h2>
          <p>{t('matrixHint')}</p>
        </div>
        <div className="mx-tall">
          <div><b>{shownAthletes.length}</b><span>{t('athletesWord')}</span></div>
          <div><b>{shownRaces.length}</b><span>{t('racesN')}</span></div>
          <div><b>{draft ? draft.size : 0}</b><span>{t('mxAssigned')}</span></div>
        </div>
      </div>

      <div className="mx-filter">
        <Sel k="year" navn={t('mxYear')} opts={[['all', t('allYears')], ...years.map(y => [String(y), String(y)])]} />
        <Sel k="gender" navn={t('mxGender')} opts={[['all', t('allGenders')], ['W', t('women')], ['M', t('men')]]} />
        <label>{t('maxPoints')}
          <input type="number" placeholder="–" value={f.maxPts} onChange={e => setF(p => ({ ...p, maxPts: e.target.value }))} />
        </label>
        <span className="skille" />
        <Sel k="month" navn={t('mxMonth')} opts={[['all', t('allM')], ...[...new Set(races.map(r => r.start_date.slice(0, 7)))].sort().map(m => [m, mndLang(m)])]} />
        <Sel k="disc" navn={t('disc')} opts={[['all', t('mxAll')], ...['SL', 'GS', 'SG', 'DH'].map(d => [d, d])]} />
        <Sel k="cat" navn={t('cat')} opts={[['all', t('mxAll')], ...cats.map(c => [c, c])]} />
      </div>

      <div className="mx-card">
        <div className="mx-legend">
          <span><i style={{ background: 'color-mix(in srgb, var(--st-wish) 26%, var(--snow))' }} />{t('mxLegWish')}</span>
          <span><i style={{ background: 'color-mix(in srgb, var(--st-planned) 20%, var(--snow))' }} />{t('st_planned')}</span>
          <span><i style={{ background: 'var(--st-planned)' }} />{t('st_entered')}</span>
          <span><i style={{ background: 'color-mix(in srgb, var(--st-unavailable) 30%, var(--snow))' }} />{t('st_unavailable')}</span>
          <span><i className="tildelt" />{t('mxLegAssigned')}</span>
        </div>

        {(added.length > 0 || removed.length > 0) && (
          <div className="matrix-save">
            <span>{t('mxUnsaved')}</span>
            <button className="btn small primary" disabled={busy} onClick={save}>
              {busy ? t('saving') : `${t('save')} (${added.length ? '+' + added.length : ''}${added.length && removed.length ? ' / ' : ''}${removed.length ? '−' + removed.length : ''})`}
            </button>
            <button className="btn small" onClick={() => setDraft(new Set(stored))}>{t('undo')}</button>
          </div>
        )}

        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th className="corner" rowSpan={2}>{t('athleteCol')}</th>
                {months.map(m => <th key={m.mk} className="mhead" colSpan={m.count}>{mndLang(m.mk)}</th>)}
              </tr>
              <tr>
                {shownRaces.map(r => (
                  <th key={r.id} className={`rhead${forst.has(r.id) ? ' forst' : ''}`} title={`${r.place} · ${r.category} · ${r.events}`}
                    onClick={() => toggleMany(colPairs(r.id), !allOn(colPairs(r.id)))}>
                    <span className="rplace">{r.place}</span>
                    <span className="rdate">{datoer(r)}</span>
                    <span className="rev">{grener(r).map(g => <b key={g}>{g}</b>)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownAthletes.map(a => {
                const l = load(a.athlete_id)
                return (
                  <tr key={a.athlete_id}>
                    <th className="ahead" onClick={() => toggleMany(rowPairs(a.athlete_id), !allOn(rowPairs(a.athlete_id)))}>
                      <span className="aname">{a.full_name}</span>
                      <span className="aload">{l.n} {t('racesN')} · {l.d} {t('raceDaysN')}</span>
                    </th>
                    {shownRaces.map(r => {
                      const c = cell(a.athlete_id, r.id)
                      const st = chipState(c)
                      const on = draft?.has(key(a.athlete_id, r.id))
                      return (
                        <td key={r.id} className={`mcell ${st}${on ? ' assigned' : ''}${forst.has(r.id) ? ' forst' : ''}`}
                          title={`${a.full_name} · ${r.place} · ${c?.status ? t('st_' + c.status) : t('noAnswer')}`}
                          onPointerDown={() => onDown(a.athlete_id, r.id)}
                          onPointerEnter={() => onEnter(a.athlete_id, r.id)}>
                          <span className="mpill">{KORT[st] || (on ? t('mxAssignedCell') : '+')}</span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
