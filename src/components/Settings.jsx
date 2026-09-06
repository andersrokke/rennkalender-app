import { useState } from 'react'
import { supabase } from '../supabase'

export default function Settings({ profile, team, isCoach, onChange }) {
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
    setMsg(error ? error.message : 'Lagret'); onChange()
  }
  async function saveTeam(e) {
    e.preventDefault()
    const { error } = await supabase.from('teams').update({ name: teamName }).eq('id', team.id)
    setMsg(error ? error.message : 'Lagret'); onChange()
  }
  async function leave() {
    if (!confirm('Forlate laget?')) return
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
          <h2>Laget</h2>
          <p className="muted">Løpere blir med ved å oppgi denne koden når de logger inn første gang.</p>
          <span className="code">{team.invite_code}</span>
          <form onSubmit={saveTeam}><label>Lagnavn</label><input value={teamName} onChange={e => setTeamName(e.target.value)} />
            <div style={{ marginTop: 10 }}><button className="btn small primary">Lagre</button></div></form>
        </div>
      )}
      {!isCoach && !team && (
        <div className="card">
          <h2>Bli med i et lag</h2>
          <p className="muted">Har du fått en invitasjonskode fra treneren din, kan du bli med her. Rennene du allerede har lagt til beholder du.</p>
          <form onSubmit={joinTeam}>
            <label>Invitasjonskode</label><input required value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="12 tegn" />
            <div style={{ marginTop: 10 }}><button className="btn small primary" disabled={joining}>Bli med</button></div>
          </form>
          {joinErr && <div className="error">{joinErr}</div>}
        </div>
      )}
      <div className="card">
        <h2>Min profil</h2>
        <form onSubmit={saveProfile}>
          <label>Navn</label><input value={name} onChange={e => setName(e.target.value)} />
          {!isCoach && <div className="row">
            <div style={{ flex: 1 }}><label>Kjønn</label><select value={gender} onChange={e => setGender(e.target.value)}><option value="">–</option><option value="W">Kvinne</option><option value="M">Mann</option></select></div>
            <div style={{ flex: 1 }}><label>Fødselsår</label><input type="number" value={year} onChange={e => setYear(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>FIS-kode</label><input value={fis} onChange={e => setFis(e.target.value)} /></div>
          </div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn small primary">Lagre</button>
            {!isCoach && team && <button type="button" className="btn small danger" onClick={leave}>Forlat laget</button>}
          </div>
        </form>
        {msg && <div className="notice">{msg}</div>}
      </div>
    </div>
  )
}
