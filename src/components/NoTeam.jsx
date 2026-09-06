import { useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Fallback for a coach without a team (team deleted, or profile edited by hand).
// The coach tabs all read team.id, so they get this instead.
export default function NoTeam({ profile, onDone }) {
  const t = useT()
  const [teamName, setTeamName] = useState('')
  const [club, setClub] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function createTeam(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { data: t, error } = await supabase.from('teams').insert({ name: teamName, club, owner_id: profile.id }).select().single()
    if (error) { setErr(error.message); setBusy(false); return }
    const { error: e2 } = await supabase.from('profiles').update({ role: 'coach', team_id: t.id }).eq('id', profile.id)
    setBusy(false)
    if (e2) setErr(e2.message); else onDone()
  }

  return (
    <div className="page">
      <div className="card">
        <h2>{t('noTeamTitle')}</h2>
        <p className="muted">{t('noTeamBody')}</p>
        <form onSubmit={createTeam}>
          <label>{t('teamName')}</label><input required value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="f.eks. IRS FIS-gruppe" />
          <label>{t('club')}</label><input value={club} onChange={e => setClub(e.target.value)} />
          <div style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>{t('createTeam')}</button></div>
        </form>
        {err && <div className="error">{err}</div>}
      </div>
    </div>
  )
}
