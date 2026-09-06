import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { color, fmt, days, fisUrl } from '../util'

export default function RaceMap({ races, focus, view = 'norden' }) {
  const el = useRef(null), map = useRef(null), layer = useRef(null), markers = useRef({})

  useEffect(() => {
    if (map.current) return
    map.current = L.map(el.current).setView([64.5, 18.5], 5)
    map.current.attributionControl.setPrefix('')
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap-bidragsytere', maxZoom: 19
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
  }, [])

  useEffect(() => {
    if (!map.current) return
    const v = { norden: [[64.5, 18.5], 5], alpene: [[46.6, 10.0], 7], europa: [[56, 14], 4] }[view]
    if (v) map.current.flyTo(v[0], v[1])
  }, [view])

  useEffect(() => {
    if (!layer.current) return
    layer.current.clearLayers(); markers.current = {}
    const byV = {}
    races.forEach(r => {
      if (!r.venue) return
      const k = r.place + r.host_nation
      ;(byV[k] = byV[k] || { r: [], venue: r.venue, place: r.place, country: r.host_nation }).r.push(r)
    })
    Object.values(byV).forEach(v => {
      const nd = v.r.reduce((s, r) => s + days(r), 0)
      const m = L.circleMarker([v.venue.lat, v.venue.lng], {
        radius: 6 + Math.sqrt(nd) * 2.2, color: '#fff', weight: 2, fillColor: color(v.country), fillOpacity: .88
      }).addTo(layer.current)
      m.bindTooltip(v.place, { direction: 'top', offset: [0, -8] })
      m.bindPopup(`<b>${v.place}</b> (${v.country})` + v.r.map(r =>
        `<div>${fmt(r)} · ${r.category} · ${r.events}${fisUrl(r) ? ` · <a href="${fisUrl(r)}" target="_blank" rel="noopener">FIS ↗</a>` : ''}</div>`).join(''))
      markers.current[v.place + v.country] = m
    })
  }, [races])

  useEffect(() => {
    if (!focus) return
    const m = markers.current[focus.place + focus.host_nation]
    if (m) { map.current.flyTo(m.getLatLng(), 8, { duration: .8 }); m.openPopup() }
  }, [focus])

  return <div ref={el} className="map" />
}
