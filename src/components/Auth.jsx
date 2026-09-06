import { useState } from 'react'
import { supabase } from '../supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function send(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) setErr(error.message); else setSent(true)
  }

  return (
    <div className="auth">
      <h1>Rennkalender 2026/27</h1>
      <p className="muted">Alpint – Norge, Sverige, Finland og Europacup. Logg inn med e-post, så får du en innloggingslenke.</p>
      {sent ? <div className="notice">Sjekk innboksen din – trykk på lenken i e-posten for å logge inn.</div> : (
        <form onSubmit={send}>
          <label>E-post</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="deg@example.com" />
          <div style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>{busy ? 'Sender …' : 'Send innloggingslenke'}</button></div>
          {err && <div className="error">{err}</div>}
        </form>
      )}
    </div>
  )
}
