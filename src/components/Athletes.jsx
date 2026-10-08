import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PROFIL_FELT } from '../profil'
import { STATUS, fmt, days } from '../util'
import { useT } from '../i18n'
import { useTeamAssign, chipState, hasAnswered } from './useTeamAssign'
import HeadCoach from './HeadCoach.jsx'
import Lagkode from './Lagkode.jsx'
import { avtale } from '../avtale'

// Coach: per-athlete overview and status editing.
export default function Athletes({ team }) {
  const t = useT()
  const [athletes, setAthletes] = useState([])
  const [teamRaces, setTeamRaces] = useState([])
  const [statuses, setStatuses] = useState([])
  const [sel, setSel] = useState(null)
  const { byAthlete, apply, reload } = useTeamAssign(team.id)
  // Draft of which races this athlete should be assigned, saved in one go.
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  // Lagene jeg er trener for i dette huset, til «flytt til».
  const [grupper, setGrupper] = useState([])
  const lastGrupper = () => supabase.rpc('mine_grupper').then(({ data }) => setGrupper(data || []))
  // Løpere som har valgt skigymnaset selv og står der uten gruppe. Det er slik
  // en trener finner en løper som alt har registrert seg.
  const [ledige, setLedige] = useState([])
  const lastLedige = () => supabase.rpc('ledige_lopere').then(({ data }) => setLedige(data || []))
  useEffect(() => { lastGrupper(); lastLedige() }, [team.id])
  // FIS-poeng, siste økt og rennene i løpernes avtaler, til oversikten.
  const [poeng, setPoeng] = useState({})          // fis_code -> { sl, gs, sg, dh }
  const [sisteOkt, setSisteOkt] = useState({})    // athlete_id -> dato
  const [rennAv, setRennAv] = useState({})        // race_id -> race
  const [nyGruppe, setNyGruppe] = useState('')
  const [lagerGruppe, setLagerGruppe] = useState(false)
  const [gruppeFeil, setGruppeFeil] = useState(null)

  async function opprettGruppe(e) {
    e.preventDefault(); setLagerGruppe(true); setGruppeFeil(null)
    const { error } = await supabase.rpc('opprett_gruppe', { p_name: nyGruppe.trim() })
    setLagerGruppe(false)
    if (error) return setGruppeFeil(error.message)
    // Man står i den nye gruppa etterpå, så hele appen må lese laget på nytt.
    location.reload()
  }
  async function byttGruppe(id) {
    if (id === team.id) return
    const { error } = await supabase.rpc('bytt_gruppe', { p_team: id })
    if (error) return alert(error.message)
    location.reload()
  }

  async function hentInn(a) {
    const { error } = await supabase.rpc('flytt_loper', { p_athlete: a.id, p_team: team.id })
    if (error) return alert(error.message)
    load(); lastLedige(); lastGrupper()
  }

  async function flytt(a, til) {
    if (!til) return
    const { error } = await supabase.rpc('flytt_loper', { p_athlete: a.id, p_team: til })
    if (error) return alert(error.message)
    if (sel === a.id) setSel(null)
    load(); lastGrupper()
  }

  // Feil kode på avveie, eller noen som har sluttet. Før kunne bare løperen
  // selv gå ut, og det er feil vei: den som oppdager det er treneren.
  async function fjern(a) {
    if (!confirm(`Fjerne ${a.full_name || 'løperen'} fra laget? Lagets planer for henne forsvinner.`)) return
    const { error } = await supabase.rpc('fjern_fra_lag', { p_athlete: a.id })
    if (error) return alert(error.message)
    if (sel === a.id) setSel(null)
    load()
  }

  async function load() {
    const [{ data: a }, { data: tr }, { data: s }] = await Promise.all([
      supabase.from('profiles').select(PROFIL_FELT).eq('team_id', team.id).order('full_name'),
      supabase.from('team_races').select('race:races(*)').eq('team_id', team.id),
      supabase.from('athlete_races').select('*').eq('team_id', team.id)
    ])
    const lop = (a || []).filter(p => p.role === 'athlete')
    setAthletes(lop)
    setTeamRaces((tr || []).map(t => t.race).sort((x, y) => x.start_date.localeCompare(y.start_date)))
    setStatuses(s || [])
    const koder = lop.map(p => p.fis_code).filter(Boolean)
    if (koder.length) {
      const { data: f } = await supabase.from('fis_list_athletes').select('fis_code, sl, gs, sg, dh').in('fis_code', koder)
      setPoeng(Object.fromEntries((f || []).map(x => [x.fis_code, x])))
    }
    if (lop.length) {
      const { data: o } = await supabase.from('training_sessions').select('athlete_id, date').in('athlete_id', lop.map(p => p.id)).order('date', { ascending: false }).limit(400)
      const m = {}
      ;(o || []).forEach(x => { if (!(x.athlete_id in m)) m[x.athlete_id] = x.date })
      setSisteOkt(m)
    }
  }
  useEffect(() => { load() }, [team.id])

  const rowsFor = aid => byAthlete[aid] || []
  const rennIder = [...new Set(Object.values(byAthlete).flat().map(r => r.race_id))].sort((a, b) => a - b).join(',')
  useEffect(() => {
    if (!rennIder) { setRennAv({}); return }
    let av = false
    supabase.from('races').select('id, place, start_date, end_date').in('id', rennIder.split(',').map(Number))
      .then(({ data }) => { if (!av) setRennAv(Object.fromEntries((data || []).map(r => [r.id, r]))) })
    return () => { av = true }
  }, [rennIder])
  // Oversikten per løper: avtalte renn, hva som venter, og neste renn.
  const idag = new Date().toISOString().slice(0, 10)
  const oversikt = aid => {
    const rader = rowsFor(aid).map(r => ({ ...r, av: avtale(r), race: rennAv[r.race_id] }))
    const skal = rader.filter(r => ['avtalt', 'pameldt'].includes(r.av))
    const neste = skal.map(r => r.race).filter(r => r && r.end_date >= idag).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    return {
      renn: skal.length, dager: skal.reduce((s, r) => s + (r.race ? days(r.race) : 0), 0),
      venterDeg: rader.filter(r => r.av === 'venterTrener').length, venterLoper: rader.filter(r => r.av === 'venterLoper').length,
      neste
    }
  }
  const p1 = v => v == null ? '–' : Number(v).toFixed(2).replace('.', ',')
  const datoKort = d => d ? new Date(d + 'T12:00').toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'short' }) : '–'
  const assignedSet = aid => new Set(rowsFor(aid).filter(r => r.assigned).map(r => r.race_id))
  function openAthlete(aid) {
    setSel(aid); setDraft(aid ? assignedSet(aid) : null)
  }
  async function saveDraft() {
    const stored = assignedSet(sel)
    const add = [...draft].filter(r => !stored.has(r))
    const remove = [...stored].filter(r => !draft.has(r))
    setBusy(true)
    for (const rid of add) await apply(rid, [sel], [])
    for (const rid of remove) await apply(rid, [], [sel])
    setBusy(false)
    await load(); setDraft(assignedSet(sel))
  }

  const get = (aid, rid) => statuses.find(s => s.athlete_id === aid && s.race_id === rid)
  async function setStatus(aid, rid, status) {
    await supabase.from('athlete_races').upsert({ athlete_id: aid, race_id: rid, team_id: team.id, status, updated_at: new Date().toISOString() }, { onConflict: 'athlete_id,race_id' })
    load()
  }
  async function clear(aid, rid) { const s = get(aid, rid); if (s) { await supabase.from('athlete_races').delete().eq('id', s.id); load() } }
  const summary = aid => {
    const mine = teamRaces.filter(r => ['planned', 'entered'].includes(get(aid, r.id)?.status))
    return { n: mine.length, d: mine.reduce((s, r) => s + days(r), 0) }
  }

  const hus = grupper.find(g => g.er_hus)
  const valgtNavn = a => athletes.find(x => x.id === a)?.full_name

  return (
    <div className="page lp">
      <div className="lp-hode">
        <div>
          <h2>{t('athletes')} <span className="muted">({athletes.length})</span></h2>
          <p className="muted">{hus ? t('lpSubHouse').replace('{hus}', hus.name) : t('lpSub')}</p>
        </div>
      </div>

      {/* Gruppene som brikker: trykk for å bytte, og lag en ny i samme rad. */}
      {grupper.length > 0 && (
        <div className="lp-grupper">
          {grupper.map(g => (
            <button key={g.id} type="button" className={`lp-gruppe${g.id === team.id ? ' on' : ''}`}
              aria-pressed={g.id === team.id} onClick={() => byttGruppe(g.id)} title={g.eier_navn || ''}>
              <b>{g.name}</b>
              <span>{g.er_hus ? t('groupHouse') : g.eier_navn || '–'} · {g.lopere}</span>
            </button>
          ))}
          <form onSubmit={opprettGruppe} className="lp-nygruppe">
            <input value={nyGruppe} placeholder={t('grNamePh')} aria-label={t('grName')} onChange={e => setNyGruppe(e.target.value)} />
            <button className="btn small" disabled={lagerGruppe || nyGruppe.trim().length < 2}>{lagerGruppe ? t('grCreating') : t('grCreate')}</button>
          </form>
          {gruppeFeil && <p className="error" style={{ margin: 0 }}>{gruppeFeil}</p>}
        </div>
      )}

      {team.parent_team_id && ledige.length > 0 && (
        <div className="card cs-kort">
          <h2>{t('grWaitingTitle')} <span className="muted">({ledige.length})</span></h2>
          <p className="muted">{t('grWaitingSub')}</p>
          <ul className="gr-liste">
            {ledige.map(a => (
              <li key={a.id} className="gr-ledig">
                <span><b>{a.full_name || '–'}</b>
                  <span className="muted">{a.birth_year ? ` · ${a.birth_year}` : ''}{a.fis_code ? ` · FIS ${a.fis_code}` : ''}</span></span>
                <button type="button" className="btn small primary" onClick={() => hentInn(a)}>
                  {t('grTakeIn').replace('{g}', team.name)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        {athletes.length === 0 ? (
          <>
            <h2>{t('lpNoneTitle')}</h2>
            <p className="muted">{t('lpNoneSub')}</p>
            <Lagkode team={team} />
          </>
        ) : (
          <div className="ad-scroll">
            <table className="ad-table lp-tabell">
              <thead><tr>
                <th>{t('athleteCol')}</th><th>{t('mxYear')}</th><th className="tall">SL</th><th className="tall">GS</th>
                <th className="tall">{t('racesN')}</th><th>{t('lpWaiting')}</th><th>{t('lpNext')}</th><th>{t('lpLastSession')}</th><th></th>
              </tr></thead>
              <tbody>{athletes.map(a => {
                const o = oversikt(a.id), pp = poeng[a.fis_code] || {}
                return (
                  <tr key={a.id} className={sel === a.id ? 'on' : ''}>
                    <td><b>{a.full_name}</b>{a.fis_code ? <span className="muted lp-fis"> FIS {a.fis_code}</span> : <span className="tag warn lp-fis">{t('lpNoFis')}</span>}</td>
                    <td>{a.birth_year || '–'}</td>
                    <td className="tall">{p1(pp.sl)}</td><td className="tall">{p1(pp.gs)}</td>
                    <td className="tall">{o.renn}<span className="muted"> · {o.dager} {t('raceDaysN')}</span></td>
                    <td>
                      {o.venterDeg > 0 && <span className="tag av venterTrener">{o.venterDeg} {t('lpWaitYou')}</span>}
                      {o.venterLoper > 0 && <span className="tag av venterLoper">{o.venterLoper} {t('lpWaitAthlete')}</span>}
                      {!o.venterDeg && !o.venterLoper && <span className="muted">–</span>}
                    </td>
                    <td className="nobr">{o.neste ? <>{datoKort(o.neste.start_date)} <span className="muted">{o.neste.place}</span></> : <span className="muted">–</span>}</td>
                    <td className="nobr">{sisteOkt[a.id] ? datoKort(sisteOkt[a.id]) : <span className="muted">{t('lpNoSession')}</span>}</td>
                    <td>
                      <div className="ad-handlinger">
                        <button className="btn small" onClick={() => openAthlete(sel === a.id ? null : a.id)}>{sel === a.id ? t('close') : t('lpPlan')}</button>
                        {grupper.length > 1 && (
                          <select className="flytt" value="" aria-label={t('grMoveTo')} onChange={e => flytt(a, e.target.value)}>
                            <option value="">{t('grMoveTo')}</option>
                            {grupper.filter(g => g.id !== team.id).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        )}
                        <button className="btn small danger" onClick={() => fjern(a)}>{t('remove')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      {sel && (
        <div className="card">
          <h2>{valgtNavn(sel)} – {t('lpPlanTitle')}</h2>
          <p className="muted">{t('lpPlanSub')}</p>
          {teamRaces.length === 0 && <p className="muted">{t('coachEmpty')}</p>}
          <div className="assign-picks" style={{ marginBottom: 8 }}>
            <button className="btn small link" onClick={() => setDraft(new Set(teamRaces.filter(r => chipState(rowsFor(sel).find(x => x.race_id === r.id)) !== 'unavailable').map(r => r.id)))}>{t('pickAll')}</button>
            <button className="btn small link" onClick={() => setDraft(new Set())}>{t('pickNone')}</button>
          </div>
          <div className="ad-scroll">
          <table><tbody>{teamRaces.map(r => {
            const s = get(sel, r.id)
            const row = rowsFor(sel).find(x => x.race_id === r.id)
            const locked = chipState(row) === 'unavailable'
            const on = draft?.has(r.id)
            return (
            <tr key={r.id}>
              <td style={{ width: 28 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={!!on} disabled={locked}
                  onChange={() => setDraft(d => { const n = new Set(d); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} />
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmt(r)}</td>
              <td><b>{r.place}</b> <span className="muted">{r.category} · {r.events}</span>
                {row?.assigned && !hasAnswered(row) && <span className="tag warn">{t('noAnswer')}</span>}
                {s?.athlete_note && <div className="muted">Løper: «{s.athlete_note}»</div>}</td>
              <td><div className="status-btns">
                {Object.entries(STATUS).map(([k]) => <button key={k} className={s?.status === k ? `on st-${k}` : ''} onClick={() => setStatus(sel, r.id, k)}>{t('st_' + k)}</button>)}
                {s && <button onClick={() => clear(sel, r.id)}>×</button>}
              </div></td>
            </tr>) })}</tbody></table>
          </div>
          {draft && (() => {
            const stored = assignedSet(sel)
            const add = [...draft].filter(x => !stored.has(x)).length
            const rem = [...stored].filter(x => !draft.has(x)).length
            return (add || rem) ? (
              <div className="assign-save">
                <button className="btn small primary" disabled={busy} onClick={saveDraft}>
                  {busy ? t('saving') : `${t('save')} (${add ? '+' + add : ''}${add && rem ? ' / ' : ''}${rem ? '−' + rem : ''})`}
                </button>
                <button className="btn small" onClick={() => setDraft(assignedSet(sel))}>{t('cancel')}</button>
              </div>
            ) : null
          })()}
        </div>
      )}

      <HeadCoach />
      {athletes.length > 0 && (
        <div className="card">
          <h2>{t('lpInviteTitle')}</h2>
          <p className="muted">{t('lpInviteSub')}</p>
          <Lagkode team={team} />
        </div>
      )}
    </div>
  )
}
