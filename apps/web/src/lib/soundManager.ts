let audioContext: AudioContext | null = null
let muted =
  typeof localStorage !== 'undefined' && localStorage.getItem('nidhom-sound-muted') === '1'

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

/** Mainkan nada chime dua nada (E5 → G5) sebagai notifikasi. */
export function playNotificationSound(): void {
  if (muted) return
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    const notes = [
      { freq: 659.25, start: 0, dur: 0.28 },
      { freq: 783.99, start: 0.14, dur: 0.38 },
    ]
    for (const note of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = note.freq
      gain.gain.setValueAtTime(0, now + note.start)
      gain.gain.linearRampToValueAtTime(0.12, now + note.start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + note.start)
      osc.stop(now + note.start + note.dur)
    }
  } catch {
    /* Abaikan jika AudioContext belum tersedia (belum ada interaksi user). */
  }
}

export function isSoundMuted(): boolean {
  return muted
}

export function setSoundMuted(value: boolean): void {
  muted = value
  try {
    localStorage.setItem('nidhom-sound-muted', value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function toggleSoundMuted(): boolean {
  setSoundMuted(!muted)
  return muted
}
