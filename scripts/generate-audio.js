'use strict';

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'audio');

function createBuffer(seconds) {
  return new Float64Array(Math.ceil(seconds * SAMPLE_RATE));
}

function addTone(buffer, options) {
  const opts = options || {};
  const start = Math.floor((opts.start || 0) * SAMPLE_RATE);
  const duration = opts.duration || 0.2;
  const end = Math.min(buffer.length, start + Math.floor(duration * SAMPLE_RATE));
  const frequency = opts.frequency || 440;
  const endFrequency = opts.endFrequency == null ? frequency : opts.endFrequency;
  const volume = opts.volume == null ? 0.3 : opts.volume;
  const attack = Math.max(0.001, opts.attack == null ? 0.008 : opts.attack);
  const release = Math.max(0.001, opts.release == null ? duration * 0.48 : opts.release);
  const wave = opts.wave || 'sine';
  const harmonics = opts.harmonics || [1];
  let phase = opts.phase || 0;

  for (let i = start; i < end; i += 1) {
    const localTime = (i - start) / SAMPLE_RATE;
    const t = localTime / duration;
    const currentFrequency = frequency + (endFrequency - frequency) * t;
    phase += Math.PI * 2 * currentFrequency / SAMPLE_RATE;
    const attackGain = Math.min(1, localTime / attack);
    const releaseGain = Math.min(1, Math.max(0, (duration - localTime) / release));
    const decayGain = opts.decay == null ? 1 : Math.exp(-opts.decay * localTime);
    const envelope = attackGain * releaseGain * decayGain;
    let sample = 0;

    harmonics.forEach((harmonic, index) => {
      const harmonicPhase = phase * harmonic;
      let value = Math.sin(harmonicPhase);
      if (wave === 'triangle') value = 2 * Math.asin(Math.sin(harmonicPhase)) / Math.PI;
      else if (wave === 'soft-square') value = Math.tanh(Math.sin(harmonicPhase) * 2.4);
      sample += value / (index + 1);
    });
    buffer[i] += sample * volume * envelope / Math.max(1, harmonics.length * 0.68);
  }
}

function addNoise(buffer, options) {
  const opts = options || {};
  const start = Math.floor((opts.start || 0) * SAMPLE_RATE);
  const duration = opts.duration || 0.05;
  const end = Math.min(buffer.length, start + Math.floor(duration * SAMPLE_RATE));
  const volume = opts.volume == null ? 0.08 : opts.volume;
  let state = (opts.seed || 1234567) >>> 0;
  let previous = 0;
  for (let i = start; i < end; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const white = state / 4294967296 * 2 - 1;
    previous = previous * 0.72 + white * 0.28;
    const t = (i - start) / Math.max(1, end - start);
    const envelope = Math.sin(Math.PI * Math.min(1, t)) * Math.pow(1 - t, 1.7);
    buffer[i] += previous * volume * envelope;
  }
}

function normalize(buffer, peak) {
  let max = 0;
  for (let i = 0; i < buffer.length; i += 1) max = Math.max(max, Math.abs(buffer[i]));
  const scale = max > 0 ? (peak || 0.86) / max : 1;
  for (let i = 0; i < buffer.length; i += 1) buffer[i] *= scale;
  return buffer;
}

function writeWav(filename, samples) {
  const dataSize = samples.length * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    wav.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), wav);
}

function makeTap() {
  const out = createBuffer(0.09);
  addTone(out, { frequency: 920, endFrequency: 690, duration: 0.07, volume: 0.34, release: 0.055, wave: 'triangle' });
  addNoise(out, { duration: 0.035, volume: 0.045, seed: 7 });
  return normalize(out, 0.72);
}

function makePlace() {
  const out = createBuffer(0.17);
  addTone(out, { frequency: 390, endFrequency: 275, duration: 0.13, volume: 0.34, attack: 0.003, release: 0.09, wave: 'sine', harmonics: [1, 2] });
  addTone(out, { start: 0.018, frequency: 760, duration: 0.09, volume: 0.12, release: 0.07 });
  return normalize(out, 0.78);
}

function makePack() {
  const out = createBuffer(0.48);
  addNoise(out, { duration: 0.08, volume: 0.08, seed: 19 });
  addTone(out, { frequency: 145, endFrequency: 105, duration: 0.16, volume: 0.23, release: 0.12, wave: 'soft-square' });
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    addTone(out, { start: 0.07 + index * 0.07, frequency, duration: 0.22, volume: 0.2, attack: 0.004, release: 0.17, harmonics: [1, 2, 3], decay: 2.4 });
  });
  return normalize(out, 0.84);
}

