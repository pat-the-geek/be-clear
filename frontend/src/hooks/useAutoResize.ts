import { useEffect, useRef, useCallback } from 'react'

export function useAutoResize(value: string) {
  const elRef = useRef<HTMLTextAreaElement | null>(null)

  function resize(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Fires when the element mounts/unmounts (handles conditional rendering)
  const ref = useCallback((el: HTMLTextAreaElement | null) => {
    elRef.current = el
    resize(el)
  }, [])

  // Also fires when value changes (typing or data loaded from API)
  useEffect(() => { resize(elRef.current) }, [value])

  return ref
}
