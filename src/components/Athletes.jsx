import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { STATUS, fmt, days } from '../util'
import { useT } from '../i18n'
import { useTeamAssign, chipState, hasAnswered } from './useTeamAssign'

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

  async function load() {
    const [{ data: a }, { data: tr }, { data: s }] = await Promise.all([
      supabase.from('profiles').select('*').eq('team_id', team.id).order('full_name'),
      supabase.from('team_races').select('race:races(*)').eq('team_id', team.id),
      supabase.from('athlete_races').select('*').eq('team_id', team.id)
    ])
    setAthletes((a || []).filter(p => p.role === 'athlete'))
    setTeamRaces((tr || []).map(t => t.race).sort((x, y) => x.start_date.localeCompare(y.start_date)))
    setStatuses(s || [])
  }
  useEffect(() => { load() }, [team.id])

  const rowsFor = aid => byAthlete[aid] || []
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

  return (
    <div className="page">
      <div className="card">
        <h2>Løpere</h2>
        {athletes.length === 0 && <p className="muted">Ingen løpere ennå. Del invitasjonskoden under «Lag og profil».</p>}
        <table><thead><tr><th>Navn</th><th>Årgang</th><th>FIS-kode</th><th>Renn</th><th>Renndager</th><th></th></tr></thead>
          <tbody>{athletes.map(a => { const s = summary(a.id); return (
            <tr key={a.id}><td>{a.full_name}</td><td>{a.birth_year || '–'}</td><td>{a.fis_code || '–'}</td><td>{s.n}</td><td>{s.d}</td>
              <td><button className="btn small" onClick={() => openAthlete(sel === a.id ? null : a.id)}>{sel === a.id ? 'Lukk' : 'Planlegg'}</button></td></tr>) })}
          </tbody></table>
      </div>

      {sel && (
        <div className="card">
          <h2>{athletes.find(a => a.id === sel)?.full_name} – sesongplan</h2>
          <p className="muted">Sett status per renn. Løperen ser dette i «Min sesong» og kan svare med ønske/kan ikke.</p>
          {teamRaces.length === 0 && <p className="muted">Laget har ingen renn i planen ennå.</p>}
          <div className="assign-picks" style={{ marginBottom: 8 }}>
            <button className="btn small link" onClick={() => setDraft(new Set(teamRaces.filter(r => chipState(rowsFor(sel).find(x => x.race_id === r.id)) !== 'unavailable').map(r => r.id)))}>{t('pickAll')}</button>
            <button className="btn small link" onClick={() => setDraft(new Set())}>{t('pickNone')}</button>
          </div>
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
    </div>
  )
}
