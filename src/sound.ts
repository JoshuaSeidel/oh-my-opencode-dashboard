export type DingKind = "waiting" | "task" | "all"

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const AnyAudioContext = (window.AudioContext ?? (window as any).webkitAudioContext) as
    | (new () => AudioContext)
    | undefined
  if (!AnyAudioContext) return null

  if (!ctx) {
    ctx = new AnyAudioContext()
  }

  return ctx
}

export async function unlockAudio(): Promise<boolean> {
  const c = getCtx()
  if (!c) return false
  try {
    if (c.state !== "running") {
      await c.resume()
    }
    return c.state === "running"
  } catch {
    return false
  }
}

function playTone(opts: {
  at: number
  freq: number
  dur: number
  gain: number
}): void {
  const c = getCtx()
  if (!c) return
  if (c.state !== "running") return

  const osc = c.createOscillator()
  const g = c.createGain()

  osc.type = "sine"
  osc.frequency.setValueAtTime(opts.freq, opts.at)

  const attack = Math.min(0.01, opts.dur / 4)
  const release = Math.min(0.08, opts.dur / 2)

  g.gain.setValueAtTime(0, opts.at)
  g.gain.linearRampToValueAtTime(opts.gain, opts.at + attack)
  g.gain.setValueAtTime(opts.gain, opts.at + Math.max(attack, opts.dur - release))
  g.gain.linearRampToValueAtTime(0, opts.at + opts.dur)

  osc.connect(g)
  g.connect(c.destination)

  osc.start(opts.at)
  osc.stop(opts.at + opts.dur + 0.01)
}

export async function playDing(kind: DingKind): Promise<void> {
  const ok = await unlockAudio()
  if (!ok) return

  const c = getCtx()
  if (!c) return

  const t0 = c.currentTime + 0.01
  const baseGain = 0.06

  if (kind === "waiting") {
    playTone({ at: t0, freq: 784, dur: 0.08, gain: baseGain })
    playTone({ at: t0 + 0.10, freq: 659, dur: 0.10, gain: baseGain })
    return
  }

  if (kind === "task") {
    playTone({ at: t0, freq: 659, dur: 0.08, gain: baseGain })
    playTone({ at: t0 + 0.10, freq: 880, dur: 0.10, gain: baseGain })
    return
  }

  // all
  playTone({ at: t0, freq: 523.25, dur: 0.10, gain: baseGain })
  playTone({ at: t0 + 0.12, freq: 659.25, dur: 0.10, gain: baseGain })
  playTone({ at: t0 + 0.24, freq: 783.99, dur: 0.14, gain: baseGain })
}
