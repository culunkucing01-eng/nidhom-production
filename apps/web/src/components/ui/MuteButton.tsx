import { useState } from 'react'
import { isSoundMuted, toggleSoundMuted } from '../../lib/soundManager'

export function MuteButton() {
  const [muted, setMuted] = useState(isSoundMuted())

  function handleToggle() {
    setMuted(toggleSoundMuted())
  }

  return (
    <button
      aria-label={muted ? 'Aktifkan suara notifikasi' : 'Matikan suara notifikasi'}
      className="mute-btn"
      onClick={handleToggle}
      title={muted ? 'Aktifkan suara' : 'Matikan suara'}
      type="button"
    >
      {muted ? '🔇' : '🔔'}
    </button>
  )
}
