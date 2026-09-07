export const MN = ['', 'jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
export const MONTHS = { '2026-11': 'November 2026', '2026-12': 'Desember 2026', '2027-01': 'Januar 2027', '2027-02': 'Februar 2027', '2027-03': 'Mars 2027', '2027-04': 'April 2027' }
export const COLORS = { NOR: '#C8102E', SWE: '#0A5CB0', FIN: '#2E8B57' }
export const color = c => COLORS[c] || '#7B4FBF'
export const grp = c => ['NOR', 'SWE', 'FIN'].includes(c) ? c : 'EUR'
export function fmt(r) {
  const [, m1, d1] = r.start_date.split('-'), [, m2, d2] = r.end_date.split('-')
  if (r.start_date === r.end_date) return `${+d1}. ${MN[+m1]}`
  if (m1 === m2) return `${+d1}–${+d2}. ${MN[+m1]}`
  return `${+d1}. ${MN[+m1]}–${+d2}. ${MN[+m2]}`
}
export const days = r => Math.round((new Date(r.end_date) - new Date(r.start_date)) / 864e5) + 1
export const fisUrl = r => r.fis_event_id ? `https://www.fis-ski.com/DB/general/event-details.html?sectorcode=AL&eventid=${r.fis_event_id}&seasoncode=2027` : null
export const STATUS = {
  planned: 'Planlagt', entered: 'Påmeldt', wish: 'Ønsker', reserve: 'Reserve', unavailable: 'Kan ikke'
}
// Traffic light. The CSS custom properties --st-* are the real source and are
// theme-aware; these are the light-theme values for anything that still needs
// a plain string.
export const STATUS_COLOR = { planned: '#15803D', entered: '#064E3B', wish: '#E0A030', reserve: '#1D5FD1', unavailable: '#DC2626' }
export function overlaps(a, b) { return a.start_date <= b.end_date && b.start_date <= a.end_date }
