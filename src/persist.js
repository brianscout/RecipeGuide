// The storage edge. It parses and it stringifies, and it takes no decision:
// whether what it read is worth resuming is HYDRATE's to answer, in the pure
// core, where the six hour window is testable arithmetic. See src/reduce.js.
//
// Local storage is one of the few capabilities the platform documents as
// available to a Web App. It is still wrapped: a device that refuses it must
// give a cook a working application that forgets, not a blank screen.

const KEY = 'recipeguide:session';

/**
 * The session left behind by the last launch, exactly as it was written, or
 * null where there is none to read. Hand it to HYDRATE rather than trusting
 * it — a value that is absent, truncated, stale, or written by something else
 * entirely all arrive here the same way.
 *
 * @returns {object | null}
 */
export function readSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Writes the session, stamped with the instant it was written. State is a
 * single serializable value, so this is the whole of persistence: no schema,
 * no migration, and nothing to keep in step with the reducer.
 *
 * @param {object} state
 * @param {number} now
 */
export function writeSession(state, now) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: now }));
  } catch {
    // A cook mid-recipe is not interrupted because a later reload will not be
    // able to resume. There is no console on the device to report this to.
  }
}
