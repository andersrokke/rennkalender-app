import { useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

export default function Settings({ profile, team, isCoach, onChange }) {
  const t = useT()
  const [name, setName] = useState(profile.full_name || '')
  const [fis, setFis] = useState(profile.fis_code || '')
  const [year, setYear] = useState(profile.birth_year || '')
  const [gender, setGender] = useState(profile.gender || '')
  const [teamName, setTeamName] = useState(team?.name || '')
  const [joinCode, setJoinCode] = useState('')
  const [joinErr, setJoinErr] = useState(null)
  const [joining, setJoining] = useState(false)
  const [msg, setMsg] = useState(null)

  async function saveProfile(e) {
    e.preventDefault()
    const { error } = await supabase.from('profiles').update({ full_name: name, fis_code: fis || null, birth_year: year ? +year : null, gender: gender || null }).eq('id', profile.id)
    setMsg(error ? error.message : t('saved')); onChange()
  }
  async function saveTeam(e) {
    e.preventDefault()
    const { error } = await supabase.from('teams').update({ name: teamName }).eq('id', team.id)
    setMsg(error ? error.message : t('saved')); onChange()
  }
  async function leave() {
    if (!confirm(t('leaveConfirm'))) return
    await supabase.from('profiles').update({ team_id: null }).eq('id', profile.id); onChange()
  }
  async function joinTeam(e) {
    e.preventDefault(); setJoining(true); setJoinErr(null)
    const { error } = await supabase.rpc('join_team', { code: joinCode.trim().toLowerCase() })
    setJoining(false)
    if (error) { setJoinErr(error.message); return }
    setJoinCode(''); onChange()
  }

  return (
    <div className="page">
      {isCoach && team && (
        <div className="card">
          <h2>{t('team')}</h2>
          <p className="muted">{t('inviteHint')}</p>
          <span className="code">{team.invite_code}</span>
          <form onSubmit={saveTeam}><label>{t('teamName')}</label><input value={teamName} onChange={e => setTeamName(e.target.value)} />
            <div style={{ marginTop: 10 }}><button className="btn small primary">Lagre</button></div></form>
        </div>
      )}
      {!isCoach && !team && (
        <div className="card">
          <h2>{t('joinTeam')}</h2>
          <p className="muted">{t('joinHint')}</p>
          <form onSubmit={joinTeam}>
            <label>{t('inviteCode')}</label><input required value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="12 tegn" />
            <div style={{ marginTop: 10 }}><button className="btn small primary" disabled={joining}>{t('join')}</button></div>
          </form>
          {joinErr && <div className="error">{joinErr}</div>}
        </div>
      )}
      <div className="card">
        <h2>{t('myProfile')}</h2>
        <form onSubmit={saveProfile}>
          <label>{t('name')}</label><input value={name} onChange={e => setName(e.target.value)} />
          {!isCoach && <div className="row">
            <div style={{ flex: 1 }}><label>{t('gender')}</label><select value={gender} onChange={e => setGender(e.target.value)}><option value="">–</option><option value="W">{t('woman')}</option><option value="M">{t('man')}</option></select></div>
            <div style={{ flex: 1 }}><label>{t('birthYear')}</label><input type="number" value={year} onChange={e => setYear(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>{t('fisCode')}</label><input value={fis} onChange={e => setFis(e.target.value)} /></div>
          </div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn small primary">Lagre</button>
            {!isCoach && team && <button type="button" className="btn small danger" onClick={leave}>{t('leaveTeam')}</button>}
          </div>
        </form>
        {msg && <div className="notice">{msg}</div>}
      </div>
    </div>
  )
}
