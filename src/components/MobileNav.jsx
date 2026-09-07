import { useT } from '../i18n'

const ICONS = {
  map: <><path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z" /><path d="M9 3v16M15 5v16" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  plan: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  filter: <path d="M3 5h18M6 12h12M10 19h4" />
}

// Bottom navigation, mobile only (<= 820px). Mirrors the prototype's tab bar.
export default function MobileNav({ active, onPick, planCount }) {
  const t = useT()
  const items = [['map', t('tabMap')], ['list', t('tabList')], ['plan', t('tabPlanM')], ['filter', t('tabFilter')]]
  return (
    <nav className="tabbar">
      {items.map(([k, label]) => (
        <button key={k} className={active === k ? 'on' : ''} onClick={() => onPick(k)}>
          <svg viewBox="0 0 24 24">{ICONS[k]}</svg>
          <span>{label}</span>
          {k === 'plan' && planCount > 0 && <span className="badge">{planCount}</span>}
        </button>
      ))}
    </nav>
  )
}
