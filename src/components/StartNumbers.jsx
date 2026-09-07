import { useT } from '../i18n'
import { raceDisciplines } from './useStartNumbers'

const num = n => Number(n).toLocaleString('nb-NO', { maximumFractionDigits: 1 })

// "GS: nr. 12 av 60 · trekkes 1–15" when inside the draw group,
// otherwise "SL: nr. 23 av 60 · startnr. 23 · 4,1 p fra trekning".
export default function StartNumbers({ race, byKey }) {
  const t = useT()
  const rows = raceDisciplines(race)
    .map(d => [d, byKey[`${race.id}|${d}`]])
    .filter(([, v]) => v)
  if (!rows.length) return null

  return (
    <div className="starts">
      {rows.map(([d, v]) => {
        const inDraw = v.draw_group != null && v.rank_by_points <= v.draw_group
        return (
          <span key={d} className={`startno ${inDraw ? 'draw' : ''}`}>
            <b>{d}:</b> {t('bibNo')} {v.rank_by_points} {t('ofN')} {v.entries}
            {inDraw
              ? <> · {t('drawn')} 1–{v.draw_group}</>
              : <>{v.predicted_bib != null && <> · {t('bib')} {v.predicted_bib}</>}
                  {v.gap_to_draw != null && <> · {num(v.gap_to_draw)} {t('pToDraw')}</>}</>}
          </span>
        )
      })}
    </div>
  )
}
