// MOD-248: bounds for the module-level maps that would otherwise grow for the life of a session. Pure: no `$`.
// On overflow the oldest-inserted entry (Map and Set iterate in insertion order) is dropped.

/** The most entries each long-lived module map keeps; register.ts names the cap beside each map. */
export const MAP_CAPS = {
  handedBackPosted: 200,
  taskRepos: 200,
  offered: 200,
  glyphLogged: 500,
  handbacks: 200,
  gateTails: 200,
} as const

/** Adds `key` to `set`, then drops the oldest entries while it holds more than `cap`. */
export function addBounded<K>(set: Set<K>, key: K, cap: number): void {
  set.add(key)
  while (set.size > cap) {
    const oldest = set.values().next()
    if (oldest.done) break
    set.delete(oldest.value)
  }
}

/** Sets `key` in `map`, then drops the oldest-inserted entries while it holds more than `cap`. */
export function setBounded<K, V>(map: Map<K, V>, key: K, value: V, cap: number): void {
  map.set(key, value)
  while (map.size > cap) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }
}
