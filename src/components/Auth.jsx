import { useState } from 'react'
import { supabase } from '../supabase'

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

export default function Auth() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function send(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) setErr(error.message.includes('rate limit') ? 'For mange forsøk – prøv igjen om litt.' : error.message)
    else setSent(true)
  }

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <Hero />
        <div className="hero-copy">
          <div className="brand"><span className="dot" />Rennkalender</div>
          <h1>Planlegg hele<br /><em>alpinsesongen</em></h1>
          <p>120 renn i Norge, Sverige, Finland og Europacupen. Se reisevei, kostnad, påmeldte og startnummer – og hvor du ligger an.</p>
          <ul className="hero-points">
            <li><b>Reise og kostnad</b> regnet ut fra hjemstedet ditt</li>
            <li><b>Startnummer</b> ut fra hvem som er påmeldt</li>
            <li><b>FIS-punkter</b> og utvikling gjennom sesongen</li>
          </ul>
        </div>
        <div className="hero-stats">
          <div><b>120</b><span>renn</span></div>
          <div><b>81</b><span>steder</span></div>
          <div><b>11</b><span>land</span></div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth">
          {sent ? (
            <div className="sent">
              <div className="icon">✓</div>
              <h2>Sjekk innboksen</h2>
              <p>Vi har sendt en innloggingslenke til <b>{email}</b>. Trykk på den, så er du inne.</p>
              <p className="fine">Finner du den ikke, sjekk søppelpost.</p>
              <button className="btn link" onClick={() => setSent(false)}>Bruk en annen e-post</button>
            </div>
          ) : (
            <form onSubmit={send}>
              <h2>Logg inn</h2>
              <p>Ingen passord å huske – du får en lenke på e-post.</p>
              <label>E-post</label>
              <input type="email" required autoFocus inputMode="email" autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)} placeholder="navn@example.com" />
              <button className="btn primary" disabled={busy}>{busy ? 'Sender …' : 'Send innloggingslenke'}</button>
              {err && <div className="error">{err}</div>}
              <div className="roles">
                <span>🎿 Løper</span><span>📋 Trener</span><span>👨‍👩‍👧 Forelder</span>
              </div>
              <div className="fine">Første gang? Lenken oppretter kontoen din.</div>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
