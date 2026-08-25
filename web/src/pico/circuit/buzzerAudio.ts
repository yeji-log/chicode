/**
 * 부저 소리. 지금까지 부저는 색만 바뀌고 실제로는 아무 소리도 안 났다 —
 * "회로에 놓을 순 있는데 실제로 동작은 안 하는" 부품은 이 프로젝트가 제일 싫어하는
 * 종류의 거짓말이라, PWM 을 만든 김에 진짜로 울리게 한다.
 *
 * 오디오 파일을 받아오지 않고 Web Audio 의 오실레이터로 직접 만든다 — 외부 CDN
 * 의존 금지 원칙에도 맞고, 어차피 필요한 건 "주파수 하나짜리 삑 소리"뿐이다.
 *
 * AudioContext 는 사용자 제스처 없이 만들면 브라우저가 정지 상태로 둔다. 여기선
 * 소리가 필요해지는 시점이 항상 "학생이 실행 버튼을 눌렀거나 ⌘+Enter 를 친 뒤"라
 * 문제가 없지만, 그래도 만들 때마다 resume() 을 한 번 불러준다.
 */

/** 부저 하나가 내는 소리. 부품 id 마다 오실레이터를 따로 들고 있는다. */
interface Voice {
  osc: OscillatorNode
  gain: GainNode
}

/** duty 100% 일 때의 음량. 교실에서 갑자기 크게 울리면 곤란해서 낮게 잡았다. */
const MAX_GAIN = 0.12

/** 소리 크기를 바꿀 때 뚝 끊기지 않게 하는 시간(초). 이게 없으면 딱딱 소리가 난다. */
const RAMP_SEC = 0.015

/**
 * 액티브 부저는 그냥 전원만 줘도(PWM 없이 value(1)) 울린다. 그때 낼 음.
 * 패시브 부저는 PWM 주파수대로 울린다 — 둘 다 "부저" 한 종류로 두고, PWM 이
 * 걸렸으면 그 주파수를, 아니면 이 기본음을 쓴다.
 */
export const DEFAULT_BUZZER_HZ = 1000

class BuzzerAudio {
  private ctx: AudioContext | null = null
  private voices = new Map<string, Voice>()

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    }
    // 아주 오래된 사파리는 webkitAudioContext 만 있다. 둘 다 없으면 조용히 포기한다 —
    // 소리가 안 나는 건 아쉬운 정도지 회로 실습 자체를 막을 일은 아니다.
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    this.ctx = new Ctor()
    void this.ctx.resume()
    return this.ctx
  }

  /** 부저 하나의 상태를 갱신한다. level 0(또는 음소거)이면 소리를 끈다. */
  set(id: string, freq: number, level: number) {
    if (level <= 0) {
      this.stop(id)
      return
    }
    const ctx = this.ensureContext()
    if (!ctx) return

    let voice = this.voices.get(id)
    if (!voice) {
      const osc = ctx.createOscillator()
      // 부저는 사인파보다 사각파에 가깝다. 다만 사각파는 배음이 많아 귀에 훨씬
      // 시끄럽게 들려서, 교실용으로는 삼각파가 적당했다.
      osc.type = 'triangle'
      const gain = ctx.createGain()
      gain.gain.value = 0
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      voice = { osc, gain }
      this.voices.set(id, voice)
    }

    voice.osc.frequency.setValueAtTime(Math.max(20, Math.min(20000, freq)), ctx.currentTime)
    voice.gain.gain.linearRampToValueAtTime(MAX_GAIN * level, ctx.currentTime + RAMP_SEC)
  }

  stop(id: string) {
    const voice = this.voices.get(id)
    if (!voice || !this.ctx) return
    voice.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + RAMP_SEC)
  }

  /** 실행이 끝나거나 부저를 지웠을 때. 소리가 남아 계속 울리면 안 된다. */
  stopAll() {
    for (const id of this.voices.keys()) this.stop(id)
  }
}

export const buzzerAudio = new BuzzerAudio()
