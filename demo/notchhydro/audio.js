(() => {
  'use strict';
  function smoothGain(start, end, time) {
    const x = Math.max(0, Math.min(1, (time - start) / (end - start)));
    return x * x * (3 - 2 * x);
  }

  // Render once when sound is enabled. The native impact and the quieter
  // resonance then play on one sample clock from the final drop to settlement.
  function amberCompletionBuffer(context, impact, timing) {
    const rate = impact.sampleRate;
    const buffer = context.createBuffer(1, Math.round(rate * timing.settled), rate);
    const samples = buffer.getChannelData(0);
    samples.set(impact.getChannelData(0));
    const radiansPerHz = 2 * Math.PI / rate;
    let aPhase = 0, dPhase = 0;
    for (let i = Math.ceil(.38 * rate); i < samples.length; i++) {
      const t = i / rate;
      const gather = smoothGain(timing.holdEnd, timing.goldEnd, t);
      const rise = smoothGain(timing.emergence, timing.crystallize, t);
      const detach = smoothGain(timing.goldEnd, timing.neckBreak, t);
      const pull = gather * (1 - detach);
      const glassAge = Math.max(0, t - timing.crystallize);
      const envelope = smoothGain(.38, .68, t) * (1 - smoothGain(timing.crystallize + .10, timing.settled, t));

      // The return wave draws the two resonances together. As the neck
      // narrows, their coupling fades and a quieter round tone carries the bead.
      aPhase += radiansPerHz * 440 * (.992 + .011 * pull + .008 * detach);
      dPhase += radiansPerHz * 587.33 * (1 - .012 * (1 - rise));
      const a = Math.sin(aPhase);
      const water = (.015 + .006 * pull - .006 * detach) * a
                  + (.014 + .011 * gather + .005 * pull - .008 * detach) * Math.sin(dPhase + .22 * pull * a);

      // Bring out the already sounding D6 partial with a rounded attack.
      // A weak inharmonic mode dies away faster, like a small piece of glass.
      const bloom = smoothGain(0, .09, glassAge) * Math.exp(-glassAge / .17);
      const glass = (.0018 + .032 * bloom) * Math.sin(2 * dPhase)
                  + .005 * bloom * Math.exp(-glassAge / .09) * Math.sin(2.71 * dPhase);
      samples[i] += envelope * (water + glass);
    }
    return buffer;
  }

  function jarTapBuffer(context, glass) {
    const duration = glass ? .14 : .08, hz = glass ? 1250 : 540;
    const tap = context.createBuffer(1, Math.ceil(duration * context.sampleRate), context.sampleRate);
    const samples = tap.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const t = i / tap.sampleRate, phase = 2 * Math.PI * hz * t;
      const attack = smoothGain(0, .002, t), release = 1 - smoothGain(duration - .008, duration, t);
      const body = Math.sin(phase) * Math.exp(-t / (glass ? .028 : .014));
      const overtone = Math.sin(phase * (glass ? 2.63 : 1.74)) * Math.exp(-t / .009);
      samples[i] = attack * release * (body + .35 * overtone);
    }
    return tap;
  }

  class PourAudio {
    constructor() { this.enabled = false; this.completion = null; }
    activate(enabled) {
      this.enabled = enabled;
      if (!enabled) { this.stop(); return; }
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (Audio) {
          this.context = new Audio({ sampleRate: 44100 });
          this.buffers = {};
          this.ready = Promise.all(Object.entries(window.NotchHydroNativeAudio).map(async ([key, asset]) => {
            const bytes = Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0));
            const buffer = await this.context.decodeAudioData(bytes.buffer);
            this.buffers[key] = buffer;
            if (key === 'goal') this.buffers.amber = amberCompletionBuffer(this.context, buffer, window.NotchHydroTokens.proposed.goalTiming);
          }));
        }
      }
      this.context?.resume().catch(() => {});
    }
    begin(ratio) {
      this.stop(); if (!this.enabled || !this.context) return;
      const c = this.context, buffer = c.createBuffer(1, 88200, 44100), samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 1.2 - .6);
      const source = c.createBufferSource(), band = c.createBiquadFilter(), gain = c.createGain();
      source.buffer = buffer; source.loop = true; band.type = 'bandpass'; band.frequency.value = 360 + Math.min(1, ratio) * 620; band.Q.value = 3.2; gain.gain.value = .12;
      source.connect(band).connect(gain).connect(c.destination); source.start();
      this.noise = source; this.band = band; this.gain = gain;
    }
    update(ratio, progress, refined) {
      if (!this.context || !this.noise) return;
      this.band.frequency.setTargetAtTime(360 + Math.min(1, ratio) * 620, this.context.currentTime, .015);
      this.gain.gain.setTargetAtTime(.12, this.context.currentTime, .015);
    }
    finish(goal, { formAmber = false } = {}) {
      this.stop();
      if (!this.enabled || !this.context) return;
      const key = goal && formAmber ? 'amber' : goal ? 'goal' : 'record';
      const c = this.context, at = c.currentTime;
      const cue = this.completion = { key };
      const play = () => {
        if (cue !== this.completion) return;
        const buffer = this.buffers[key], offset = Math.max(0, c.currentTime - at);
        if (offset >= buffer.duration) { this.completion = null; return; }
        const source = cue.source = c.createBufferSource(), level = cue.level = c.createGain();
        source.buffer = buffer;
        source.connect(level); level.connect(c.destination);
        source.onended = () => {
          source.disconnect(); level.disconnect();
          if (this.completion === cue) this.completion = null;
        };
        source.start(0, offset);
      };
      // If decoding finishes late, join the animation at its current position.
      if (this.buffers[key]) play(); else this.ready.then(play).catch(() => {});
    }
    stopNoise() { if (this.noise) { try { this.noise.stop(); } catch (_) {} this.noise.disconnect(); this.noise = null; } }
    jarImpact({ kind, speed, x }, allowHaptics = true) {
      if (speed < 22) return;
      const now = performance.now();
      if (allowHaptics && speed >= 115 && now - (this.lastJarPulse ?? -Infinity) >= 160) {
        this.lastJarPulse = now;
        window.navigator?.vibrate?.(8);
      }
      if (!this.enabled || this.context?.state !== 'running' || now - (this.lastJarTap ?? -Infinity) < 55) return;
      this.lastJarTap = now;
      const c = this.context, glass = kind === 'glass';
      const strength = Math.min(1, (speed - 22) / 130);
      const source = c.createBufferSource(), level = c.createGain();
      this.jarTaps ||= {};
      source.buffer = this.jarTaps[kind] ||= jarTapBuffer(c, glass);
      source.playbackRate.value = .9 + .16 * x / 160;
      level.gain.value = (glass ? .064 : .048) * (.12 + .88 * strength);
      source.connect(level);
      level.connect(c.destination);
      this.jarVoices ||= new Set();
      this.jarVoices.add(source);
      source.onended = () => {
        source.disconnect();
        level.disconnect();
        this.jarVoices.delete(source);
      };
      source.start();
    }
    stopJar() {
      for (const source of this.jarVoices || []) source.stop();
      this.jarVoices?.clear();
      this.lastJarPulse = this.lastJarTap = -Infinity;
    }
    stopFormation() { if (this.completion?.key === 'amber') this.stop(); }
    stop() {
      this.stopNoise();
      this.stopJar();
      const cue = this.completion;
      this.completion = null;
      if (!cue?.source) return;
      const now = this.context.currentTime, end = now + .018;
      cue.level.gain.setValueAtTime(1, now);
      cue.level.gain.linearRampToValueAtTime(0, end);
      cue.source.stop(end);
    }
  }
  window.NotchHydroAudio = PourAudio;
})();
