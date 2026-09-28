import { useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Lagkoden, og lenka som gjør noe med den.
//
// Lenka står også som synlig tekst, ikke bare bak en kopieringsknapp.
// Utklippstavla er ikke til å stole på - den svikter i innebygde nettlesere,
// på sider som ikke har fokus, og i privat modus - og da satt man igjen med
// ingenting. Nå kan man alltid markere den og sende den selv.

export default function Lagkode({ team, kanBytte = false, onEndret }) {
  const t = useT()
  const [kopiert, setKopiert] = useState(null)
  // Koden holdes lokalt etter et bytte, så den nye vises med én gang selv om
  // skjermen over ikke henter laget på nytt.
  const [overstyrt, setOverstyrt] = useState(null)
  const [bytter, setBytter] = useState(false)
  const kode = overstyrt || team.invite_code

  const lenke = `${window.location.origin}/?lag=${encodeURIComponent(kode)}`
  const invitasjon = t('csInviteText')
    .replace('{lag}', team.name)
    .replace('{lenke}', lenke)
    .replace('{kode}', kode)

  const kopier = async (tekst, hva) => {
    try {
      await navigator.clipboard.writeText(tekst)
      setKopiert(hva); setTimeout(() => setKopiert(null), 2000)
    } catch {
      setKopiert('feil'); setTimeout(() => setKopiert(null), 3000)
    }
  }

  async function nyKode() {
    if (!confirm(t('lkNewConfirm'))) return
    setBytter(true)
    const { data, error } = await supabase.rpc('ny_invitasjonskode', { p_team: team.id })
    setBytter(false)
    if (error) return alert(error.message)
    setOverstyrt(data)
    onEndret?.()
  }

  return (
    <div className="lk">
      <div className="cs-kode">
        <code>{kode}</code>
        <button type="button" className="btn small primary" onClick={() => kopier(lenke, 'lenke')}>
          {kopiert === 'lenke' ? t('csCopied') : t('csCopyLink')}
        </button>
        <button type="button" className="btn small" onClick={() => kopier(invitasjon, 'tekst')}>
          {kopiert === 'tekst' ? t('csCopied') : t('csCopyText')}
        </button>
      </div>
      <p className="lk-lenke"><a href={lenke}>{lenke}</a></p>
      {kanBytte && (
        <button type="button" className="btn link small" disabled={bytter} onClick={nyKode}>
          {bytter ? t('lkNewBusy') : t('lkNew')}
        </button>
      )}
      {kopiert === 'feil' && <p className="error" style={{ margin: '6px 0 0' }}>{t('csCopyFailed')}</p>}
    </div>
  )
}
