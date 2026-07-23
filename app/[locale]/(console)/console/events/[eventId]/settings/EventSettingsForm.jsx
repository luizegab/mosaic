'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { LOCALES, LOCALE_NAMES, eventLocales } from '@/lib/i18n/locales'
import { toLocalInput, fromLocalInput } from '@/lib/dates'
import { PARTICIPANT_TYPE_PRESETS, uniqueTypeKey } from '@/lib/participant-type-presets'
import {
  Button,
  Checkbox,
  ConfettiBurst,
  Dialog,
  Field,
  Input,
  PreferenceDateInput,
  Textarea,
  NativeSelect,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui'
import styles from './settings.module.css'

export function EventSettingsForm({ event, initialTypes, forms }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [name, setName] = useState(event.name ?? {})
  const [description, setDescription] = useState(event.description ?? {})
  const [location, setLocation] = useState(event.location ?? {})
  // Built-in languages this event offers. Custom (organizer-defined) languages
  // are managed on the Event Page tab; this checklist covers the platform set.
  const [supportedLocales, setSupportedLocales] = useState(
    eventLocales(event).filter((l) => LOCALES.includes(l))
  )
  const [defaultLocale, setDefaultLocale] = useState(event.default_locale ?? 'en')
  const [contentTab, setContentTab] = useState(event.default_locale ?? 'en')
  const [slug, setSlug] = useState(event.slug)
  const [timezone, setTimezone] = useState(event.timezone)
  const [startsAt, setStartsAt] = useState(toLocalInput(event.starts_at, event.timezone))
  const [endsAt, setEndsAt] = useState(toLocalInput(event.ends_at, event.timezone))
  const [regOpens, setRegOpens] = useState(toLocalInput(event.registration_opens_at, event.timezone))
  const [regCloses, setRegCloses] = useState(toLocalInput(event.registration_closes_at, event.timezone))
  const [capacity, setCapacity] = useState(event.capacity ?? '')
  const [visibility, setVisibility] = useState(event.visibility ?? 'public')
  const [contact, setContact] = useState(event.contact ?? {})
  const [types, setTypes] = useState(initialTypes)
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const [publishBurst, setPublishBurst] = useState(null)
  const [slugWarnOpen, setSlugWarnOpen] = useState(false)

  const timezones = Intl.supportedValuesOf?.('timeZone') ?? ['UTC']

  // Serialize the Save-button fields so we can tell whether there are unsaved
  // edits (participant types persist immediately and are excluded). Slug is
  // passed explicitly because "revert & save" writes a value the state hasn't
  // caught up to yet.
  function snapshot(slugValue = slug) {
    return JSON.stringify([
      name, description, location, slugValue, timezone,
      startsAt, endsAt, regOpens, regCloses, capacity, visibility, contact,
      supportedLocales, defaultLocale,
    ])
  }
  // Baseline = last known saved state. Initialized to the values first loaded
  // from the event; reset after every successful save.
  const [savedSnap, setSavedSnap] = useState(() => snapshot())
  const dirty = snapshot() !== savedSnap

  // Changing the slug breaks every existing link to this event's public page,
  // so confirm before committing a change. An unchanged slug saves directly.
  function requestSave() {
    if (slug !== event.slug) {
      setSlugWarnOpen(true)
      return
    }
    save()
  }

  // Add/remove a language from the event's supported set, keeping canonical
  // LOCALES order. The default language is locked on and can't be removed.
  function toggleLocale(l) {
    if (l === defaultLocale) return
    setSupportedLocales((prev) =>
      prev.includes(l)
        ? prev.filter((x) => x !== l)
        : LOCALES.filter((x) => prev.includes(x) || x === l)
    )
  }

  // Switching the default language pulls it into the supported set so an
  // event can never default to a language it doesn't offer.
  function changeDefaultLocale(l) {
    setDefaultLocale(l)
    setSupportedLocales((prev) =>
      prev.includes(l) ? prev : LOCALES.filter((x) => prev.includes(x) || x === l)
    )
  }

  async function save(slugValue = slug) {
    setSlugWarnOpen(false)
    setSaveState('saving')
    // Language selection lives in page_content.i18n.available (shared with the
    // Event Page editor). Preserve organizer-defined custom languages that are
    // enabled there, and keep the legacy column + default locale in sync.
    const existingContent = event.page_content ?? {}
    const existingI18n = existingContent.i18n ?? {}
    const customCodes = Array.isArray(existingI18n.custom)
      ? existingI18n.custom.map((c) => c.code)
      : []
    const keptCustoms = (Array.isArray(existingI18n.available) ? existingI18n.available : [])
      .filter((c) => customCodes.includes(c))
    const nextAvailable = [...supportedLocales, ...keptCustoms]

    const { error } = await supabase
      .from('events')
      .update({
        name,
        description,
        location,
        slug: slugValue,
        timezone,
        starts_at: fromLocalInput(startsAt, timezone),
        ends_at: fromLocalInput(endsAt, timezone),
        registration_opens_at: fromLocalInput(regOpens, timezone),
        registration_closes_at: fromLocalInput(regCloses, timezone),
        capacity: capacity === '' ? null : Number(capacity),
        visibility,
        contact,
        default_locale: defaultLocale,
        supported_locales: supportedLocales,
        page_content: { ...existingContent, i18n: { ...existingI18n, available: nextAvailable } },
      })
      .eq('id', event.id)
    if (error) {
      setSaveState('error')
      return
    }
    setSaveState('saved')
    setSavedSnap(snapshot(slugValue))
    router.refresh()
  }

  // Slug dialog: discard the slug edit (restore event.slug) and save the rest.
  function revertSlugAndSave() {
    setSlug(event.slug)
    save(event.slug)
  }

  async function setStatus(status) {
    const { error } = await supabase.from('events').update({ status }).eq('id', event.id)
    if (!error) {
      if (status === 'published') setPublishBurst(Date.now())
      router.refresh()
    }
  }

  async function addType(preset) {
    const base = preset ?? { key: `type_${Date.now().toString(36)}`, name: { en: 'New type' } }
    const key = uniqueTypeKey(base.key, types.map((pt) => pt.key))
    const { data, error } = await supabase
      .from('participant_types')
      .insert({
        event_id: event.id,
        key,
        name: base.name,
        form_id: forms[0]?.id ?? null,
        sort_order: types.length,
      })
      .select('*')
      .single()
    if (!error && data) setTypes((prev) => [...prev, data])
    setTypePickerOpen(false)
  }

  async function updateType(id, patch) {
    setTypes((prev) => prev.map((pt) => (pt.id === id ? { ...pt, ...patch } : pt)))
    await supabase.from('participant_types').update(patch).eq('id', id)
  }

  async function removeType(id) {
    const { error } = await supabase.from('participant_types').delete().eq('id', id)
    if (!error) setTypes((prev) => prev.filter((pt) => pt.id !== id))
  }

  return (
    <div className={styles.wrap}>
      <section className="card card-pad">
        <h2 style={{ marginBottom: 'var(--s-2)' }}>{t('languages')}</h2>
        <p className={styles.sectionHelp}>{t('languagesHelp')}</p>
        <div className={styles.localeList}>
          {LOCALES.map((l) => {
            const checked = supportedLocales.includes(l)
            const isDefault = l === defaultLocale
            return (
              <label key={l} className={styles.localeRow}>
                <Checkbox
                  checked={checked}
                  disabled={isDefault}
                  onCheckedChange={() => toggleLocale(l)}
                />
                <span>{LOCALE_NAMES[l]}</span>
                {isDefault && <span className="badge">{t('defaultLanguage')}</span>}
              </label>
            )
          })}
        </div>
        <Field label={t('defaultLanguage')} help={t('defaultLanguageHelp')}>
          {({ id }) => (
            <NativeSelect
              id={id}
              value={defaultLocale}
              onChange={(e) => changeDefaultLocale(e.target.value)}
              style={{ maxWidth: '16rem' }}
            >
              {supportedLocales.map((l) => (
                <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </section>

      <section className="card card-pad">
        {/* Localized content, one tab per supported locale */}
        <Tabs
          value={supportedLocales.includes(contentTab) ? contentTab : defaultLocale}
          onValueChange={setContentTab}
        >
          <TabsList>
            {supportedLocales.map((l) => (
              <TabsTrigger key={l} value={l}>
                {LOCALE_NAMES[l]}
              </TabsTrigger>
            ))}
          </TabsList>
          {supportedLocales.map((l) => (
            <TabsContent key={l} value={l}>
              <div className={styles.grid} style={{ marginTop: 'var(--s-4)' }}>
                <Field label={`${t('eventName')} (${l})`} required={l === defaultLocale}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={name[l] ?? ''}
                      onChange={(e) => setName({ ...name, [l]: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={`${t('description')} (${l})`}>
                  {({ id }) => (
                    <Textarea
                      id={id}
                      value={description[l] ?? ''}
                      onChange={(e) => setDescription({ ...description, [l]: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={`${t('location')} (${l})`}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={location[l] ?? ''}
                      onChange={(e) => setLocation({ ...location, [l]: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <section className="card card-pad">
        <div className={styles.grid2}>
          <Field label={t('slug')} help={t('slugHelp')}>
            {({ id }) => <Input id={id} value={slug} onChange={(e) => setSlug(e.target.value)} />}
          </Field>
          <Field label={t('timezone')}>
            {({ id }) => (
              <NativeSelect id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('startsAt')}>
            {({ id }) => (
              <PreferenceDateInput id={id} type="datetime-local" value={startsAt} onChange={setStartsAt} />
            )}
          </Field>
          <Field label={t('endsAt')}>
            {({ id }) => (
              <PreferenceDateInput id={id} type="datetime-local" value={endsAt} onChange={setEndsAt} />
            )}
          </Field>
          <Field label={t('regOpens')}>
            {({ id }) => (
              <PreferenceDateInput id={id} type="datetime-local" value={regOpens} onChange={setRegOpens} />
            )}
          </Field>
          <Field label={t('regCloses')}>
            {({ id }) => (
              <PreferenceDateInput id={id} type="datetime-local" value={regCloses} onChange={setRegCloses} />
            )}
          </Field>
          <Field label={t('capacity')} help={t('capacityHelp')}>
            {({ id }) => (
              <Input id={id} type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            )}
          </Field>
          <Field label={t('visibility')} help={t('visibilityHelp')}>
            {({ id }) => (
              <NativeSelect id={id} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="public">{t('visibilityPublic')}</option>
                <option value="unlisted">{t('visibilityUnlisted')}</option>
              </NativeSelect>
            )}
          </Field>
        </div>
      </section>

      <section className="card card-pad">
        <h2 style={{ marginBottom: 'var(--s-2)' }}>{t('contactInfo')}</h2>
        <p className={styles.sectionHelp}>{t('contactHelp')}</p>
        <div className={styles.grid2}>
          <Field label={t('contactName')}>
            {({ id }) => (
              <Input
                id={id}
                value={contact.name ?? ''}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('contactEmail')}>
            {({ id }) => (
              <Input
                id={id}
                type="email"
                value={contact.email ?? ''}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('contactPhone')}>
            {({ id }) => (
              <Input
                id={id}
                type="tel"
                value={contact.phone ?? ''}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('contactWebsite')}>
            {({ id }) => (
              <Input
                id={id}
                type="url"
                placeholder="https://example.com"
                value={contact.website ?? ''}
                onChange={(e) => setContact({ ...contact, website: e.target.value })}
              />
            )}
          </Field>
        </div>
      </section>

      <section className="card card-pad">
        <h2 style={{ marginBottom: 'var(--s-4)' }}>{t('participantTypes')}</h2>
        <div className={styles.typeList}>
          {types.map((pt) => (
            <div key={pt.id} className={styles.typeRow}>
              {/* `key` is a stable internal identifier (referenced by form
                  visibility rules and the registration API) — auto-generated on
                  create and never shown to organizers, who identify types by
                  name everywhere. */}
              <Field label={`${t('typeName')} (${locale})`}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={pt.name?.[locale] ?? pt.name?.en ?? ''}
                    onChange={(e) =>
                      updateType(pt.id, { name: { ...pt.name, [locale]: e.target.value } })
                    }
                  />
                )}
              </Field>
              <Field label={t('capacity')}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min="1"
                    value={pt.capacity ?? ''}
                    onChange={(e) =>
                      updateType(pt.id, {
                        capacity: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                )}
              </Field>
              <Field label={t('form')}>
                {({ id }) => (
                  <NativeSelect
                    id={id}
                    value={pt.form_id ?? ''}
                    onChange={(e) => updateType(pt.id, { form_id: e.target.value || null })}
                  >
                    <option value="" />
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Button variant="ghost" size="sm" onClick={() => removeType(pt.id)}>
                {t('remove')}
              </Button>
            </div>
          ))}
        </div>
        <Dialog
          open={typePickerOpen}
          onOpenChange={setTypePickerOpen}
          title={t('selectType')}
          trigger={
            <Button variant="secondary" size="sm" style={{ marginTop: 'var(--s-3)' }}>
              {t('addType')}
            </Button>
          }
        >
          <p className={styles.sectionHelp}>{t('selectTypeHelp')}</p>
          <div className={styles.presetList}>
            {PARTICIPANT_TYPE_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                variant="secondary"
                size="sm"
                onClick={() => addType(preset)}
              >
                {preset.name[locale] ?? preset.name.en}
              </Button>
            ))}
          </div>
          <Button onClick={() => addType(null)} style={{ marginTop: 'var(--s-4)', width: '100%' }}>
            {t('customType')}
          </Button>
        </Dialog>
      </section>

      <div className={styles.footer}>
        <div className={styles.footerStatus} aria-live="polite">
          {publishBurst && (
            <strong className="publish-flash" style={{ color: 'var(--success)' }}>
              {t('eventPublished')}
            </strong>
          )}
        </div>
        <div className={styles.footerActions}>
          {/* Save status sits right next to the Save button so it's noticed. */}
          <span className={styles.saveStatus} aria-live="polite">
            {saveState === 'error' ? (
              <span className="badge badge-cancelled">{t('saveFailed')}</span>
            ) : dirty ? (
              <span className="badge badge-waitlisted">{t('editsNotSaved')}</span>
            ) : saveState === 'saved' ? (
              <span key={savedSnap} className="badge badge-confirmed publish-flash">
                {t('saved')}
              </span>
            ) : null}
          </span>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            {event.status === 'draft' ? (
              <Button variant="secondary" onClick={() => setStatus('published')}>
                {t('publish')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setStatus('draft')}>
                {t('unpublish')}
              </Button>
            )}
            <ConfettiBurst burst={publishBurst} />
          </span>
          <Button onClick={requestSave} disabled={saveState === 'saving' || !dirty}>
            {tCommon('save')}
          </Button>
        </div>
      </div>

      <Dialog
        open={slugWarnOpen}
        onOpenChange={setSlugWarnOpen}
        title={t('slugWarnTitle')}
      >
        <p className={styles.sectionHelp} style={{ marginBottom: 'var(--s-4)' }}>
          {t('slugWarnBody', { old: event.slug, next: slug })}
        </p>
        <div className={styles.slugWarnActions}>
          <Dialog.Close asChild>
            <Button variant="ghost">{tCommon('cancel')}</Button>
          </Dialog.Close>
          <Button variant="secondary" onClick={revertSlugAndSave} disabled={saveState === 'saving'}>
            {t('slugWarnRevert')}
          </Button>
          <Button onClick={() => save()} disabled={saveState === 'saving'}>
            {t('slugWarnConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
