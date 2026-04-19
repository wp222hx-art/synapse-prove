// 程序生成的音效 — 用 Web Audio API,无外部依赖
// playFlipSound 用于地块翻转,playRewardSound 用于奖励弹出

let audioContext: AudioContext | null = null
let unlocked = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioContext = new Ctor()
    } catch {
      return null
    }
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }
  return audioContext
}

// iOS Safari / Chrome Mobile 要求 AudioContext 必须在用户手势的同步回调中
// 第一次 resume,否则后续永远是 suspended(声音听不到)
// 这个函数必须在 onClick / pointerdown / touchstart 等用户手势同步上下文里调用
export function unlockAudio() {
  if (unlocked) return
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  // 播放一个 1-sample 静音 buffer 强制 unlock(早期 iOS Safari 兼容)
  try {
    const buffer = ctx.createBuffer(1, 1, 22050)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    /* noop */
  }
  unlocked = true
}

// 翻转音效:深沉 thunk(sawtooth + lowpass) + 翻纸沙沙(白噪声 + highpass)
// 整体感觉:"咚...沙",不再像 "咻噗" 的电子音
export function playFlipSound() {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime

  // ─── Layer 1:主音 — 厚实的 thunk ───
  const osc1 = ctx.createOscillator()
  const filter1 = ctx.createBiquadFilter()
  const gain1 = ctx.createGain()

  osc1.type = 'sawtooth'
  osc1.frequency.setValueAtTime(320, now)
  osc1.frequency.exponentialRampToValueAtTime(70, now + 0.16)

  filter1.type = 'lowpass'
  filter1.frequency.setValueAtTime(900, now)
  filter1.frequency.exponentialRampToValueAtTime(220, now + 0.16)
  filter1.Q.setValueAtTime(3, now)

  gain1.gain.setValueAtTime(0.0, now)
  gain1.gain.linearRampToValueAtTime(0.22, now + 0.005)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

  osc1.connect(filter1).connect(gain1).connect(ctx.destination)
  osc1.start(now)
  osc1.stop(now + 0.22)

  // ─── Layer 2:翻纸沙沙 — 白噪声 + highpass ───
  const bufferSize = Math.floor(ctx.sampleRate * 0.13)
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    // 加一个简单的衰减包络让噪声更自然
    const env = 1 - i / bufferSize
    data[i] = (Math.random() * 2 - 1) * env
  }
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer

  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'highpass'
  noiseFilter.frequency.setValueAtTime(2200, now)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.07, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13)

  noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.14)
}

// 奖励音效:多层和声,稀有度越高层数越多
type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'

const REWARD_LAYERS: Record<Rarity, Array<[number, number]>> = {
  common:    [[440, 0.4], [660, 0.6]],
  rare:      [[440, 0.4], [660, 0.6], [880, 0.8]],
  epic:      [[440, 0.4], [660, 0.6], [880, 0.8], [1100, 1.0]],
  legendary: [[440, 0.4], [660, 0.6], [880, 0.8], [1100, 1.0], [1320, 1.2]],
  mythic:    [[440, 0.4], [660, 0.6], [880, 0.8], [1100, 1.0], [1320, 1.2], [1760, 1.4]],
}

export function playRewardSound(rarity: Rarity) {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime
  const layers = REWARD_LAYERS[rarity]

  for (let i = 0; i < layers.length; i++) {
    const [freq, dur] = layers[i]
    const startOffset = i * 0.05
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + startOffset)
    gain.gain.setValueAtTime(0, now + startOffset)
    gain.gain.linearRampToValueAtTime(0.13, now + startOffset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now + startOffset)
    osc.stop(now + startOffset + dur + 0.05)
  }
}
