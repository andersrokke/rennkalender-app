import { useState } from 'react'
import { supabase } from '../supabase'
import { detectLang, t } from '../i18n'
import LangSwitch from './LangSwitch.jsx'

const Banner = () => (
  <svg className="ob-art" viewBox="0 0 1200 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="obSky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0B1D3A" /><stop offset="55%" stopColor="#2A4A7F" /><stop offset="100%" stopColor="#E8734A" />
      </linearGradient>
      <linearGradient id="obSnow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" /><stop offset="100%" stopColor="#CFE0F3" />
      </linearGradient>
      <radialGradient id="obSun" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#FFE2A8" /><stop offset="100%" stopColor="#FFB067" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="1200" height="240" fill="url(#obSky)" />
    <circle cx="1010" cy="88" r="120" fill="url(#obSun)" />
    <circle cx="1010" cy="88" r="28" fill="#FFE7B8" opacity=".9" />
    <path d="M0 166 L120 110 L200 148 L320 84 L430 140 L540 100 L660 158 L780 112 L900 166 L1030 120 L1200 162 L1200 240 L0 240Z" fill="#22406F" opacity=".7" />
    <path d="M320 84 L356 112 L334 120 L306 106Z M780 112 L810 138 L790 146 L766 132Z" fill="#DCE8F7" opacity=".85" />
    <path d="M-20 240 C 200 200, 460 192, 700 176 C 900 162, 1060 158, 1220 148 L1220 240 Z" fill="url(#obSnow)" />
    <path d="M120 226 C 300 210, 430 200, 560 194 C 700 186, 840 178, 1000 170" fill="none" stroke="#BCD2EC" strokeWidth="7" strokeLinecap="round" opacity=".8" />
    {[[880,170,'#E23B4E',.8],[720,182,'#2F6FE0',.9],[520,196,'#E23B4E',1],[300,210,'#2F6FE0',1.1]].map(([x,y,c,s],i)=>(
      <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
        <line x1="0" y1="0" x2="0" y2="-44" stroke={c} strokeWidth="4" strokeLinecap="round" />
        <line x1="22" y1="-2" x2="22" y2="-40" stroke={c} strokeWidth="4" strokeLinecap="round" />
        <path d="M0 -32 L22 -28 L22 -17 L0 -21 Z" fill={c} opacity=".9" />
      </g>
    ))}
    <g transform="translate(612 156) rotate(-8)">
      <path d="M-30 26 C -6 34, 22 32, 44 20" stroke="#8FB3DC" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".7" />
      <path d="M-22 22 L34 12" stroke="#12305C" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M-18 30 L38 20" stroke="#12305C" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M2 22 C 0 10, 4 2, 12 -2 L20 6 C 16 12, 14 18, 14 22 Z" fill="#E23B4E" />
      <path d="M12 -2 C 20 -6, 28 -2, 30 6 L20 8 Z" fill="#E23B4E" />
      <circle cx="16" cy="-9" r="7.5" fill="#FFE7B8" />
      <path d="M9 -12 C 12 -19, 22 -19, 24 -11 Z" fill="#12305C" />
      <path d="M30 6 L44 2" stroke="#12305C" strokeWidth="3" strokeLinecap="round" />
      <path d="M2 14 L-12 6" stroke="#12305C" strokeWidth="3" strokeLinecap="round" />
    </g>
  </svg>
)

const ICONS = {
  coach: <svg viewBox="0 0 24 24"><path d="M4 5h13a2 2 0 0 1 2 2v12l-4-2-4 2-4-2-3 1.5V6a1 1 0 0 1 1-1Z" /><path d="M8 9h7M8 13h5" /></svg>,
  team: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" /><path d="M15.5 19c0-2 1.4-3.4 3.3-3.4S22 17 22 19" /></svg>,
  solo: <svg viewBox="0 0 24 24"><path d="M3 20 9 9l3 5 2.5-3.5L21 20Z" /><circle cx="17.5" cy="5.5" r="2" /></svg>,
  parent: <svg viewBox="0 0 24 24"><circle cx="7.5" cy="7" r="2.6" /><circle cx="16.5" cy="7" r="2.6" /><path d="M2.5 18c0-2.6 2.2-4.4 5-4.4s5 1.8 5 4.4" /><path d="M12.5 18c0-2.6 1.8-4.4 4-4.4s4 1.8 4 4.4" /></svg>,
}

