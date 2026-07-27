/**
 * Haptic feedback.
 *
 * On a phone this is most of what "responsive" means — the difference between
 * a tap that registered and one you are not sure about. Two taps a day is a
 * small enough surface that getting the feel right matters more than usual.
 *
 * Deliberately tiny and deliberately quiet. `navigator.vibrate` is
 * unsupported on iOS Safari, which is much of this audience, so nothing may
 * depend on it firing; it is an enhancement on the platforms that have it.
 */

import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { isNative } from './platform'

type Pattern = 'tap' | 'confirm'

const PATTERNS: Record<Pattern, number | number[]> = {
  /** A single short pulse for a selection. */
  tap: 8,
  /** Slightly longer, for something that was written down. */
  confirm: [10, 40, 10],
}

export function haptic(pattern: Pattern = 'tap'): void {
  // Respect the same preference that turns off animation; someone who has
  // asked for less motion has not asked for buzzing instead.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  /*
   * The packaged builds get the real thing.
   *
   * `navigator.vibrate` is a blunt buzz and iOS Safari ignores it entirely,
   * which meant the web build had no feedback at all on half its audience.
   * The native Taptic engine is the difference between an interface that feels
   * cheap and one that feels made — and on a product sold on how it feels to
   * use, that is not a detail.
   */
  if (isNative()) {
    void Haptics.impact({
      style: pattern === 'confirm' ? ImpactStyle.Medium : ImpactStyle.Light,
    }).catch(() => undefined)
    return
  }

  try {
    navigator.vibrate?.(PATTERNS[pattern])
  } catch {
    // Unsupported, or blocked by the platform. Nothing depends on it.
  }
}
