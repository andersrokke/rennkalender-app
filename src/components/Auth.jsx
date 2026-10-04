import { useState } from 'react'
import { supabase } from '../supabase'
import { detectLang, t } from '../i18n'
import LangSwitch from './LangSwitch.jsx'

/* Illustrated hero: dawn sky, mountains, piste with slalom gates and a skier's track */
const Hero = () => (
  <svg className="hero-art" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0B1D3A" /><stop offset="45%" stopColor="#2A4A7F" />
        <stop offset="75%" stopColor="#E8734A" /><stop offset="100%" stopColor="#FFB067" />
      </linearGradient>
      <linearGradient id="snowfar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F3F7FC" /><stop offset="100%" stopColor="#B9CBE4" />
      </linearGradient>
      <linearGradient id="piste" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EAF1FA" /><stop offset="100%" stopColor="#FFFFFF" />
      </linearGradient>
      <radialGradient id="sun" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#FFF0C7" /><stop offset="100%" stopColor="#FFB067" stopOpacity="0" />
      </radialGradient>
    </defs>

    <rect width="1200" height="900" fill="url(#sky)" />
    <circle cx="880" cy="470" r="190" fill="url(#sun)" />
    <circle cx="880" cy="470" r="46" fill="#FFE2A8" opacity=".95" />

    {/* far range */}
    <path d="M0 560 L150 430 L250 500 L390 350 L520 480 L640 400 L780 520 L900 430 L1040 520 L1200 450 L1200 900 L0 900Z" fill="#31558C" opacity=".55" />
    {/* mid range with snow caps */}
    <path d="M0 640 L180 500 L300 590 L470 420 L610 560 L760 470 L900 600 L1060 500 L1200 580 L1200 900 L0 900Z" fill="#22406F" />
    <path d="M470 420 L520 480 L495 492 L455 470Z M760 470 L800 512 L775 522 L742 500Z M180 500 L215 536 L192 546 L160 528Z" fill="#DCE8F7" opacity=".9" />

    {/* piste */}
    <path d="M-40 900 C 180 700, 420 700, 560 600 C 700 500, 900 470, 1240 430 L1240 900 Z" fill="url(#piste)" />
    <path d="M-40 900 C 180 700, 420 700, 560 600 C 700 500, 900 470, 1240 430" fill="none" stroke="#C9D9EE" strokeWidth="2" />

    {/* carved track */}
    <path d="M980 470 C 900 500, 880 540, 800 556 C 700 576, 690 612, 600 636 C 500 662, 480 700, 380 730 C 280 760, 250 800, 150 838"
      fill="none" stroke="#BBD0EA" strokeWidth="10" strokeLinecap="round" opacity=".85" />

    {/* slalom gates: red / blue pairs down the hill */}
    <g strokeLinecap="round">
      {[[980,470,0.62],[860,520,0.72],[720,568,0.82],[560,624,0.94],[380,700,1.08],[180,790,1.24]].map(([x,y,s],i)=>{
        const red = i % 2 === 0, c = red ? '#E23B4E' : '#2F6FE0', w = 26*s, h = 74*s
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <ellipse cx={w/2} cy={h+3} rx={w*0.9} ry={5*s} fill="#0B1D3A" opacity=".12" />
            <line x1="0" y1="0" x2="0" y2={h} stroke={c} strokeWidth={4.5*s} />
            <line x1={w} y1="6" x2={w} y2={h} stroke={c} strokeWidth={4.5*s} />
            <path d={`M0 ${h*0.22} L${w} ${h*0.30} L${w} ${h*0.52} L0 ${h*0.44} Z`} fill={c} opacity=".92" />
          </g>
        )
      })}
    </g>
  </svg>
)

// Googles «G». Egen markup og ikke en bildefil, saa den foelger med i bunten
// og ikke kan bli borte bak en blokkert CDN.
const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-4H24v7.3h12.1c-.2 1.8-1.6 4.6-4.5 6.5l6.9 5.4c4.1-3.8 6.6-9.4 6.6-15.2z" />
    <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C7.1 41 14.9 46 24 46z" />
    <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z" />
    <path fill="#EA4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.3 29.9 2 24 2 14.9 2 7.1 7 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9.1 12.5-9.1z" />
  </svg>
)

