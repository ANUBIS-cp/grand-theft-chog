// Small synthesised sounds (no files to load). Browsers only allow audio after a tap or key press, so
// `unlock()` is called from the first input.

export class Sound {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  muted = false;

  unlock() {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ac = new Ctx();
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ac.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    const ac = this.ac;
    if (!ac || !this.master) return;
    const t0 = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(at: number, dur: number, vol: number, from: number, to: number) {
    const ac = this.ac;
    if (!ac || !this.master) return;
    const t0 = ac.currentTime + at;
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  coin() {
    this.tone(988, 0, 0.07, 'square', 0.06);
    this.tone(1319, 0.06, 0.12, 'square', 0.06);
  }

  cash() {
    this.tone(784, 0, 0.08, 'triangle', 0.12);
    this.tone(1047, 0.06, 0.08, 'triangle', 0.12);
    this.tone(1319, 0.12, 0.16, 'triangle', 0.12);
  }

  bag() {
    this.tone(140, 0, 0.18, 'sine', 0.25, 70);
    this.tone(1175, 0.05, 0.1, 'square', 0.05);
    this.tone(1568, 0.12, 0.2, 'square', 0.05);
  }

  click() {
    this.tone(2200, 0, 0.025, 'square', 0.03);
  }

  safe() {
    this.noise(0, 0.25, 0.25, 400, 3000);
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.05 + i * 0.07, 0.25, 'triangle', 0.12));
  }

  suspect() {
    this.tone(660, 0, 0.09, 'sine', 0.08, 880);
  }

  power() {
    this.noise(0, 0.3, 0.2, 300, 4000);
    this.tone(330, 0, 0.25, 'sine', 0.08, 990);
  }

  zap() {
    this.tone(1800, 0, 0.3, 'sawtooth', 0.08, 120);
    this.noise(0, 0.15, 0.15, 3000, 800);
  }

  thud() {
    this.tone(110, 0, 0.2, 'sine', 0.3, 50);
    this.noise(0, 0.12, 0.2, 800, 200);
  }

  alarmOn() {
    const ac = this.ac;
    if (!ac || !this.master || this.siren) return;
    const osc = ac.createOscillator();
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 740;
    lfo.frequency.value = 2.2;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(osc.frequency);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    gain.gain.value = 0.05;
    osc.connect(f).connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.siren = { osc, lfo, gain };
  }

  alarmOff() {
    if (!this.siren || !this.ac) return;
    const { osc, lfo, gain } = this.siren;
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ac.currentTime + 0.2);
    osc.stop(this.ac.currentTime + 0.25);
    lfo.stop(this.ac.currentTime + 0.25);
    this.siren = null;
  }

  busted() {
    this.alarmOff();
    this.thud();
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.15 + i * 0.16, 0.22, 'square', 0.07));
  }

  escaped() {
    this.alarmOff();
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.08, 0.18, 'square', 0.06));
  }
}