function makeCombo() {
  const out = createBuffer(0.32);
  [659.25, 880, 1174.66].forEach((frequency, index) => {
    addTone(out, { start: index * 0.045, frequency, endFrequency: frequency * 1.035, duration: 0.18, volume: 0.22, attack: 0.003, release: 0.13, wave: 'triangle', harmonics: [1, 2] });
  });
  return normalize(out, 0.82);
}

function makeWin() {
  const out = createBuffer(1.18);
  const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
  const starts = [0, 0.13, 0.26, 0.4, 0.59, 0.76];
  melody.forEach((frequency, index) => {
    addTone(out, {
      start: starts[index],
      frequency,
      duration: index >= 4 ? 0.39 : 0.25,
      volume: index === 5 ? 0.3 : 0.22,
      attack: 0.006,
      release: index >= 4 ? 0.31 : 0.17,
      wave: 'triangle',
      harmonics: [1, 2, 3]
    });
  });
  [261.63, 329.63, 392].forEach((frequency) => {
    addTone(out, { start: 0.76, frequency, duration: 0.4, volume: 0.1, attack: 0.02, release: 0.33 });
  });
  return normalize(out, 0.88);
}

function makeFail() {
  const out = createBuffer(0.72);
  addTone(out, { frequency: 330, endFrequency: 195, duration: 0.42, volume: 0.31, attack: 0.008, release: 0.24, wave: 'triangle', harmonics: [1, 2] });
  addTone(out, { start: 0.19, frequency: 230, endFrequency: 130, duration: 0.43, volume: 0.23, attack: 0.01, release: 0.31, wave: 'soft-square' });
  addNoise(out, { start: 0.34, duration: 0.2, volume: 0.035, seed: 81 });
  return normalize(out, 0.76);
}

function makeRare() {
  const out = createBuffer(1.02);
  [783.99, 987.77, 1174.66, 1567.98].forEach((frequency, index) => {
    addTone(out, {
      start: index * 0.09,
      frequency,
      endFrequency: frequency * 1.025,
      duration: 0.42,
      volume: 0.18 + index * 0.018,
      attack: 0.004,
      release: 0.31,
      wave: 'triangle',
      harmonics: [1, 2, 3],
      decay: 1.6
    });
  });
  [0.08, 0.22, 0.36, 0.52].forEach((start, index) => {
    addTone(out, {
      start,
      frequency: 2100 + index * 240,
      duration: 0.08,
      volume: 0.045,
      attack: 0.002,
      release: 0.065
    });
  });
  return normalize(out, 0.84);
}

function makeBgm() {
  const seconds = 12;
  const out = createBuffer(seconds);
  const beat = 0.375;
  const chords = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66]
  ];
  const pattern = [0, 1, 2, 1, 0, 2, 1, 2];

  for (let bar = 0; bar < 4; bar += 1) {
    const chord = chords[bar];
    const barStart = bar * 8 * beat;
    pattern.forEach((noteIndex, step) => {
      const start = barStart + step * beat;
      const octave = step === 3 || step === 7 ? 2 : 1;
      addTone(out, {
        start,
        frequency: chord[noteIndex] * octave,
        duration: beat * 0.78,
        volume: 0.075,
        attack: 0.012,
        release: beat * 0.57,
        wave: 'triangle',
        harmonics: [1, 2, 3],
        decay: 2.2
      });
    });
    [0, 4].forEach((step) => {
      addTone(out, {
        start: barStart + step * beat,
        frequency: chord[0] / 2,
        duration: beat * 1.7,
        volume: 0.055,
        attack: 0.04,
        release: beat * 0.8,
        wave: 'sine'
      });
    });
    [2, 6].forEach((step, index) => {
      addNoise(out, { start: barStart + step * beat, duration: 0.08, volume: 0.012, seed: 100 + bar * 3 + index });
    });
  }

  const fadeSamples = Math.floor(0.035 * SAMPLE_RATE);
  for (let i = 0; i < fadeSamples; i += 1) {
    const gain = i / fadeSamples;
    out[i] *= gain;
    out[out.length - 1 - i] *= gain;
  }
  return normalize(out, 0.66);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
writeWav('tap.wav', makeTap());
writeWav('place.wav', makePlace());
writeWav('pack.wav', makePack());
writeWav('combo.wav', makeCombo());
writeWav('rare.wav', makeRare());
writeWav('win.wav', makeWin());
writeWav('fail.wav', makeFail());
writeWav('bgm.wav', makeBgm());

console.log(`Generated original audio assets in ${OUTPUT_DIR}`);
