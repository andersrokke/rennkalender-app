import { fmt, fisUrl, grp, MONTHS } from '../util'

// races: array; renderExtra(race) -> node; onSelect(race)
export default function RaceList({ races, onSelect, active, renderExtra, selectedIds }) {
  if (!races.length) return <div className="list"><div className="empty">Ingen renn passer filtrene.</div></div>
  let cur = ''
  const out = []
  races.forEach(r => {
    const mk = r.start_date.slice(0, 7)
    if (mk !== cur) {
      cur = mk
      const n = races.filter(x => x.start_date.slice(0, 7) === mk).length
      out.push(<div className="month" key={'m' + mk}>{MONTHS[mk] || mk}<em>{n} renn</em></div>)
    }
    const g = grp(r.host_nation)
    out.push(
      <div key={r.id}
        className={`race ${g.toLowerCase()} ${onSelect ? 'clickable' : ''} ${active?.id === r.id ? 'active' : ''} ${selectedIds?.has(r.id) ? 'selected' : ''}`}
        onClick={e => { if (e.target.closest('a,button,select,textarea,input')) return; onSelect?.(r) }}>
        <div className="date">{fmt(r)}</div>
        <div>
          <span className="place">{r.place}</span>
          {g === 'EUR' && <span className="tag">{r.host_nation}</span>}
          {r.organiser_nation && <span className="tag">{r.organiser_nation}-arrangert</span>}
          {r.gender === 'M' && <span className="tag">kun menn</span>}
          {r.gender === 'W' && <span className="tag">kun damer</span>}
          {r.note && !r.note.endsWith('-arrangert') && <span className="tag warn">{r.note}</span>}
          <div className="cat">{r.category}</div>
          {renderExtra && <div style={{ marginTop: 6 }}>{renderExtra(r)}</div>}
        </div>
        <div className="ev">{r.events}{fisUrl(r) && <><br /><a href={fisUrl(r)} target="_blank" rel="noopener">FIS-side ↗</a></>}</div>
      </div>
    )
  })
  return <div className="list">{out}</div>
}
