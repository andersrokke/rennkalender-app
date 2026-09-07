import { LANGS, setLang } from '../i18n'
export default function LangSwitch({ lang, onChange, dark }) {
  return (
    <div className={'langsw' + (dark ? ' dark' : '')}>
      {LANGS.map(([code, label]) => (
        <button key={code} type="button" className={lang === code ? 'on' : ''}
          onClick={() => { setLang(code); onChange(code) }}>{label}</button>
      ))}
    </div>
  )
}