export default function Onboarding({ profile, onDone }) {
  const [lang, setLang] = useState(detectLang())
  const [mode, setMode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const L = t(lang)

  const saved = profile.full_name || ''
  const clean = saved && !saved.includes('@') ? saved : ''
  const first = clean.split(' ')[0]

  const cards = [
    { key: 'coach', title: L.cCoach, lead: L.cCoachLead },
    { key: 'team', title: L.cTeam, lead: L.cTeamLead },
    { key: 'solo', title: L.cSolo, lead: L.cSoloLead },
    { key: 'parent', title: L.cParent, lead: L.cParentLead },
  ]

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const f = new FormData(e.target)
    const name = f.get('name'), code = (f.get('code') || '').trim().toLowerCase()
    try {
      if (mode === 'coach') {
        const { data: team, error } = await supabase.from('teams')
          .insert({ name: f.get('team'), owner_id: profile.id }).select().single()
        if (error) throw error
        const { error: e2 } = await supabase.from('profiles')
          .update({ full_name: name, role: 'coach', team_id: team.id, onboarded: true, lang }).eq('id', profile.id)
        if (e2) throw e2
      } else if (mode === 'team') {
        const { error } = await supabase.rpc('join_team', { code })
        if (error) throw error
        const { error: e2 } = await supabase.from('profiles')
          .update({ full_name: name, role: 'athlete', onboarded: true, lang }).eq('id', profile.id)
        if (e2) throw e2
      } else if (mode === 'solo') {
        const { error } = await supabase.from('profiles')
          .update({ full_name: name, role: 'athlete', team_id: null, onboarded: true, lang }).eq('id', profile.id)
        if (error) throw error
      } else if (mode === 'parent') {
        const { error } = await supabase.rpc('link_guardian', { code })
        if (error) throw error
        const { error: e2 } = await supabase.from('profiles')
          .update({ full_name: name, onboarded: true, lang }).eq('id', profile.id)
        if (e2) throw e2
      }
      onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const go = { coach: L.goCoach, team: L.goTeam, solo: L.goSolo, parent: L.goParent }[mode]

  return (
    <div className="ob">
      <div className="ob-hero">
        <Banner />
        <div className="ob-hero-text">
          <div className="ob-lang"><LangSwitch lang={lang} onChange={setLang} dark /></div>
          <h1>{first ? L.welcomeName(first) : L.welcome}</h1>
          <p>{L.howUse}</p>
        </div>
      </div>

      <div className="ob-body">
        <div className="ob-cards">
          {cards.map(c => (
            <button key={c.key} type="button" className={`ob-card ${c.key} ${mode === c.key ? 'on' : ''}`}
              onClick={() => { setMode(c.key); setErr(null) }}>
              <span className="ob-icon">{ICONS[c.key]}</span>
              <b>{c.title}</b>
              <span className="ob-lead">{c.lead}</span>
            </button>
          ))}
        </div>

        {mode && (
          <form className="ob-form" onSubmit={submit}>
            <label>{L.name}</label>
            <input name="name" required autoComplete="name" defaultValue={clean} placeholder={L.namePh} />

            {mode === 'coach' && (<>
              <label>{L.teamName}</label>
              <input name="team" required placeholder={L.teamPh} />
            </>)}

            {(mode === 'team' || mode === 'parent') && (<>
              <label>{mode === 'team' ? L.codeTeam : L.codeParent}</label>
              <input name="code" required autoCapitalize="none" autoCorrect="off" spellCheck="false" placeholder={L.codePh} />
            </>)}

            {mode === 'parent' && <p className="ob-hint">{L.parentHint}</p>}

            <button className="btn primary ob-go" disabled={busy}>{busy ? L.saving : go}</button>
            {err && <div className="error">{err}</div>}
            {mode !== 'coach' && mode !== 'parent' && <p className="ob-later">{L.later}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
