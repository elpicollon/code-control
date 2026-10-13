export const DEFAULT_FETCH_MINUTES = 5

// 0 turns every automatic fetch off; any other value is at least one minute.
export const fetchMinutes = (option: unknown): number => {
  const minutes = Number(option ?? DEFAULT_FETCH_MINUTES)
  if (!Number.isFinite(minutes)) return DEFAULT_FETCH_MINUTES
  return minutes === 0 ? 0 : Math.max(1, minutes)
}

// A timer's callback: the work runs on its own and a rejection (a failed discovery) is swallowed
// instead of left unhandled. Overlap is the controller's to prevent, one repository at a time.
export const detached =
  (work: () => unknown): (() => void) =>
  () => {
    void Promise.resolve()
      .then(work)
      .catch(() => undefined)
  }
