// The alert's second channel, and the only edge in the application that is
// speculative rather than known to work. It exists as its own module because
// docs/SPEC.md asks for exactly that: a vibration trigger that is one addition
// at the point of expiry rather than a redesign later.
//
// The finding it waits on is item 2 of "Open questions carried into
// implementation": haptics appears on neither the platform's supported nor its
// unsupported list, and the probe run on the glasses has not been done. So the
// alert is designed as though this does nothing, and the display carries it.
//
// Asking anyway costs nothing. A platform without `navigator.vibrate` never
// gets called, one that refuses returns false, and either way a cook sees the
// takeover. If the device pass comes back `accepted`, the buzz is already
// wired to the instant a timer fires and the alert becomes what it wants to
// be: something that reaches a cook whose eyes are on a pan.

import { VIBRATION_PATTERN } from './probe-capabilities.js';

/**
 * Buzz the band, if this platform has a band to buzz. Never throws: an alert
 * that failed to reach one channel still has to reach the other, and there is
 * no console on the device to report the failure to.
 *
 * Note that `navigator.vibrate()` is gated on transient user activation, so a
 * timer expiring on a tick may be refused where the same call on a pinch would
 * not be. That gate is the probe's other finding and is not worked around
 * here — working around it would mean holding the alert until the cook's next
 * gesture, which is the opposite of what the alert is for.
 */
export function pulse() {
  try {
    navigator.vibrate?.(VIBRATION_PATTERN);
  } catch {
    // A platform that throws is a platform without haptics.
  }
}
