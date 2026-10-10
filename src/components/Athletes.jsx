import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { STATUS, fmt, days } from '../util'
import { useT } from '../i18n'
import { useTeamAssign, chipState, hasAnswered } from './useTeamAssign'
import HeadCoach from './HeadCoach.jsx'
import Lagkode from './Lagkode.jsx'
import { avtale } from '../avtale'

// Løperne i huset, og gruppene de står i. Én skjerm for alt: se alle, merk
// flere, flytt dem samlet, lag og døp grupper. Gruppene øverst er filtre, ikke
// noe man må «stå» i; velgeren i toppen av appen bytter fortsatt gruppe for
// sesongskjermene.
export default function Athletes({ team, filter: filterUtenfra = 'alle', onFilter = null, onGrupper = null }) {
  const t = useT()
  const [grupper, setGrupper] = useState([])
  const [lopere, setLopere] = useState([])
  const [filter, setFilterLokalt] = useState(filterUtenfra)   // alle | uten | <team id>
  useEffect(() => { setFilterLokalt(filterUtenfra) }, [filterUtenfra])
  const setFilter = f => { setFilterLokalt(f); onFilter?.(f) }
  const [sortKol, setSortKol] = useState('navn')
  const [sortOpp, setSortOpp] = useState(true)
  const [valgte, setValgte] = useState(new Set())
  const [flyttTil, setFlyttTil] = useState('')
  const [busy, setBusy] = useState(false)
  const [feil, setFeil] = useState(null)
  const [nyGruppe, setNyGruppe] = useState('')
  const [redigerer, setRedigerer] = useState(null)      // { id, navn }
  const [poeng, setPoeng] = useState({})
  const [sisteOkt, setSisteOkt] = useState({})
  const [rennAv, setRennAv] = useState({})
  const { byAthlete, apply, reload } = useTeamAssign(team.id)
  // Sesongplan per løper, bare for løpere i gruppa man står i.
  const [teamRaces, setTeamRaces] = useState([])
  const [statuses, setStatuses] = useState([])
  const [sel, setSel] = useState(null)
  const [draft, setDraft] = useState(null)
  const [planBusy, setPlanBusy] = useState(false)

  async function load() {
    const [{ data: g }, { data: l }, { data: tr }, { data: s }] = await Promise.all([
      supabase.rpc('hus_grupper'), supabase.rpc('hus_lopere'),
      supabase.from('team_races').select('race:races(*)').eq('team_id', team.id),
      supabase.from('athlete_races').select('*').eq('team_id', team.id)
    ])
    setGrupper(g || []); setLopere(l || [])
    setTeamRaces((tr || []).map(x => x.race).filter(Boolean).sort((x, y) => x.start_date.localeCompare(y.start_date)))
    setStatuses(s || [])
    const koder = (l || []).map(p => p.fis_code).filter(Boolean)
    if (koder.length) {
      const { data: f } = await supabase.from('fis_list_athletes').select('fis_code, sl, gs, sg, dh').in('fis_code', koder)
      setPoeng(Object.fromEntries((f || []).map(x => [x.fis_code, x])))
    }
    if (l?.length) {
      const { data: o } = await supabase.from('training_sessions').select('athlete_id, date').in('athlete_id', l.map(p => p.id)).order('date', { ascending: false }).limit(600)
      const m = {}
      ;(o || []).forEach(x => { if (!(x.athlete_id in m)) m[x.athlete_id] = x.date })
      setSisteOkt(m)
    }
  }
  useEffect(() => { load() }, [team.id])

  const hus = grupper.find(g => g.er_hus)
  const bareGrupper = grupper.filter(g => !g.er_hus)
  const gruppeNavn = id => grupper.find(g => g.id === id)?.name || '–'
  const vistUsortert = useMemo(() => lopere.filter(a => filter === 'alle' || (filter === 'uten' ? a.team_id === hus?.id : a.team_id === filter)), [lopere, filter, hus])
  const utenGruppe = lopere.filter(a => a.team_id === hus?.id).length

  const kall = async (fn, args, etter) => {
    setBusy(true); setFeil(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { setFeil(error.message); return false }
    etter?.(); await load(); await reload(); onGrupper?.()
    return true
  }
  const flyttValgte = () => flyttTil && kall('flytt_lopere', { p_athletes: [...valgte], p_team: flyttTil }, () => { setValgte(new Set()); setFlyttTil('') })
  const flyttEn = (a, til) => til && kall('flytt_lopere', { p_athletes: [a.id], p_team: til })
  const opprett = async e => { e.preventDefault(); if (await kall('opprett_gruppe', { p_name: nyGruppe.trim() })) { setNyGruppe(''); location.reload() } }
  const lagreNavn = () => redigerer && kall('gi_gruppenavn', { p_team: redigerer.id, p_name: redigerer.navn.trim() }, () => setRedigerer(null))
  const slett = g => confirm(t('grDeleteConfirm').replace('{n}', g.name)) && kall('slett_gruppe', { p_team: g.id }, () => { if (filter === g.id) setFilter('alle') })
  async function fjern(a) {
    if (!confirm(t('lpRemoveConfirm').replace('{n}', a.full_name || ''))) return
    await kall('fjern_fra_lag', { p_athlete: a.id })
  }
  const vippValgt = id => setValgte(v => { const n = new Set(v); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Oversikt per løper: avtalte renn, hva som venter, neste renn.
  const rowsFor = aid => byAthlete[aid] || []
  const rennIder = [...new Set(Object.values(byAthlete).flat().map(r => r.race_id))].sort((a, b) => a - b).join(',')
  useEffect(() => {
    if (!rennIder) { setRennAv({}); return }
    let av = false
    supabase.from('races').select('id, place, start_date, end_date').in('id', rennIder.split(',').map(Number))
      .then(({ data }) => { if (!av) setRennAv(Object.fromEntries((data || []).map(r => [r.id, r]))) })
    return () => { av = true }
  }, [rennIder])
  const idag = new Date().toISOString().slice(0, 10)
  const oversikt = aid => {
    const rader = rowsFor(aid).map(r => ({ ...r, av: avtale(r), race: rennAv[r.race_id] }))
    const skal = rader.filter(r => ['avtalt', 'pameldt'].includes(r.av))
    const neste = skal.map(r => r.race).filter(r => r && r.end_date >= idag).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    return { renn: skal.length, dager: skal.reduce((s, r) => s + (r.race ? days(r.race) : 0), 0),
      venterDeg: rader.filter(r => r.av === 'venterTrener').length, venterLoper: rader.filter(r => r.av === 'venterLoper').length, neste }
  }
  // Sortering på alle kolonnene, tomme verdier sist.
  const sortVerdi = (a, k) => {
    const o = () => oversikt(a.id), pp = poeng[a.fis_code] || {}
    switch (k) {
      case 'gruppe': return gruppeNavn(a.team_id)
      case 'aar': return a.birth_year ?? null
      case 'sl': return pp.sl == null ? null : Number(pp.sl)
      case 'gs': return pp.gs == null ? null : Number(pp.gs)
      case 'renn': return o().renn
      case 'venter': return o().venterDeg + o().venterLoper
      case 'neste': return o().neste?.start_date ?? null
      case 'okt': return sisteOkt[a.id] ?? null
      default: return a.full_name || ''
    }
  }
  const vist = useMemo(() => [...vistUsortert].sort((a, b) => {
    const x = sortVerdi(a, sortKol), y = sortVerdi(b, sortKol)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    const r = typeof x === 'string' ? x.localeCompare(y, 'nb') : x - y
    return sortOpp ? r : -r
  }), [vistUsortert, sortKol, sortOpp, poeng, sisteOkt, byAthlete, rennAv])
  const alleVistValgt = vist.length > 0 && vist.every(a => valgte.has(a.id))
  const sorterPa = k => { if (sortKol === k) setSortOpp(v => !v); else { setSortKol(k); setSortOpp(k !== 'sl' && k !== 'gs' && k !== 'renn' && k !== 'venter' && k !== 'okt') } }
  const Th = ({ k, children, cls = '' }) => (
    <th className={cls} aria-sort={sortKol === k ? (sortOpp ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="rh-sort" onClick={() => sorterPa(k)}>{children}<span aria-hidden="true">{sortKol === k ? (sortOpp ? ' ▲' : ' ▼') : ''}</span></button>
    </th>
  )
  const p1 = v => v == null ? '–' : Number(v).toFixed(2).replace('.', ',')
  const datoKort = d => d ? new Date(d + 'T12:00').toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'short' }) : '–'

  // Sesongplan per løper (som før).
  const assignedSet = aid => new Set(rowsFor(aid).filter(r => r.assigned).map(r => r.race_id))
  const openAthlete = aid => { setSel(aid); setDraft(aid ? assignedSet(aid) : null) }
  async function saveDraft() {
    const stored = assignedSet(sel)
    const add = [...draft].filter(r => !stored.has(r)), remove = [...stored].filter(r => !draft.has(r))
    setPlanBusy(true)
    for (const rid of add) await apply(rid, [sel], [])
    for (const rid of remove) await apply(rid, [], [sel])
    setPlanBusy(false)
    await load(); setDraft(assignedSet(sel))
  }
  const get = (aid, rid) => statuses.find(s => s.athlete_id === aid && s.race_id === rid)
  async function setStatus(aid, rid, status) {
    await supabase.from('athlete_races').upsert({ athlete_id: aid, race_id: rid, team_id: team.id, status, updated_at: new Date().toISOString() }, { onConflict: 'athlete_id,race_id' })
    load()
  }
  async function clear(aid, rid) { const s = get(aid, rid); if (s) { await supabase.from('athlete_races').delete().eq('id', s.id); load() } }
  const valgtNavn = a => lopere.find(x => x.id === a)?.full_name

  return (
    <div className="page lp">
      <div className="lp-hode">
        <div>
          <h2>{t('athletes')} <span className="muted">({lopere.length})</span></h2>
          <p className="muted">{hus ? t('lpSubHus').replace('{hus}', hus.name) : t('lpSub')}</p>
        </div>
      </div>

      {/* Gruppene som filter. Huset = uten gruppe. */}
      <div className="lp-grupper">
        <button type="button" className={`lp-gruppe${filter === 'alle' ? ' on' : ''}`} onClick={() => setFilter('alle')}>
          <b>{t('mxAll')}</b><span>{lopere.length}</span>
        </button>
        {utenGruppe > 0 && (
          <button type="button" className={`lp-gruppe uten${filter === 'uten' ? ' on' : ''}`} onClick={() => setFilter('uten')}>
            <b>{t('adNoGroup')}</b><span>{utenGruppe}</span>
          </button>
        )}
        {bareGrupper.map(g => (
          <button key={g.id} type="button" className={`lp-gruppe${filter === g.id ? ' on' : ''}`} onClick={() => setFilter(g.id)} title={g.eier_navn || ''}>
            <b>{g.name}{g.id === team.id && <em className="lp-her"> · {t('grCurrent')}</em>}</b>
            <span>{g.eier_navn || '–'} · {g.lopere}</span>
          </button>
        ))}
        <form onSubmit={opprett} className="lp-nygruppe">
          <input value={nyGruppe} placeholder={t('grNamePh')} aria-label={t('grName')} onChange={e => setNyGruppe(e.target.value)} />
          <button className="btn small" disabled={busy || nyGruppe.trim().length < 2}>{t('grCreate')}</button>
        </form>
      </div>
      {feil && <p className="error" style={{ margin: 0 }}>{feil}</p>}

      {valgte.size > 0 && (
        <div className="lp-flytt">
          <b>{t('lpSelected').replace('{n}', valgte.size)}</b>
          <select value={flyttTil} onChange={e => setFlyttTil(e.target.value)} aria-label={t('grMoveTo')}>
            <option value="">{t('grMoveTo')}</option>
            {bareGrupper.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            {hus && <option value={hus.id}>{t('adNoGroup')}</option>}
          </select>
          <button type="button" className="btn small primary" disabled={!flyttTil || busy} onClick={flyttValgte}>{t('lpMove')}</button>
          <button type="button" className="btn small" onClick={() => setValgte(new Set())}>{t('cancel')}</button>
        </div>
      )}

      <div className="card">
        {lopere.length === 0 ? (
          <>
            <h2>{t('lpNoneTitle')}</h2>
            <p className="muted">{t('lpNoneSub')}</p>
            <Lagkode team={team} />
          </>
        ) : (
          <div className="ad-scroll">
            <table className="ad-table lp-tabell">
              <thead><tr>
                <th><input type="checkbox" aria-label={t('pickAll')} checked={alleVistValgt} onChange={() => setValgte(alleVistValgt ? new Set() : new Set(vist.map(a => a.id)))} /></th>
                <Th k="navn">{t('athleteCol')}</Th><Th k="gruppe">{t('lpGroupCol')}</Th><Th k="aar">{t('mxYear')}</Th><Th k="sl" cls="tall">SL</Th><Th k="gs" cls="tall">GS</Th>
                <Th k="renn" cls="tall">{t('racesN')}</Th><Th k="venter">{t('lpWaiting')}</Th><Th k="neste">{t('lpNext')}</Th><Th k="okt">{t('lpLastSession')}</Th><th></th>
              </tr></thead>
              <tbody>{vist.map(a => {
                const o = oversikt(a.id), pp = poeng[a.fis_code] || {}
                return (
                  <tr key={a.id} className={sel === a.id ? 'on' : valgte.has(a.id) ? 'valgt' : ''}>
                    <td><input type="checkbox" checked={valgte.has(a.id)} onChange={() => vippValgt(a.id)} aria-label={a.full_name} /></td>
                    <td><b>{a.full_name}</b>{a.fis_code ? <span className="muted lp-fis"> FIS {a.fis_code}</span> : <span className="tag warn lp-fis">{t('lpNoFis')}</span>}</td>
                    <td>
                      <select className="flytt" value={a.team_id} disabled={busy} aria-label={t('grMoveTo')} onChange={e => flyttEn(a, e.target.value)}>
                        {hus && <option value={hus.id}>{t('adNoGroup')}</option>}
                        {bareGrupper.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </td>
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
                        {a.team_id === team.id && <button className="btn small" onClick={() => openAthlete(sel === a.id ? null : a.id)}>{sel === a.id ? t('close') : t('lpPlan')}</button>}
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

      {bareGrupper.length > 0 && (
        <div className="card">
          <h3>{t('grTitle')}</h3>
          <p className="muted">{t('lpGroupsSub')}</p>
          <ul className="lp-gruppeliste">
            {bareGrupper.map(g => (
              <li key={g.id}>
                {redigerer?.id === g.id ? (
                  <form onSubmit={e => { e.preventDefault(); lagreNavn() }} className="lp-nygruppe">
                    <input value={redigerer.navn} autoFocus onChange={e => setRedigerer(r => ({ ...r, navn: e.target.value }))} />
                    <button className="btn small primary" disabled={busy}>{t('save')}</button>
                    <button type="button" className="btn small" onClick={() => setRedigerer(null)}>{t('cancel')}</button>
                  </form>
                ) : (
                  <>
                    <b>{g.name}</b>
                    <span className="muted">{g.eier_navn || '–'} · {g.lopere} {t('athletesWord')} · {t('lpCode')} <code>{g.invite_code || '–'}</code></span>
                    <span className="lp-gruppeknapper">
                      {g.min && <button type="button" className="btn small" onClick={() => setRedigerer({ id: g.id, navn: g.name })}>{t('adRename')}</button>}
                      {g.min && g.lopere === 0 && <button type="button" className="btn small danger" onClick={() => slett(g)}>{t('remove')}</button>}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
                {s?.athlete_note && <div className="muted">«{s.athlete_note}»</div>}</td>
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
                <button className="btn small primary" disabled={planBusy} onClick={saveDraft}>
                  {planBusy ? t('saving') : `${t('save')} (${add ? '+' + add : ''}${add && rem ? ' / ' : ''}${rem ? '−' + rem : ''})`}
                </button>
                <button className="btn small" onClick={() => setDraft(assignedSet(sel))}>{t('cancel')}</button>
              </div>
            ) : null
          })()}
        </div>
      )}

      <HeadCoach />
      {lopere.length > 0 && (
        <div className="card">
          <h2>{t('lpInviteTitle')}</h2>
          <p className="muted">{t('lpInviteSub2')}</p>
          <Lagkode team={team} />
        </div>
      )}
    </div>
  )
}
