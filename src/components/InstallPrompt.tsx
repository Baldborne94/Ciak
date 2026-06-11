import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Lightweight "Add to Home Screen" prompt. Appears only when the browser
// signals the app is installable and the user hasn't dismissed/installed it.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(() => localStorage.getItem('cv_install_dismissed') === '1')

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferred || hidden) return null

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setDeferred(null)
  }

  function dismiss() {
    localStorage.setItem('cv_install_dismissed', '1')
    setHidden(true)
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-theatre-700 bg-theatre-900/95 px-4 py-2 shadow-reel backdrop-blur">
      <span className="text-sm text-zinc-200">📲 Installa CineVault sul tuo dispositivo</span>
      <button onClick={install} className="btn-primary px-3 py-1.5 text-sm">
        Installa
      </button>
      <button onClick={dismiss} aria-label="Chiudi" className="text-zinc-500 hover:text-zinc-200">
        ✕
      </button>
    </div>
  )
}
