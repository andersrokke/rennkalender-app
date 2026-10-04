import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import PassordKort from './Passord.jsx'
import SlettKonto from './SlettKonto.jsx'
import Lagkode from './Lagkode.jsx'
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
    try { await navigator.clipboard.writeText(foreldrelenke); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { /* clipboard blocked; the code is on screen anyway */ }
  }

  async function saveProfile(e) {
    e.preventDefault()
    const code = fis.trim()
    const firstCode = !!code && !profile.fis_code
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), fis_code: code || null, birth_year: year ? +year : null, gender: gender || null }).eq('id', profile.id)
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
  const [skoler, setSkoler] = useState([])
  useEffect(() => { if (!isCoach && profile.role !== 'parent' && !team) supabase.rpc('skigymnas').then(({ data }) => setSkoler(data || [])) }, [isCoach, team?.id])
  async function velgSkole(id) {
    if (!id) return
    const { error } = await supabase.rpc('velg_skigymnas', { p_team: id })
    if (error) setJoinErr(error.message); else onChange()
  }
  const [fkode, setFkode] = useState(null)
  // Koden ligger ikke i profilen klienten leser; løperen henter sin egen.
  useEffect(() => {
    if (profile.role === 'athlete') supabase.rpc('min_foreldrekode').then(({ data }) => setFkode(data || null))
  }, [profile.id, profile.role])
  const foreldrekode = fkode
  const foreldrelenke = `${window.location.origin}/?forelder=${encodeURIComponent(foreldrekode || '')}`
  async function nyForeldrekode() {
    if (!confirm(t('linkedNewConfirm'))) return
    const { data, error } = await supabase.rpc('bytt_foreldrekode')
    if (error) return alert(error.message)
    setFkode(data)
  }

  // Forelderen legger inn koden hun har fått fra løperen. Koden er den eneste
  // veien inn: ikke navn, ikke FIS-kode.
  const [barnekode, setBarnekode] = useState('')
  const [barnMsg, setBarnMsg] = useState(null)
  async function kobleBarn(e) {
    e.preventDefault(); setBarnMsg(null)
    const { data, error } = await supabase.rpc('link_guardian', { code: barnekode.trim() })
    if (error) return setBarnMsg({ bad: true, text: error.message })
    if (!data?.length) return setBarnMsg({ bad: true, text: t('codeInvalid') })
    setBarnekode(''); setBarnMsg({ text: t('linkChildDone').replace('{n}', data[0].full_name || '') })
    onChange()
  }

  async function joinTeam(e) {
    e.preventDefault(); setJoining(true); setJoinErr(null)
    const { data: lagId, error } = await supabase.rpc('join_team', { code: joinCode.trim() })
    setJoining(false)
    if (error) { setJoinErr(error.message); return }
    if (!lagId) { setJoinErr(t('codeInvalid')); return }
    setJoinCode(''); onChange()
  }

  return (
    <div className="page">
      {isCoach && team && (
        <div className="card">
          <h2>{t('team')}</h2>
          <p className="muted">{t('inviteHint')}</p>
          <Lagkode team={team} kanBytte onEndret={onChange} />
          <form onSubmit={saveTeam}><label>{t('teamName')}</label><input value={teamName} onChange={e => setTeamName(e.target.value)} />
            <div style={{ marginTop: 10 }}><button className="btn small primary">Lagre</button></div></form>
        </div>
      )}
      {/* Bare løpere blir med i lag. En forelder hører ikke til noe lag - hun
          er koblet til barnet sitt, ikke til skigymnaset. */}
      {isAthlete && !team && (
        <div className="card">
          <h2>{t('joinTeam')}</h2>
          <p className="muted">{t('joinHint')}</p>
          <label htmlFor="st-skole">{t('schoolLabel')}</label>
          <select id="st-skole" defaultValue="" onChange={e => velgSkole(e.target.value)}>
            <option value="">{t('schoolPick')}</option>
            {skoler.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <form onSubmit={joinTeam}>
            <label>{t('inviteCodeOr')}</label><input required value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="K7RF2M" />
            <div style={{ marginTop: 10 }}><button className="btn small primary" disabled={joining}>{t('join')}</button></div>
          </form>
          {joinErr && <div className="error">{joinErr}</div>}
        </div>
      )}
      {profile.role === 'parent' && (
        <div className="card">
          <h2>{t('linkChildTitle')}</h2>
          <p className="muted">{t('linkChildSub')}</p>
          <form onSubmit={kobleBarn} className="cs-inviter">
            <input required value={barnekode} placeholder="K7RF2M" aria-label={t('linkChildTitle')}
              autoCapitalize="characters" autoCorrect="off" spellCheck="false"
              onChange={e => { setBarnekode(e.target.value); setBarnMsg(null) }} />
            <button className="btn primary small" disabled={barnekode.trim().length < 4}>{t('linkBtn')}</button>
          </form>
          {barnMsg && <p className={barnMsg.bad ? 'error' : 'notice'} style={{ margin: '8px 0 0' }}>{barnMsg.text}</p>}
        </div>
      )}
      {isAthlete && (
        <div className="card">
          <h2>{t('linkedTitle')}</h2>
          <p className="muted">{t('linkedShare')}</p>
          <div className="cs-kode">
            <code>{foreldrekode || '–'}</code>
            <button type="button" className="btn small primary" onClick={copyCode}>{copied ? t('copied') : t('linkedCopyLink')}</button>
          </div>
          <p className="lk-lenke"><a href={foreldrelenke}>{foreldrelenke}</a></p>
          <button type="button" className="btn link small" onClick={nyForeldrekode}>{t('lkNew')}</button>
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

      {/* Passordet hører til kontoen, ikke til laget. Det sto øverst, som det
          første og største på en side om lag og profil - og for en som ikke har
          lag var det alt siden inneholdt. */}
      <PassordKort />
      <SlettKonto profile={profile} />
    </div>
  )
}
