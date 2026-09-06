import { useState } from 'react'
import { supabase } from '../supabase'

export default function Onboarding({ profile, onDone }) {
  const [mode, setMode] = useState(null)
  const [name, setName] = useState(profile.full_name || '')
  const [teamName, setTeamName] = useState('')
  const [club, setClub] = useState('')
  const [code, setCode] = useState('')
  const [gender, setGender] = useState('')
  const [year, setYear] = useState('')
  const [fis, setFis] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const athleteFields = (
    <div className="row">
      <div style={{ flex: 1 }}><label>Kjønn</label>
        <select value={gender} onChange={e => setGender(e.target.value)}><option value="">–</option><option value="W">Kvinne</option><option value="M">Mann</option></select></div>
      <div style={{ flex: 1 }}><label>Fødselsår</label><input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2009" /></div>
      <div style={{ flex: 1 }}><label>FIS-kode</label><input value={fis} onChange={e => setFis(e.target.value)} /></div>
    </div>
  )

  async function createTeam(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { data: t, error } = await supabase.from('teams').insert({ name: teamName, club, owner_id: profile.id }).select().single()
    if (error) { setErr(error.message); setBusy(false); return }
    const { error: e2 } = await supabase.from('profiles').update({ full_name: name, role: 'coach', team_id: t.id, onboarded: true }).eq('id', profile.id)
    setBusy(false)
    if (e2) setErr(e2.message); else onDone()
  }

  async function join(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.rpc('join_team', { code: code.trim().toLowerCase() })
    if (error) { setErr(error.message); setBusy(false); return }
    const { error: e2 } = await supabase.from('profiles').update({
      full_name: name, role: 'athlete', gender: gender || null, birth_year: year ? +year : null, fis_code: fis || null, onboarded: true
    }).eq('id', profile.id)
    setBusy(false)
    if (e2) setErr(e2.message); else onDone()
  }

  async function solo(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.from('profiles').update({
      full_name: name, role: 'athlete', team_id: null, gender: gender || null, birth_year: year ? +year : null, fis_code: fis || null, onboarded: true
    }).eq('id', profile.id)
    setBusy(false)
    if (error) setErr(error.message); else onDone()
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Velkommen{name ? `, ${name}` : ''}</h2>
        <p className="muted">Er du trener eller løper?</p>
        <div className="row">
          <button className={'chip ' + (mode === 'coach' ? 'on' : '')} onClick={() => setMode('coach')}>Jeg er trener – opprett lag</button>
          <button className={'chip ' + (mode === 'athlete' ? 'on' : '')} onClick={() => setMode('athlete')}>Jeg er løper – bli med i et lag</button>
          <button className={'chip ' + (mode === 'solo' ? 'on' : '')} onClick={() => setMode('solo')}>Jeg er løper – bruk kalenderen på egen hånd</button>
        </div>

        {mode === 'coach' && (
          <form onSubmit={createTeam}>
            <label>Ditt navn</label><input required value={name} onChange={e => setName(e.target.value)} />
            <label>Lagnavn</label><input required value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="f.eks. IRS FIS-gruppe" />
            <label>Klubb (valgfritt)</label><input value={club} onChange={e => setClub(e.target.value)} />
            <div style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>Opprett lag</button></div>
          </form>
        )}

        {mode === 'athlete' && (
          <form onSubmit={join}>
            <label>Ditt navn</label><input required value={name} onChange={e => setName(e.target.value)} />
            <label>Invitasjonskode fra treneren</label><input required value={code} onChange={e => setCode(e.target.value)} placeholder="12 tegn" />
            {athleteFields}
            <div style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>Bli med</button></div>
          </form>
        )}

        {mode === 'solo' && (
          <form onSubmit={solo}>
            <p className="muted">Du planlegger sesongen selv. Du kan bli med i et lag senere under «Profil».</p>
            <label>Ditt navn</label><input required value={name} onChange={e => setName(e.target.value)} />
            {athleteFields}
            <div style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>Kom i gang</button></div>
          </form>
        )}
        {err && <div className="error">{err}</div>}
      </div>
    </div>
  )
}
