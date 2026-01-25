import { afterEach, describe, expect, it, vi } from "vitest"

describe("playDing", () => {
  const prevWindow = (globalThis as unknown as { window?: unknown }).window

  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = prevWindow
  })

  it("plays two tones for waiting", async () => {
    const oscillators: Array<{ start: ReturnType<typeof vi.fn> }> = []

    class FakeAudioContext {
      public state: AudioContextState = "suspended"
      public currentTime = 1
      public destination = null as unknown as AudioDestinationNode

      resume = vi.fn(async () => {
        this.state = "running"
      })

      createOscillator(): OscillatorNode {
        const osc = {
          type: "sine" as OscillatorType,
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }
        oscillators.push({ start: osc.start })
        return osc as unknown as OscillatorNode
      }

      createGain(): GainNode {
        const g = {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }
        return g as unknown as GainNode
      }
    }

    ;(globalThis as unknown as { window?: unknown }).window = {
      AudioContext: FakeAudioContext,
    } as unknown as Window & typeof globalThis

    const { playDing } = await import("./sound")
    await playDing("waiting")

    expect(oscillators).toHaveLength(2)
  })
})
