import { useState } from 'react'
import { useT } from '../i18n'

// Lagkoden, og lenka som gjør noe med den.
//
// Lenka står også som synlig tekst, ikke bare bak en kopieringsknapp.
// Utklippstavla er ikke til å stole på - den svikter i innebygde nettlesere,
// på sider som ikke har fokus, og i privat modus - og da satt man igjen med
// ingenting. Nå kan man alltid markere den og sende den selv.

export default function Lagkode({ team }) {
  const t = useT()
  const [kopiert, setKopiert] = useState(null)

  const lenke = `${window.location.origin}/?lag=${encodeURIComponent(team.invite_code)}`
  const invitasjon = t('csInviteText')
    .replace('{lag}', team.name)
    .replace('{lenke}', lenke)
    .replace('{kode}', team.invite_code)

  const kopier = async (tekst, hva) => {
    try {
      await navigator.clipboard.writeText(tekst)
      setKopiert(hva); setTimeout(() => setKopiert(null), 2000)
    } catch {
      setKopiert('feil'); setTimeout(() => setKopiert(null), 3000)
    }
  }

  return (
    <div className="lk">
      <div className="cs-kode">
        <code>{team.invite_code}</code>
        <button type="button" className="btn small primary" onClick={() => kopier(lenke, 'lenke')}>
          {kopiert === 'lenke' ? t('csCopied') : t('csCopyLink')}
        </button>
        <button type="button" className="btn small" onClick={() => kopier(invitasjon, 'tekst')}>
          {kopiert === 'tekst' ? t('csCopied') : t('csCopyText')}
        </button>
      </div>
      <p className="lk-lenke"><a href={lenke}>{lenke}</a></p>
      {kopiert === 'feil' && <p className="error" style={{ margin: '6px 0 0' }}>{t('csCopyFailed')}</p>}
    </div>
  )
}
