'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { lt, LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales'
import { formatEventDate, formatEventDateRange } from '@/lib/dates'
import { Button } from '@/components/ui'
import publicStyles from '@/app/[locale]/(public)/events/[slug]/event.module.css'
import styles from './event-page.module.css'

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M13.6 2.9a1.8 1.8 0 0 1 2.5 2.5l-8.9 8.9-3.4.9.9-3.4 8.9-8.9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Wraps a rendered region of the public page. Shows a transparent pencil on
 * hover; clicking switches the region into inline editing (renderEdit).
 */
function Editable({ label, editing, onStart, children, renderEdit }) {
  if (editing) return <div className={styles.editing}>{renderEdit()}</div>
  return (
    <div className={styles.editable}>
      {children}
      <button
        type="button"
        className={styles.pencil}
        aria-label={label}
        title={label}
        onClick={onStart}
      >
        <PencilIcon />
      </button>
    </div>
  )
}

export function EventPageEditor({ initialEvent }) {
  const t = useTranslations('console')
  const tEvent = useTranslations('event')
  const uiLocale = useLocale()
  const supabase = getSupabaseBrowserClient()

  const [event, setEvent] = useState(initialEvent)
  const [previewLocale, setPreviewLocale] = useState(
    LOCALES.includes(uiLocale) ? uiLocale : initialEvent.default_locale
  )
  const [editingField, setEditingField] = useState(null) // 'name' | 'description' | 'location' | 'contact'
  const [draftValue, setDraftValue] = useState('')
  const [draftContact, setDraftContact] = useState({})
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const publicUrl = `${origin}/${previewLocale}/events/${event.slug}`

  async function persist(patch) {
    setSaveState('saving')
    const { error } = await supabase.from('events').update(patch).eq('id', event.id)
    if (error) {
      setSaveState('error')
    } else {
      setEvent((prev) => ({ ...prev, ...patch }))
      setSaveState('saved')
    }
    return !error
  }

  function startEdit(field) {
    if (field === 'contact') {
      setDraftContact(event.contact ?? {})
    } else {
      // Edit the raw value for the previewed locale (not the fallback).
      setDraftValue(event[field]?.[previewLocale] ?? '')
    }
    setEditingField(field)
  }

  async function saveLocalized(field) {
    const value = { ...(event[field] ?? {}), [previewLocale]: draftValue }
    const patch = { [field]: value }
    if (field === 'name') {
      patch.supported_locales = LOCALES.filter((l) => (value[l] ?? '').trim() !== '')
    }
    if (await persist(patch)) setEditingField(null)
  }

  async function saveContact() {
    if (await persist({ contact: draftContact })) setEditingField(null)
  }

  function cancelEdit() {
    setEditingField(null)
    setSaveState('idle')
  }

  function onTextKeyDown(e, field) {
    if (e.key === 'Enter' && field !== 'description') {
      e.preventDefault()
      saveLocalized(field)
    }
    if (e.key === 'Escape') cancelEdit()
  }

  async function uploadCover(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSaveState('saving')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${event.id}/cover-${Date.now().toString(36)}.${ext}`
    const { error } = await supabase.storage.from('event-covers').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (error) {
      setSaveState('error')
      return
    }
    await persist({ cover_image_path: path })
    e.target.value = ''
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — the URL is visible and selectable anyway.
    }
  }

  const coverUrl = event.cover_image_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-covers/${event.cover_image_path}`
    : null

  const now = Date.now()
  const opensAt = event.registration_opens_at ? Date.parse(event.registration_opens_at) : null
  const closesAt = event.registration_closes_at ? Date.parse(event.registration_closes_at) : null
  const notOpenYet = opensAt != null && now < opensAt
  const closed = closesAt != null && now > closesAt

  const name = lt(event.name, previewLocale, event.default_locale)
  const description = lt(event.description, previewLocale, event.default_locale)
  const location = lt(event.location, previewLocale, event.default_locale)
  const contact = event.contact ?? {}
  const hasContact = contact.name || contact.email || contact.phone || contact.website

  const inputClass = 'input'

  return (
    <div className={styles.wrap}>
      {/* Link + controls */}
      <section className={`card card-pad ${styles.toolbar}`}>
        <div className={styles.linkRow}>
          <span className={styles.linkLabel}>{t('publicLink')}</span>
          <code className={styles.link}>{publicUrl}</code>
          <div className={styles.linkActions}>
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {copied ? t('linkCopied') : t('copyLink')}
            </Button>
            {event.status === 'published' && (
              <a
                className="btn btn-secondary btn-sm"
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('openPage')}
              </a>
            )}
          </div>
        </div>
        {event.status !== 'published' && (
          <p className={`alert alert-info ${styles.draftNote}`}>{t('draftNote')}</p>
        )}
        <div className={styles.previewBar}>
          <p className={styles.hint}>{t('previewHint')}</p>
          <div className={styles.localeSwitch} role="tablist" aria-label="Preview language">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={previewLocale === l}
                data-active={previewLocale === l}
                onClick={() => {
                  setPreviewLocale(l)
                  setEditingField(null)
                }}
              >
                {LOCALE_NAMES[l]}
              </button>
            ))}
          </div>
          <div className={styles.saveStatus} aria-live="polite">
            {saveState === 'saved' && <span className="badge badge-confirmed">{t('saved')}</span>}
            {saveState === 'error' && <span className="badge badge-cancelled">{t('saveError')}</span>}
          </div>
        </div>
      </section>

      {/* The page, as attendees see it */}
      <section className={styles.frame}>
        <article>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={uploadCover}
          />
          {coverUrl ? (
            <div className={`${styles.editable} ${styles.coverWrap}`}>
              <div className={publicStyles.cover}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl} alt="" />
              </div>
              <button
                type="button"
                className={styles.pencil}
                aria-label={t('changeCover')}
                title={t('changeCover')}
                onClick={() => fileInputRef.current?.click()}
              >
                <PencilIcon />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.coverPlaceholder}
              onClick={() => fileInputRef.current?.click()}
            >
              <PencilIcon /> {t('addCover')}
            </button>
          )}

          <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
            <Editable
              label={t('edit')}
              editing={editingField === 'name'}
              onStart={() => startEdit('name')}
              renderEdit={() => (
                <div className={styles.editRow}>
                  <input
                    className={`${inputClass} ${styles.titleInput}`}
                    value={draftValue}
                    autoFocus
                    onChange={(e) => setDraftValue(e.target.value)}
                    onKeyDown={(e) => onTextKeyDown(e, 'name')}
                  />
                  <Button size="sm" onClick={() => saveLocalized('name')}>✓</Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>✕</Button>
                </div>
              )}
            >
              <h1 className="page-title">{name}</h1>
            </Editable>

            <dl className={publicStyles.meta}>
              <div className={styles.editable}>
                <dt>{tEvent('when')}</dt>
                <dd>
                  {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, previewLocale)}
                </dd>
                <Link
                  href={`/console/events/${event.id}/settings`}
                  className={styles.pencil}
                  aria-label={t('editDatesInSettings')}
                  title={t('editDatesInSettings')}
                >
                  <PencilIcon />
                </Link>
              </div>

              <Editable
                label={t('edit')}
                editing={editingField === 'location'}
                onStart={() => startEdit('location')}
                renderEdit={() => (
                  <div>
                    <dt>{tEvent('where')}</dt>
                    <div className={styles.editRow}>
                      <input
                        className={inputClass}
                        value={draftValue}
                        autoFocus
                        onChange={(e) => setDraftValue(e.target.value)}
                        onKeyDown={(e) => onTextKeyDown(e, 'location')}
                      />
                      <Button size="sm" onClick={() => saveLocalized('location')}>✓</Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>✕</Button>
                    </div>
                  </div>
                )}
              >
                <div>
                  <dt>{tEvent('where')}</dt>
                  <dd>{location || <span className={styles.empty}>{t('addLocation')}</span>}</dd>
                </div>
              </Editable>

              <Editable
                label={t('edit')}
                editing={editingField === 'contact'}
                onStart={() => startEdit('contact')}
                renderEdit={() => (
                  <div>
                    <dt>{tEvent('contact')}</dt>
                    <div className={styles.contactEdit}>
                      <input
                        className={inputClass}
                        placeholder={t('contactName')}
                        value={draftContact.name ?? ''}
                        autoFocus
                        onChange={(e) => setDraftContact({ ...draftContact, name: e.target.value })}
                      />
                      <input
                        className={inputClass}
                        type="email"
                        placeholder={t('contactEmail')}
                        value={draftContact.email ?? ''}
                        onChange={(e) => setDraftContact({ ...draftContact, email: e.target.value })}
                      />
                      <input
                        className={inputClass}
                        type="tel"
                        placeholder={t('contactPhone')}
                        value={draftContact.phone ?? ''}
                        onChange={(e) => setDraftContact({ ...draftContact, phone: e.target.value })}
                      />
                      <input
                        className={inputClass}
                        type="url"
                        placeholder={t('contactWebsite')}
                        value={draftContact.website ?? ''}
                        onChange={(e) => setDraftContact({ ...draftContact, website: e.target.value })}
                      />
                      <div className={styles.editRow}>
                        <Button size="sm" onClick={saveContact}>✓</Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>✕</Button>
                      </div>
                    </div>
                  </div>
                )}
              >
                <div>
                  <dt>{tEvent('contact')}</dt>
                  <dd>
                    {hasContact ? (
                      <>
                        {contact.name && <div>{contact.name}</div>}
                        {contact.email && <div>{contact.email}</div>}
                        {contact.phone && <div>{contact.phone}</div>}
                        {contact.website && <div>{contact.website}</div>}
                      </>
                    ) : (
                      <span className={styles.empty}>{t('addContact')}</span>
                    )}
                  </dd>
                </div>
              </Editable>
            </dl>

            <Editable
              label={t('edit')}
              editing={editingField === 'description'}
              onStart={() => startEdit('description')}
              renderEdit={() => (
                <div>
                  <textarea
                    className={`${inputClass} ${styles.descriptionInput}`}
                    rows={5}
                    value={draftValue}
                    autoFocus
                    onChange={(e) => setDraftValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                  <div className={styles.editRow}>
                    <Button size="sm" onClick={() => saveLocalized('description')}>✓</Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>✕</Button>
                  </div>
                </div>
              )}
            >
              {description ? (
                <p className={publicStyles.description}>{description}</p>
              ) : (
                <p className={`${publicStyles.description} ${styles.empty}`}>
                  {t('addDescription')}
                </p>
              )}
            </Editable>

            <div className={publicStyles.cta}>
              {closed ? (
                <p className="alert alert-info">{tEvent('registrationClosed')}</p>
              ) : notOpenYet ? (
                <p className="alert alert-info">
                  {tEvent('registrationNotOpen', {
                    date: formatEventDate(event.registration_opens_at, event.timezone, previewLocale),
                  })}
                </p>
              ) : (
                <span className={`btn btn-primary btn-lg ${styles.fakeButton}`} aria-disabled="true">
                  {tEvent('register')}
                </span>
              )}
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
