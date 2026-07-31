import { useCallback, useEffect, useRef, useState } from 'react'
import { copy } from '../lib/copy'
import { captureFrame, preparePhoto } from '../lib/capture'
import { haptic } from '../lib/haptics'
import type { Settings } from '../types'

/**
 * J1: "record what I'm wearing without it slowing me down."
 *
 * The budget is two taps and five seconds, measured from the home screen. That
 * rules out a lot of ordinary app behaviour: no confirm step, no review
 * screen, no "add a caption?", no naming. The shutter writes the entry and the
 * screen changes. Anything the user wants to add, they can add tonight.
 *
 * The camera opens automatically on mount, so for a morning launch the shutter
 * is the *first* tap, not the second.
 */
export function CameraScreen({
  settings,
  onCaptured,
  onPickFile,
  onExit,
  alreadyLoggedToday,
}: {
  settings: Settings
  onCaptured: (
    blob: Blob,
    signature: Awaited<ReturnType<typeof preparePhoto>>['signature'],
    thumb: Blob,
  ) => void
  onPickFile: (file: File) => void
  onExit: () => void
  alreadyLoggedToday: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [facing, setFacing] = useState<'user' | 'environment'>(settings.camera_facing)
  const [timerOn, setTimerOn] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [blink, setBlink] = useState(false)
  /**
   * The stream needs a moment before it has real dimensions. J1 drops people
   * straight here to tap immediately, so a shutter that looks live but is not
   * would silently swallow the single most important interaction in the app.
   * It stays disabled until there is an actual frame to capture.
   */
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      stop()
      setReady(false)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1920 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.dataset.mirrored = String(facing === 'user')
          await videoRef.current.play().catch(() => undefined)
        }
      } catch {
        if (!cancelled) setDenied(true)
      }
    }

    void start()
    return () => {
      cancelled = true
      stop()
    }
  }, [facing, stop])

  const save = useCallback(async () => {
    const video = videoRef.current
    if (!video || busy) return
    // Belt and braces: even with the button gated on `ready`, a stream can drop
    // between render and tap.
    if (!video.videoWidth || !video.videoHeight) {
      setReady(false)
      return
    }

    // The photographic ritual: a blink of white at the instant of capture.
    // Acknowledgement, not decoration — the frame was taken *now*.
    setBlink(true)
    setTimeout(() => setBlink(false), 200)

    setBusy(true)
    haptic('confirm')
    try {
      const raw = await captureFrame(video)
      const prepared = await preparePhoto(raw)
      stop()
      onCaptured(prepared.blob, prepared.signature, prepared.thumb)
    } catch {
      // Never fail silently on the core interaction — say so and stay put so
      // the shot can be retaken.
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [busy, onCaptured, stop])

  // 3 second timer, for the full-length shot you cannot reach the phone for.
  const shoot = useCallback(() => {
    if (!timerOn) {
      void save()
      return
    }
    setCountdown(3)
    let remaining = 3
    const tick = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(tick)
        setCountdown(null)
        void save()
      } else {
        setCountdown(remaining)
      }
    }, 1000)
  }, [save, timerOn])

  if (denied) {
    return (
      <div className="camera">
        <div className="camera-fallback">
          <p>{copy.camera.denied}</p>
          <div className="stack">
            <button type="button" className="btn btn--primary btn--block" onClick={() => fileRef.current?.click()}>
              {copy.camera.pickInstead}
            </button>
            <button type="button" className="btn btn--quiet btn--block" onClick={onExit}>
              {copy.common.back}
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onPickFile(file)
          }}
        />
      </div>
    )
  }

  return (
    <div className="camera">
      <video
        ref={videoRef}
        className={facing === 'user' ? 'mirrored' : undefined}
        playsInline
        muted
        autoPlay
        onLoadedMetadata={(event) => {
          if (event.currentTarget.videoWidth > 0) setReady(true)
        }}
      />

      <div className={blink ? 'camera-blink is-on' : 'camera-blink'} aria-hidden="true" />

      <button type="button" className="camera-close" onClick={onExit} aria-label={copy.common.close}>
        Close
      </button>

      <p className="camera-hint">
        {failed
          ? copy.camera.failed
          : !ready
            ? copy.camera.starting
            : alreadyLoggedToday
              ? copy.camera.alreadyToday
              : copy.camera.ready}
      </p>

      {countdown !== null ? (
        <div className="camera-countdown" aria-live="assertive">
          {countdown}
        </div>
      ) : null}

      <div className="camera-controls">
        <div className="camera-side">
          <button
            type="button"
            className="camera-chip"
            aria-pressed={timerOn}
            onClick={() => setTimerOn((on) => !on)}
          >
            3s
          </button>
        </div>

        <button
          type="button"
          className="shutter"
          aria-label={copy.camera.shutter}
          disabled={busy || !ready}
          onClick={shoot}
        />

        <div className="camera-side">
          <button
            type="button"
            className="camera-chip"
            aria-label={copy.camera.flip}
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          >
            Flip
          </button>
        </div>
      </div>
    </div>
  )
}
