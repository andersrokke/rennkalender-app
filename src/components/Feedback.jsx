import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Tilbakemeldinger. Samme skjerm har to ansikter: alle sender inn og ser sine
// egne saker med status, og den som er merket is_admin ser alle og kan svare.
//
// Statusen er hele poenget med å lagre i basen framfor å sende en e-post.
// Uten den vet ikke den som meldte fra om noen har sett det, og da slutter
// folk å melde fra.

const KINDS = ['idea', 'bug']
const STATUSES = ['new', 'planned', 'doing', 'done', 'declined']
// Verdiene er de samme nøklene som fanene i App.jsx, pluss «generelt».
const AREAS = ['general', 'training', 'next', 'mine', 'races', 'dev', 'settings', 'children', 'login']

const MAX_TITLE = 140
const MAX_BODY = 4000
const fmt = d => new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })

export default function Feedback({ profile }) {
  const t = useT()
  const isAdmin = !!profile.is_admin

  const [kind, setKind] = useState('idea')
  const [area, setArea] = useState('general')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const [mine, setMine] = useState([])
  const [all, setAll] = useState([])

  const cols = 'id, created_at, kind, area, title, body, status, admin_note'

  const load = () => {
    supabase.from('feedback').select(cols).eq('author_id', profile.id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setMine(data || []))
    if (isAdmin) {
      supabase.from('feedback')
        .select(cols + ', user_agent, author:profiles!feedback_author_id_fkey(full_name)')
        .order('created_at', { ascending: false }).limit(200)
        .then(({ data }) => setAll(data || []))
    }
  }
  useEffect(() => { load() }, [profile.id])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('feedback').insert({
      author_id: profile.id,
      kind,
      area,
      title: title.trim(),
      body: body.trim() || null,
      // Hjelper når feilen bare finnes i én nettleser. Kuttes til det basen
      // godtar, så en uvanlig lang streng ikke velter innsendingen.
      user_agent: navigator.userAgent.slice(0, 400)
    })
    setBusy(false)
    if (error) return setMsg({ bad: true, text: error.message })
    setTitle(''); setBody(''); setArea('general')
    setMsg({ text: t('fbSaved') })
    load()
  }

  return (
    <div className="page">
      <div className="card">
        <h2>{t('fbTitle')}</h2>
        <p className="muted">{t('fbSub')}</p>

        <form onSubmit={submit}>
          <label>{t('fbKind')}</label>
          <div className="row" style={{ gap: 6 }}>
            {KINDS.map(k => (
              <button key={k} type="button" aria-pressed={kind === k}
                className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                {t('fbKind_' + k)}
              </button>
            ))}
          </div>

          <div className="tl-grid">
            <div style={{ gridColumn: 'span 2' }}>
              <label htmlFor="fb-title">
                {kind === 'bug' ? t('fbTitleBug') : t('fbTitleIdea')}
              </label>
              <input id="fb-title" required minLength={3} maxLength={MAX_TITLE}
                value={title} onChange={e => setTitle(e.target.value)}
                placeholder={kind === 'bug' ? t('fbTitleBugPh') : t('fbTitleIdeaPh')} />
            </div>
            <div>
              <label htmlFor="fb-area">{t('fbArea')}</label>
              <select id="fb-area" value={area} onChange={e => setArea(e.target.value)}>
                {AREAS.map(a => <option key={a} value={a}>{t('fbArea_' + a)}</option>)}
              </select>
            </div>
          </div>

          <label htmlFor="fb-body">
            {kind === 'bug' ? t('fbBodyBug') : t('fbBodyIdea')}
          </label>
          <textarea id="fb-body" rows={5} maxLength={MAX_BODY} value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={kind === 'bug' ? t('fbBodyBugPh') : t('fbBodyIdeaPh')} />

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={busy || title.trim().length < 3}>
              {busy ? t('fbSending') : t('fbSend')}
            </button>
            {msg && <span className={msg.bad ? 'error' : 'notice'} style={{ margin: 0 }}>{msg.text}</span>}
          </div>
        </form>
      </div>

      {mine.length > 0 && (
        <div className="card">
          <h2>{t('fbMine')}</h2>
          <ul className="fb-list">
            {mine.map(f => <Item key={f.id} f={f} t={t} />)}
          </ul>
        </div>
      )}

      {isAdmin && (
        <div className="card">
          <h2>{t('fbAll')} <span className="muted">({all.length})</span></h2>
          {all.length === 0
            ? <p className="muted">{t('fbNone')}</p>
            : <ul className="fb-list">
              {all.map(f => <Triage key={f.id} f={f} t={t} onSaved={load} />)}
            </ul>}
        </div>
      )}
    </div>
  )
}

function Head({ f, t }) {
  return (
    <div className="fb-head">
      <span className={`fb-kind ${f.kind}`}>{t('fbKind_' + f.kind)}</span>
      <b>{f.title}</b>
      <span className={`fb-status ${f.status}`}>{t('fbStatus_' + f.status)}</span>
    </div>
  )
}

function Item({ f, t }) {
  return (
    <li className="fb-item">
      <Head f={f} t={t} />
      {f.body && <p className="fb-body">{f.body}</p>}
      <p className="muted fb-meta">{fmt(f.created_at)} · {t('fbArea_' + f.area)}</p>
      {f.admin_note && <p className="fb-note"><b>{t('fbReply')}</b> {f.admin_note}</p>}
    </li>
  )
}

function Triage({ f, t, onSaved }) {
  const [status, setStatus] = useState(f.status)
  const [note, setNote] = useState(f.admin_note || '')
  const [busy, setBusy] = useState(false)
  const dirty = status !== f.status || note !== (f.admin_note || '')

  async function save() {
    setBusy(true)
    await supabase.from('feedback')
      .update({ status, admin_note: note.trim() || null }).eq('id', f.id)
    setBusy(false)
    onSaved()
  }

  return (
    <li className="fb-item">
      <Head f={{ ...f, status }} t={t} />
      {f.body && <p className="fb-body">{f.body}</p>}
      <p className="muted fb-meta">
        #{f.id} · {fmt(f.created_at)} · {f.author?.full_name || t('fbUnknown')} · {t('fbArea_' + f.area)}
        {f.user_agent && <> · <span title={f.user_agent}>{browser(f.user_agent)}</span></>}
      </p>
      <div className="fb-triage">
        <select aria-label={t('fbStatus')} value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{t('fbStatus_' + s)}</option>)}
        </select>
        <input value={note} onChange={e => setNote(e.target.value)}
          aria-label={t('fbReply')} placeholder={t('fbReplyPh')} />
        <button type="button" className="btn small" disabled={busy || !dirty} onClick={save}>
          {busy ? t('fbSending') : t('fbTriageSave')}
        </button>
      </div>
    </li>
  )
}

// Hele user agent-strengen er uleselig i en liste. Navnet på nettleseren er
// det man trenger for å se et mønster; resten ligger i title-attributtet.
function browser(ua) {
  if (/edg\//i.test(ua)) return 'Edge'
  if (/chrome|crios/i.test(ua)) return 'Chrome'
  if (/firefox|fxios/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua)) return 'Safari'
  return 'Annen'
}
