import { useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fetchFromFisInBackground } from '../fis'

export default function Onboarding({ profile, onDone }) {
  const t = useT()
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
      <div style={{ flex: 1 }}><label>{t('gender')}</label>
        <select value={gender} onChange={e => setGender(e.target.value)}><option value="">–</option><option value="W">{t('woman')}</option><option value="M">{t('man')}</option></select></div>
      <div style={{ flex: 1 }}><label>{t('birthYear')}</label><input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2009" /></div>
      <div style={{ flex: 1 }}><label>{t('fisCode')}</label><input value={fis} onChange={e => setFis(e.target.value)} /></div>
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
    if (e2) { setErr(e2.message); return }
    if (fis.trim()) fetchFromFisInBackground(fis, onDone)
    onDone()
  }

  async function solo(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.from('profiles').update({
      full_name: name, role: 'athlete', team_id: null, gender: gender || null, birth_year: year ? +year : null, fis_code: fis || null, onboarded: true
    }).eq('id', profile.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    // Fetch FIS data in the background; onboarding continues immediately.
    if (fis.trim()) fetchFromFisInBackground(fis, onDone)
    onDone()
  }

  return (
    <div className="page">
      <div className="card">
        <h2>{t('welcome')}{name ? `, ${name}` : ''}</h2>
        <p className="muted">{t('coachOrAthlete')}</p>
        <div className="row">
          <button className={'chip ' + (mode === 'coach' ? 'on' : '')} onClick={() => setMode('coach')}>{t('optCoach')}</button>
          <button className={'chip ' + (mode === 'athlete' ? 'on' : '')} onClick={() => setMode('athlete')}>{t('optAthlete')}</button>
          <button className={'chip ' + (mode === 'solo' ? 'on' : '')} onClick={() => setMode('solo')}>{t('optSolo')}</button>
        </div>

        {mode === 'coach' && (
          <form onSubmit={createTeam}>
            <label>{t('yourName')}</label><input required value={name} onChange={e => setName(e.target.value)} />
            <label>{t('teamName')}</label><input required value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="f.eks. IRS FIS-gruppe" />
            <label>{t('club')}</label><input value={club} onChange={e => setClub(e.target.value)} />
            <div style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>{t('createTeam')}</button></div>
          </form>
        )}

        {mode === 'athlete' && (
          <form onSubmit={join}>
            <label>{t('yourName')}</label><input required value={name} onChange={e => setName(e.target.value)} />
            <label>{t('inviteFromCoach')}</label><input required value={code} onChange={e => setCode(e.target.value)} placeholder="12 tegn" />
            {athleteFields}
            <div style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>{t('join')}</button></div>
          </form>
        )}

        {mode === 'solo' && (
          <form onSubmit={solo}>
            <p className="muted">{t('soloIntro')}</p>
            <label>{t('yourName')}</label><input required value={name} onChange={e => setName(e.target.value)} />
            {athleteFields}
            <div style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>{t('start')}</button></div>
          </form>
        )}
        {err && <div className="error">{err}</div>}
      </div>
    </div>
  )
}
