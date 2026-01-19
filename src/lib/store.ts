export type Store<T> = {
  getState: () => T
  setState: (newState: Partial<T> | ((prevState: T) => Partial<T>)) => void
}

export function store<T>(initialState: T): Store<T> {
  let state = initialState
  const setState = (
    newStateOrUpdater: Partial<T> | ((prevState: T) => Partial<T>)
  ): void => {
    if (typeof newStateOrUpdater === "function") {
      const updater = newStateOrUpdater as (prevState: T) => Partial<T>
      state = { ...state, ...updater(state) }
    } else {
      state = { ...state, ...newStateOrUpdater }
    }
  }
  return {
    getState: () => state,
    setState,
  }
}