export default function Auth() {
  const [lang, setLang] = useState(detectLang())
  const L = t(lang)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('in')        // 'in' = logg inn, 'up' = opprett
  // Innboksskjermen sier forskjellige ting, og verifyOtp trenger riktig type.
  const [sentKind, setSentKind] = useState('link')
  const [code, setCode] = useState('')
  const [codeErr, setCodeErr] = useState(null)
  const [verifying, setVerifying] = useState(false)

  // Veien tilbake når passordet er glemt.
  //
  // Her sto det signInWithOtp, som har shouldCreateUser = true som standard.
  // Den lagde altså en ny konto av hver adresse noen skrev feil, sendte en
  // innloggingslenke til den, og slapp dem inn i «opprett lag» - i stedet for
  // å hjelpe dem tilbake til kontoen de allerede hadde. Det skjedde i praksis,
  // og ga to kontoer og to lag med samme navn.
  //
  // resetPasswordForEmail oppretter ingenting. Den svarer likt enten adressen
  // finnes eller ikke, med vilje, så ingen kan bruke skjemaet til å finne ut
  // hvem som har konto.
  async function send(e) {
    e?.preventDefault(); setBusy(true); setErr(null); setCodeErr(null)
    setSentKind('reset')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    setBusy(false)
    if (error) setErr(error.message.includes('rate limit') ? L.rateLimit : error.message)
    else setSent(true)
  }

  // The email carries both a link and a 6-digit code, so someone who typed
  // their address on a laptop can finish there with the code from their phone.
  // On success onAuthStateChange in App picks up the new session.
  async function verify(e) {
    e.preventDefault(); setVerifying(true); setCodeErr(null)
    const token = code.replace(/\D/g, '')
    const { error } = await supabase.auth.verifyOtp({
      email, token,
      type: sentKind === 'signup' ? 'signup' : sentKind === 'reset' ? 'recovery' : 'email' })
    setVerifying(false)
    if (error) setCodeErr(error.message.includes('rate limit') ? L.rateLimit : L.codeBad)
  }

  async function withGoogle() {
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin }
    })
    // Går det bra, forlater nettleseren siden; da skal knappen bli stående.
    if (error) { setBusy(false); setErr(L.googleFailed) }
  }

  async function submitPw(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    if (mode === 'up') {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin }
      })
      setBusy(false)
      if (error) return setErr(error.message.includes('rate limit') ? L.rateLimit : error.message)
      // Uten sesjon venter Supabase på at adressen bekreftes. Finnes adressen
      // fra før, svarer Supabase likt - med vilje, så ingen kan avdekke hvem
      // som har konto. Derfor samme skjerm uansett.
      if (!data.session) { setSentKind('signup'); setSent(true) }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) setErr(error.message.includes('rate limit') ? L.rateLimit : L.pwFailed)
    }
  }

  async function resend() {
    setCode(''); setCodeErr(null)
    await send()
  }

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <Hero />
        <div className="hero-copy">
          <div className="hero-top"><div className="brand"><span className="dot" />{L.brand}</div><LangSwitch lang={lang} onChange={setLang} dark /></div>
          <h1>{L.heroTitle1}<br /><em>{L.heroTitle2}</em></h1>
          <p>{L.heroLead}</p>
          <ul className="hero-points">
            <li><b>{L.p1}</b> {L.p1b}</li>
            <li><b>{L.p2}</b> {L.p2b}</li>
            <li><b>{L.p3}</b> {L.p3b}</li>
          </ul>
        </div>
        <div className="hero-stats">
          <div><b>460+</b><span>{L.races}</span></div>
          <div><b>280+</b><span>{L.venues}</span></div>
          <div><b>14</b><span>{L.countries}</span></div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth">
          {sent ? (
            <div className="sent">
              <div className="icon">✓</div>
              <h2>{sentKind === 'signup' ? L.confirmTitle
                : sentKind === 'reset' ? L.resetTitle : L.checkInbox}</h2>
              <p>{sentKind === 'signup' ? L.confirmSentTo
                : sentKind === 'reset' ? L.resetSentTo : L.sentTo} <b>{email}</b>. {L.tapIt}</p>
              <p className="fine">{L.spam}</p>

              <form className="otp" onSubmit={verify}>
                <p className="otp-lead">{L.codeLead}</p>
                <label>{L.codeLabel}</label>
                <input value={code} onChange={e => { setCode(e.target.value); setCodeErr(null) }}
                  inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
                  maxLength={6} placeholder="123456" aria-label={L.codeLabel} />
                <button className="btn primary" disabled={verifying || code.replace(/\D/g, '').length < 6}>
                  {verifying ? L.sending : L.codeSignIn}
                </button>
                {codeErr && <div className="error">{codeErr}</div>}
                <button type="button" className="btn link" onClick={resend} disabled={busy}>{L.codeResend}</button>
              </form>

              <button className="btn link" onClick={() => setSent(false)}>{L.otherEmail}</button>
            </div>
          ) : (
            <form onSubmit={submitPw}>
              <h2>{mode === 'up' ? L.signUp : L.signIn}</h2>
              <p>{mode === 'up' ? L.signUpLead : L.signInLead}</p>

              <button type="button" className="btn google" disabled={busy} onClick={withGoogle}>
                <GoogleMark />{L.withGoogle}
              </button>
              <div className="or"><span>{L.orEmail}</span></div>

              <label htmlFor="au-email">{L.email}</label>
              <input id="au-email" type="email" required inputMode="email" autoComplete="email"
                value={email} onChange={e => { setEmail(e.target.value); setErr(null) }}
                placeholder="navn@example.com" />

              <label htmlFor="au-pw">{mode === 'up' ? L.pwNew : L.password}</label>
              <input id="au-pw" type="password" required minLength={8} value={password}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                onChange={e => { setPassword(e.target.value); setErr(null) }} />
              {mode === 'up' && <span className="fine">{L.pwMin}</span>}

              <button className="btn primary" disabled={busy || !email || password.length < 8}>
                {busy ? L.sending : mode === 'up' ? L.signUp : L.pwSignIn}
              </button>
              {err && <div className="error">{err}</div>}

              <div className="auth-alt">
                <button type="button" className="btn link"
                  onClick={() => { setMode(m => (m === 'up' ? 'in' : 'up')); setErr(null) }}>
                  {mode === 'up' ? L.haveAccount : L.noAccount}
                </button>
                {mode === 'in' && (
                  <button type="button" className="btn link" disabled={busy || !email} onClick={send}>
                    {L.forgot}
                  </button>
                )}
              </div>

              <div className="roles">
                <span>{L.roleAthlete}</span><span>{L.roleCoach}</span><span>{L.roleParent}</span>
              </div>
              <div className="fine">{L.firstTime}</div>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
