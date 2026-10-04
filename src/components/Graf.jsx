import { Rectangle } from 'recharts'

// Felles utseende for alle grafer: rolige akser uten streker, vannrette
// hjelpelinjer, et eget kort som verktøytips og en forklaring med prikker.
// Fargene kommer fra tokenene, så grafene følger lys og mørk modus.

export const AKSE = {
  tick: { fontSize: 11, fill: 'var(--mute)', fontFamily: 'var(--mono, inherit)' },
  axisLine: false, tickLine: false, tickMargin: 8
}
// Loddrett akse med fast bredde, så tallene ikke klippes på smale skjermer.
export const Y_AKSE = { ...AKSE, width: 48 }
export const RUTENETT = { stroke: 'var(--line)', strokeDasharray: '0', vertical: false }
export const SESONG_ETIKETT = { fill: 'var(--mute)', fontSize: 11, fontWeight: 600, fontFamily: 'var(--mono, inherit)' }
export const FULLFORT = '#2F9C74'
export const UTE = '#E8676B'

// Toning under en linje: full farge øverst som tones ut mot bunnen.
export function Toning({ id, farge, styrke = 0.22 }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={farge} stopOpacity={styrke} />
      <stop offset="100%" stopColor={farge} stopOpacity={0} />
    </linearGradient>
  )
}

// Verktøytips. tittel(label, payload) gir overskriften, verdi(rad) teksten
// for hver serie; uten dem brukes det Recharts selv ville vist.
export function GrafTips({ active, payload, label, tittel, verdi }) {
  if (!active || !payload?.length) return null
  const rader = payload.filter(p => p.value != null)
  if (!rader.length) return null
  return (
    <div className="graf-tips">
      <div className="graf-tips-tittel">{tittel ? tittel(label, payload) : label}</div>
      {rader.map(p => (
        <div className="graf-tips-rad" key={p.dataKey}>
          <i style={{ background: p.color || p.fill || p.stroke }} />
          <span>{p.name}</span>
          <b>{verdi ? verdi(p) : p.value}</b>
        </div>
      ))}
    </div>
  )
}

export function GrafForklaring({ payload }) {
  if (!payload?.length) return null
  return (
    <div className="graf-forklaring">
      {/* Flater som bare er toning under en linje skal ikke stå i forklaringen. */}
      {payload.filter(p => p.type !== 'none').map(p => <span key={p.value}><i style={{ background: p.color }} />{p.value}</span>)}
    </div>
  )
}

// Tallet over et punkt i en graf med få punkter.
export const PUNKT_ETIKETT = { fontSize: 11, fontWeight: 600, fill: 'var(--slate)', fontFamily: 'var(--mono, inherit)' }

// Punkt på en linje: hvit kjerne med farget ring, så punktene synes også der
// linjene krysser.
export const punkt = farge => ({ r: 3.5, fill: 'var(--snow)', stroke: farge, strokeWidth: 2 })
export const aktivtPunkt = farge => ({ r: 6, fill: farge, stroke: 'var(--snow)', strokeWidth: 2 })

// Stolpe i en stabel som bare får avrundet topp når den faktisk er øverst.
export function StabelStolpe({ overst, ...props }) {
  const topp = overst ? overst(props.payload) : true
  return <Rectangle {...props} radius={topp ? [6, 6, 0, 0] : 0} />
}
