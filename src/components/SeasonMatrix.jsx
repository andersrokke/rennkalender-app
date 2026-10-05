import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { MONTHS, days } from '../util'
import { useTeamAssign, chipState, isGoing } from './useTeamAssign'
import { avtale } from '../avtale'

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
  const [valgt, setVis] = useState(null)         // null = ikke valgt ennå | alle | venterTrener | venterLoper | avtalt
  // Siden åpner på det som venter på treneren, hvis det finnes noe.
  const vis = valgt ?? (rows.some(x => avtale(x) === 'venterTrener') ? 'venterTrener' : 'alle')
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

  // Hvor står hver rute, slik den er lagret? Brukes til tellingen og til å
  // vise bare det som venter.
  const lagret = (a, r) => avtale(cell(a, r))
  const antall = k => rows.filter(x => avtale(x) === k || (k === 'avtalt' && avtale(x) === 'pameldt')).length
  const treff = (a, r) => vis === 'alle' || lagret(a, r) === vis || (vis === 'avtalt' && lagret(a, r) === 'pameldt')
  const shownRaces = races.filter(r => athletes.some(a => treff(a.athlete_id, r.id)))
  const shownAthletes = athletes.filter(a => races.some(r => treff(a.athlete_id, r.id)))

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
  const KORT = { venterTrener: t('mxWants'), venterLoper: t('mxWaitAthlete'), avtalt: t('mxAgreed'), pameldt: t('st_entered') + ' ✓', kanIkke: t('st_unavailable') }
  const VALG = [['venterTrener', t('mxWaitYou'), antall('venterTrener')], ['venterLoper', t('mxWaitAthlete'), antall('venterLoper')],
    ['avtalt', t('mxAgreed'), antall('avtalt')], ['alle', t('mxAll'), rows.filter(x => avtale(x) !== 'ingen').length]]

  return (
    <div className="mx-page">
      <div className="mx-top">
        <div>
          <h2>{t('mxTitle')}</h2>
          <p>{t('matrixHint')}</p>
        </div>
      </div>

      <div className="mx-valg" role="tablist">
        {VALG.map(([k, navn, n]) => (
          <button key={k} type="button" role="tab" aria-selected={vis === k}
            className={`mx-chip ${k}${vis === k ? ' on' : ''}`} onClick={() => setVis(k)}>
            <b>{n}</b>{navn}
          </button>
        ))}
      </div>

      <div className="mx-card">
        <div className="mx-legend">
          <span><i className="venterTrener" />{t('mxLegWants')}</span>
          <span><i className="venterLoper" />{t('mxLegWaitAthlete')}</span>
          <span><i className="avtalt" />{t('mxLegAgreed')}</span>
          <span><i className="pameldt" />{t('st_entered')}</span>
          <span><i className="kanIkke" />{t('st_unavailable')}</span>
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
                      // Ruta viser hvor dere står hvis utkastet lagres.
                      const av = avtale({ status: c?.status ?? null, assigned: !!on, answered: c?.answered })
                      return (
                        <td key={r.id} className={`mcell ${av}${st === 'unavailable' ? ' unavailable' : ''}${forst.has(r.id) ? ' forst' : ''}`}
                          title={`${a.full_name} · ${r.place} · ${c?.status ? t('st_' + c.status) : t('noAnswer')}${c?.athlete_note ? ' · «' + c.athlete_note + '»' : ''}`}
                          onPointerDown={() => onDown(a.athlete_id, r.id)}
                          onPointerEnter={() => onEnter(a.athlete_id, r.id)}>
                          <span className="mpill">{KORT[av] || '+'}{c?.athlete_note && <i className="mnote" aria-label={t('note')} />}</span>
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
