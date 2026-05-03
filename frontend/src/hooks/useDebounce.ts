import { useState, useEffect } from 'react'

/**
 * Retourne une version "debounced" de la valeur :
 * la valeur retournée ne change qu'après `delay` ms sans nouvelle modification.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
