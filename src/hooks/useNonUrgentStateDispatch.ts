import { useCallback, type Dispatch, type SetStateAction } from 'react'

// Centralize non-urgent state scheduling so every heavy UI write path
// (dialogs/tabs/grid edits) shares one transition policy.
export const runNonUrgentStateCommit = (commit: () => void): void => {
  // User-facing controls (metaset/minima/builder toggles) must reflect clicks
  // immediately; deferring the commit behind transitions made selections feel stuck.
  // Keep the central hook but run synchronously until we split urgent vs heavy work.
  commit()
}

// Wrap a normal React state dispatcher with transition scheduling.
// Callers keep the same `(next) => void` signature as `setState`.
export const useNonUrgentStateDispatch = <T,>(
  dispatch: Dispatch<SetStateAction<T>>,
): Dispatch<SetStateAction<T>> => {
  // Stable callback identity keeps memoized children from rerendering.
  return useCallback((next: SetStateAction<T>) => {
    runNonUrgentStateCommit(() => {
      dispatch(next)
    })
  }, [dispatch])
}
