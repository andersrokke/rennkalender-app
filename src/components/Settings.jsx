import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fetchFromFis, fetchFromFisInBackground, fisSummary } from '../fis'

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
  const [fisBusy, setFisBusy] = useState(false)
  const [fisMsg, setFisMsg] = useState(null)
  const [guardians, setGuardians] = useState([])
  const [copied, setCopied] = useState(false)

  const isAthlete = !isCoach && profile.role !== 'parent'
  useEffect(() => {
    if (!isAthlete) return
    supabase.rpc('my_guardians').then(({ data }) => setGuardians(data || []))
  }, [isAthlete, profile.id])

  async function removeGuardian(g) {
    if (!confirm(`${t('remove')} ${g.full_name}?`)) return
    await supabase.rpc('revoke_guardian', { parent: g.parent_id })
    const { data } = await supabase.rpc('my_guardians')
    setGuardians(data || [])
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(profile.link_code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { /* clipboard blocked; the code is on screen anyway */ }
  }

  async function saveProfile(e) {
    e.preventDefault()
    const code = fis.trim()
    const firstCode = !!code && !profile.fis_code
    const { error } = await supabase.from('profiles').update({ full_name: name, fis_code: code || null, birth_year: year ? +year : null, gender: gender || null }).eq('id', profile.id)
    setMsg(error ? error.message : t('saved')); onChange()
    // First time a FIS code is saved, warm the data in the background so the
    // athlete does not have to wait for the nightly job. Saving is not blocked.
    if (!error && firstCode) {
      setFisBusy(true)
      fetchFromFisInBackground(code, res => {
        setFisBusy(false)
        setFisMsg(res.error ? res.error : fisSummary(res.athlete, t))
        onChange()
      })
    }
  }

  // Save the code first: can_see_fis() gates fis_points/fis_results/fis_athletes
  // on a profile owning that code, so without saving we could not read back
  // what the function just wrote.
  async function fetchFis() {
    const code = fis.trim()
    if (!code) { setFisMsg(t('fisNeedCode')); return }
    setFisBusy(true); setFisMsg(null)
    const { error } = await supabase.from('profiles').update({ fis_code: code }).eq('id', profile.id)
    if (error) { setFisBusy(false); setFisMsg(error.message); return }
    const res = await fetchFromFis(code)
    setFisBusy(false)
    setFisMsg(res.error ? res.error : fisSummary(res.athlete, t))
    onChange()
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
      {isAthlete && (
        <div className="card">
          <h2>{t('linkedTitle')}</h2>
          <p className="muted">{t('linkedShare')}</p>
          <div className="row">
            <span className="link-code">{profile.link_code || '–'}</span>
            {profile.link_code && <button type="button" className="btn small" onClick={copyCode}>{copied ? t('copied') : t('linkedShare')}</button>}
          </div>
          <h3>{t('linkedWho')}</h3>
          {guardians.length === 0 ? <p className="muted">{t('linkedNone')}</p> : guardians.map(g => (
            <div className="guardian-row" key={g.parent_id}>
              <span>{g.full_name}{g.since ? ` · ${t('linkedSince')} ${new Date(g.since).toLocaleDateString('nb-NO')}` : ''}</span>
              <button className="btn small danger" onClick={() => removeGuardian(g)}>{t('remove')}</button>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h2>{t('myProfile')}</h2>
        <form onSubmit={saveProfile}>
          <label>{t('name')}</label><input value={name} onChange={e => setName(e.target.value)} />
          {isAthlete && <div className="row">
            <div style={{ flex: 1 }}><label>{t('gender')}</label><select value={gender} onChange={e => setGender(e.target.value)}><option value="">–</option><option value="W">{t('woman')}</option><option value="M">{t('man')}</option></select></div>
            <div style={{ flex: 1 }}><label>{t('birthYear')}</label><input type="number" value={year} onChange={e => setYear(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>{t('fisCode')}</label>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <input value={fis} onChange={e => setFis(e.target.value)} />
                <button type="button" className="btn small" disabled={fisBusy} onClick={fetchFis} style={{ whiteSpace: 'nowrap' }}>
                  {fisBusy ? t('fisFetching') : t('fisFetch')}
                </button>
              </div>
            </div>
          </div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn small primary">Lagre</button>
            {!isCoach && team && <button type="button" className="btn small danger" onClick={leave}>{t('leaveTeam')}</button>}
          </div>
        </form>
        {fisBusy && <div className="notice"><span className="spinner" />{t('fisFetching')}</div>}
        {fisMsg && !fisBusy && <div className="notice">{fisMsg}</div>}
        {msg && <div className="notice">{msg}</div>}
      </div>
    </div>
  )
}
