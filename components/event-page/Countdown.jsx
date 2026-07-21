'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

// Live countdown to an ISO instant. Used inside the hero.
// tone: 'light' (over dark cover) | 'dark' (on paper). Hides itself once the
// target is in the past, so nothing lingers after the event starts.
export function Countdown({ targetIso, tone = 'dark', label }) {
  const t = useTranslations('event')
  const [remaining, setRemaining] = useState(() => diff(targetIso))

  useEffect(() => {
    if (!targetIso) return
    const id = setInterval(() => setRemaining(diff(targetIso)), 1000)
    return () => clearInterval(id)
  }, [targetIso])

  if (!targetIso || remaining == null || remaining.total <= 0) return null

  const light = tone === 'light'
  const numColor = light ? '#fff' : 'var(--ink)'
  const lblColor = light ? 'rgba(255,255,255,.65)' : 'var(--ink-faint)'
  const units = [
    [remaining.days, t('countdownDays')],
    [remaining.hours, t('countdownHours')],
    [remaining.minutes, t('countdownMinutes')],
    [remaining.seconds, t('countdownSeconds')],
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      {label && (
        <span
          style={{
            font: "700 11px/1.3 var(--font-body, system-ui)",
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: lblColor,
            maxWidth: '9ch',
          }}
        >
          {label}
        </span>
      )}
      <div style={{ display: 'flex', gap: '14px' }}>
        {units.map(([value, unit], i) => (
          <div key={i} style={{ textAlign: 'center', minWidth: '2.4ch' }}>
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                lineHeight: 1,
                color: numColor,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(value).padStart(2, '0')}
            </div>
            <div
              style={{
                fontSize: '10px',
                marginTop: '4px',
                textTransform: 'uppercase',
                letterSpacing: '.09em',
                color: lblColor,
              }}
            >
              {unit}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function diff(iso) {
  if (!iso) return null
  const total = Date.parse(iso) - Date.now()
  if (Number.isNaN(total)) return null
  const s = Math.max(0, Math.floor(total / 1000))
  return {
    total,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}
