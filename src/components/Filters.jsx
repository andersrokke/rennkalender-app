import { grp } from '../util'

export const initialFilter = { country: new Set(['NOR', 'SWE', 'FIN', 'EUR']), gender: new Set(['W', 'M']), month: 'all', disc: new Set(), cat: new Set() }

export function applyFilter(races, f) {
  return races.filter(r => {
    if (!f.country.has(grp(r.host_nation))) return false
    if (!r.gender.split(' ').some(g => f.gender.has(g))) return false
    if (f.month !== 'all' && !(r.start_date.startsWith(f.month) || r.end_date.startsWith(f.month))) return false
    if (f.disc.size && ![...f.disc].some(d => r.events.includes(d))) return false
    if (f.cat.size && ![...f.cat].some(c => r.category.split(' • ').includes(c))) return false
    return true
  })
}

const MONTHS = [['all', 'Alle'], ['2026-11', 'Nov'], ['2026-12', 'Des'], ['2027-01', 'Jan'], ['2027-02', 'Feb'], ['2027-03', 'Mar'], ['2027-04', 'Apr']]

export default function Filters({ f, setF, view, setView, extra }) {
  const toggle = (key, v) => setF(p => { const s = new Set(p[key]); s.has(v) ? s.delete(v) : s.add(v); return { ...p, [key]: s } })
  const Chip = ({ k, v, cls = '', label }) => <button className={`chip ${cls} ${f[k].has(v) ? 'on' : ''}`} onClick={() => toggle(k, v)}>{label}</button>
  return (
    <div className="controls">
      <div className="group"><span>Land</span>
        <Chip k="country" v="NOR" cls="nor" label="Norge" /><Chip k="country" v="SWE" cls="swe" label="Sverige" />
        <Chip k="country" v="FIN" cls="fin" label="Finland" /><Chip k="country" v="EUR" cls="eur" label="Europacup-land" />
      </div>
      {setView && <div className="group"><span>Kart</span>
        {[['norden', 'Norden'], ['alpene', 'Alpene'], ['europa', 'Europa']].map(([k, l]) => <button key={k} className={`chip ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{l}</button>)}
      </div>}
      <div className="group"><span>Kjønn</span><Chip k="gender" v="W" label="Damer" /><Chip k="gender" v="M" label="Menn" /></div>
      <div className="group"><span>Måned</span>
        {MONTHS.map(([k, l]) => <button key={k} className={`chip ${f.month === k ? 'on' : ''}`} onClick={() => setF(p => ({ ...p, month: k }))}>{l}</button>)}
      </div>
      <div className="group"><span>Disiplin</span>{['SL', 'GS', 'SG', 'DH'].map(d => <Chip key={d} k="disc" v={d} label={d} />)}</div>
      <div className="group"><span>Kategori</span>{['FIS', 'ENL', 'NJR', 'NJC', 'NC', 'EC'].map(c => <Chip key={c} k="cat" v={c} label={c} />)}</div>
      {extra}
    </div>
  )
}
