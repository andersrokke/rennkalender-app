import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { color, fmt, days, fisUrl } from '../util'
import { heatColor } from './useSignups'

export default function RaceMap({ races, focus, view = 'norden', routes, home, heat, signups, maxSignups = 1 }) {
  const el = useRef(null), map = useRef(null), layer = useRef(null), markers = useRef({}), routeLayer = useRef(null)

  useEffect(() => {
    if (map.current) return
    map.current = L.map(el.current).setView([64.5, 18.5], 5)
    map.current.attributionControl.setPrefix('')
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap-bidragsytere', maxZoom: 19
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    routeLayer.current = L.layerGroup().addTo(map.current)
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
      // In heatmap mode a venue takes the colour of its busiest race.
      const peak = Math.max(0, ...v.r.map(r => signups?.[r.id]?.participants || 0))
      const fill = heat ? heatColor(peak, maxSignups) : color(v.country)
      const m = L.circleMarker([v.venue.lat, v.venue.lng], {
        radius: 6 + Math.sqrt(nd) * 2.2, color: '#fff', weight: 2, fillColor: fill, fillOpacity: .88
      }).addTo(layer.current)
      m.bindTooltip(v.place, { direction: 'top', offset: [0, -8] })
      m.bindPopup(`<b>${v.place}</b> (${v.country})` + v.r.map(r => {
        const sg = signups?.[r.id]
        const n = sg ? ` · <b>${sg.participants} påmeldte</b>` : ''
        return `<div>${fmt(r)} · ${r.category} · ${r.events}${n}${fisUrl(r) ? ` · <a href="${fisUrl(r)}" target="_blank" rel="noopener">FIS ↗</a>` : ''}</div>`
      }).join(''))
      markers.current[v.place + v.country] = m
    })
  }, [races, heat, signups, maxSignups])

  // Season planner: dashed route per trip, plus a house pin on the home base.
  useEffect(() => {
    if (!routeLayer.current) return
    routeLayer.current.clearLayers()
    if (home) {
      L.marker(home, {
        interactive: false,
        icon: L.divIcon({
          className: 'home-pin', iconSize: [26, 26], iconAnchor: [13, 13],
          html: '<div class="home-pin-dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="#1a1200"><path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg></div>'
        })
      }).addTo(routeLayer.current)
    }
    ;(routes || []).forEach(t => {
      L.polyline(t.points, { color: t.color, weight: 2.5, opacity: .85, dashArray: '6 6' }).addTo(routeLayer.current)
    })
  }, [routes, home])

  useEffect(() => {
    if (!focus) return
    const m = markers.current[focus.place + focus.host_nation]
    if (m) { map.current.flyTo(m.getLatLng(), 8, { duration: .8 }); m.openPopup() }
  }, [focus])

  return (
    <div className="mapwrap">
      <div ref={el} className="map" />
      {heat && (
        <div className="legend"><span>få</span><span className="g" /><span>mange påmeldte</span></div>
      )}
    </div>
  )
}
