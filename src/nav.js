// The bottom bar has four slots but the app has five or six tabs, so the
// mapping between them is explicit rather than implied by the pane state.
// Keeping it here makes it testable without rendering the whole app.

// Which tab a bottom-bar button should open. 'map' and 'filter' never change
// the tab — they switch the pane or open the filter sheet.
export function tabForNav(key, { isParent = false } = {}) {
  if (key === 'plan') return isParent ? 'children' : 'plan'
  if (key === 'list') return 'races'
  return null
}

// Which bottom-bar button should read as active for a given tab and pane.
export function navForState(activeTab, pane, { isParent = false } = {}) {
  if (pane === 'map') return 'map'
  if (activeTab === 'plan' || (isParent && activeTab === 'children')) return 'plan'
  return 'list'
}
