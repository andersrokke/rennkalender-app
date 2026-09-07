import { useEffect, useState } from 'react'
import { useT } from '../i18n'

// "Add to home screen". Chrome/Android fires beforeinstallprompt; iOS Safari
// never does, so there we show the manual Share -> Add to Home Screen hint.
export default function InstallPrompt() {
  const t = useT()
  const [deferred, setDeferred] = useState(null)
  const [iosHint, setIosHint] = useState(false)
  const [gone, setGone] = useState(() => {
    try { return localStorage.getItem('rk-install') === 'off' } catch { return false }
  })

  useEffect(() => {
    const onPrompt = e => { e.preventDefault(); setDeferred(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (ios && !standalone) setIosHint(true)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    setGone(true)
    try { localStorage.setItem('rk-install', 'off') } catch { /* private mode */ }
  }
  if (gone || (!deferred && !iosHint)) return null

  return (
    <div className="install">
      <span>{deferred ? t('installBody') : t('installIos')}</span>
      {deferred && <button className="btn small primary" onClick={async () => {
        deferred.prompt(); await deferred.userChoice; setDeferred(null); dismiss()
      }}>{t('install')}</button>}
      <button className="btn small" onClick={dismiss}>{t('later')}</button>
    </div>
  )
}
