import { useRef, useState } from 'react'
import type { FeltScore } from '../types'
import { copy } from '../lib/copy'
import { FeltScale } from '../app/controls'
import { inferPhotoDate, preparePhoto } from '../lib/capture'
import { mediumLabel, toDateKey } from '../lib/dates'

/**
 * Onboarding: three screens, one of which does real work.
 *
 * J5's backfill is the point. "Pick three photos where you liked how you felt"
 * takes twenty seconds, seeds the log with real history, and means the app has
 * something to show on day one instead of an empty grid and a promise. It also
 * doubles as a values baseline — those three are, by definition, days the user
 * already rates highly.
 *
 * Skipping is a first-class outcome. Someone who declines still gets a working
 * app; they just start from zero.
 */

export interface SeedPhoto {
  blob: Blob
  thumb: Blob
  signature: Awaited<ReturnType<typeof preparePhoto>>['signature']
  date: string
  felt: FeltScore | null
}

const MAX_SEEDS = 3

export function OnboardingScreen({ onDone }: { onDone: (seeds: SeedPhoto[]) => void }) {
  const [step, setStep] = useState(0)
  const [seeds, setSeeds] = useState<SeedPhoto[]>([])
  const [rating, setRating] = useState(0)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList) => {
    setImporting(true)
    try {
      const chosen = Array.from(files).slice(0, MAX_SEEDS)
      const prepared: SeedPhoto[] = []
      for (const file of chosen) {
        const [photo, date] = await Promise.all([preparePhoto(file), inferPhotoDate(file)])
        prepared.push({
          blob: photo.blob,
          thumb: photo.thumb,
          signature: photo.signature,
          date: toDateKey(date),
          felt: null,
        })
      }
      // Oldest first, so rating them reads as walking forward through time.
      prepared.sort((a, b) => (a.date < b.date ? -1 : 1))
      /*
       * One seed per day. Two photos from the same afternoon carry the same
       * EXIF date, and seeding both would open the log with a duplicate day —
       * the first thing a new user sees being a mistake they then have to
       * clean up. The first pick for a date wins; burst shots lose quietly.
       */
      const seen = new Set<string>()
      const unique = prepared.filter((seed) =>
        seen.has(seed.date) ? false : (seen.add(seed.date), true),
      )
      setSeeds(unique)
      setRating(0)
      setStep(3)
    } finally {
      setImporting(false)
    }
  }

  // Step 3: ask a felt-rating for each seeded photo, one at a time.
  if (step === 3 && seeds.length > 0) {
    const current = seeds[rating]
    if (!current) {
      onDone(seeds)
      return null
    }

    const setFelt = (felt: FeltScore) => {
      const next = seeds.map((seed, i) => (i === rating ? { ...seed, felt } : seed))
      setSeeds(next)
      if (rating + 1 < next.length) {
        setRating(rating + 1)
      } else {
        onDone(next)
      }
    }

    return (
      <div className="onboard">
        <div className="onboard-body">
          <div className="dots">
            {seeds.map((seed, i) => (
              <span key={seed.date + i} className={i <= rating ? 'on' : ''} />
            ))}
          </div>
          <h1>{copy.onboarding.seedAsk}</h1>
          <p className="proof">{mediumLabel(current.date)}</p>
          <div className="spacer" />
          <FeltScale value={current.felt} onChange={setFelt} />
        </div>
        <button type="button" className="btn btn--quiet btn--block" onClick={() => onDone(seeds)}>
          {copy.onboarding.seedSkip}
        </button>
      </div>
    )
  }

  const steps = [
    {
      title: copy.onboarding.privacyTitle,
      body: copy.onboarding.privacyBody,
      proof: copy.onboarding.privacyProof,
      cta: copy.onboarding.nextPrivacy,
      action: () => setStep(1),
    },
    {
      title: copy.onboarding.whatTitle,
      body: copy.onboarding.whatBody,
      proof: null,
      cta: copy.onboarding.nextWhat,
      action: () => setStep(2),
    },
    {
      title: copy.onboarding.seedTitle,
      body: copy.onboarding.seedBody,
      proof: null,
      cta: copy.onboarding.seedPick,
      action: () => fileRef.current?.click(),
    },
  ]

  const current = steps[Math.min(step, steps.length - 1)]!

  return (
    <div className="onboard">
      <div className="wordmark">
        <span className="name">{copy.app.name}</span>
      </div>

      <div className="onboard-body">
        <div className="dots">
          {steps.map((s, i) => (
            <span key={s.title} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <span className="eyebrow onboard-step">
          {copy.onboarding.step(Math.min(step, steps.length - 1) + 1, steps.length)}
        </span>
        <h1>{current.title}</h1>
        <p>{current.body}</p>
        {current.proof ? <p className="proof">{current.proof}</p> : null}
      </div>

      <div className="stack">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={importing}
          onClick={current.action}
        >
          {importing ? copy.settings.exporting : current.cta}
        </button>

        {step === 2 ? (
          <button type="button" className="btn btn--quiet btn--block" onClick={() => onDone([])}>
            {copy.onboarding.seedSkip}
          </button>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        onChange={(event) => {
          const files = event.target.files
          if (files && files.length > 0) void handleFiles(files)
        }}
      />
    </div>
  )
}
