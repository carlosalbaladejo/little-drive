const major = [0, 4, 7, 11];
const minor = [0, 3, 7, 10];
const dominant = [0, 4, 7, 10];
const chord = (root, notes) => ({root, notes});

const stations = [
    {
        name: 'Brisa FM', beat: .267, wave: 'sine', swing: .13, beatStyle: 'soft',
        themes: [
            [chord(48, major), chord(45, minor), chord(41, major), chord(43, dominant)],
            [chord(41, major), chord(43, dominant), chord(52, minor), chord(45, minor)],
            [chord(50, minor), chord(43, dominant), chord(48, major), chord(48, major)],
        ],
        motifs: [[2, -1, 3, -1, 4, 2, -1, 1], [1, 2, -1, 4, -1, -1, 3, 2], [4, -1, 2, -1, 1, -1, -1, -1]],
    },
    {
        name: 'Costa Funk', beat: .228, wave: 'triangle', swing: .24, beatStyle: 'backbeat',
        themes: [
            [chord(50, minor), chord(50, minor), chord(55, dominant), chord(57, minor)],
            [chord(48, major), chord(55, dominant), chord(53, major), chord(57, dominant)],
            [chord(55, minor), chord(48, dominant), chord(53, major), chord(57, dominant)],
        ],
        motifs: [[-1, 1, 0, -1, 3, -1, 4, 2], [2, -1, 4, 3, -1, 1, -1, 2], [4, 2, -1, 2, -1, 5, 3, -1]],
    },
    {
        name: 'Neón', beat: .242, wave: 'triangle', swing: 0, beatStyle: 'dance',
        themes: [
            [chord(45, minor), chord(41, major), chord(48, major), chord(43, dominant)],
            [chord(50, minor), chord(41, major), chord(48, major), chord(47, dominant)],
            [chord(53, major), chord(55, dominant), chord(52, minor), chord(52, dominant)],
        ],
        motifs: [[0, 2, 4, 2, -1, 3, 1, 2], [4, 2, 3, 1, 2, 4, 2, -1], [2, -1, 0, 2, 1, -1, 4, 3]],
    },
    {
        name: 'Horizonte AM', beat: .31, wave: 'sine', swing: .18, beatStyle: 'soft',
        themes: [
            [chord(48, minor), chord(51, major), chord(44, major), chord(46, dominant)],
            [chord(53, minor), chord(46, dominant), chord(51, major), chord(48, minor)],
            [chord(44, major), chord(53, minor), chord(43, minor), chord(43, dominant)],
        ],
        motifs: [[-1, -1, 2, 1, 0, -1, 2, -1], [1, -1, -1, 2, 4, -1, 3, 2], [3, -1, 2, -1, 1, 0, -1, -1]],
    },
    {
        name: 'Malecón Club', beat: .215, wave: 'triangle', swing: .09, beatStyle: 'latin',
        themes: [
            [chord(43, minor), chord(48, minor), chord(46, major), chord(50, dominant)],
            [chord(51, major), chord(48, minor), chord(50, dominant), chord(43, minor)],
            [chord(48, minor), chord(53, dominant), chord(46, major), chord(50, dominant)],
        ],
        motifs: [[0, -1, 2, 1, -1, 4, -1, 2], [2, 1, -1, 3, 2, -1, 4, -1], [-1, 4, 3, -1, 5, 4, -1, 2]],
    },
];
export const radioNames = ['Off', ...stations.map(station => station.name)];
const frequency = note => 440 * 2 ** ((note - 69) / 12);
const sections = [
    {theme: 0, melody: false, drums: false, chords: true},
    {theme: 0, melody: true, drums: true, chords: false},
    {theme: 1, melody: true, drums: true, chords: true},
    {theme: 2, melody: true, drums: false, chords: true},
    {theme: 1, melody: true, drums: true, chords: true},
    {theme: 0, melody: true, drums: true, chords: true},
];
const drums = {
    soft: {kick: [0, 5], snare: [4], hat: [2, 6]},
    backbeat: {kick: [0, 3, 5], snare: [2, 6], hat: [1, 3, 5, 7]},
    dance: {kick: [0, 2, 4, 6], snare: [2, 6], hat: [1, 3, 5, 7]},
    latin: {kick: [0, 3, 6], snare: [2, 5, 7], hat: [1, 4, 7]},
};
const rewards = {
    parked: [72, 76, 79, 84],
    repaired: [62, 69, 74, 78, 81],
};

export class DriveAudio {
    station = 1;
    enabled = true;
    step = 0;
    next = 0;
    running = false;

    unlock() {
        try {
            const Context = window.AudioContext || window.webkitAudioContext;
            if (!Context) return;
            if (!this.context) {
                this.context = new Context();
                this.music = this.context.createGain();
                this.music.gain.value = 0;
                this.music.connect(this.context.destination);
                this.fx = this.context.createGain();
                this.fx.gain.value = .52;
                this.fx.connect(this.context.destination);
                this.noise = this.context.createBuffer(1, this.context.sampleRate / 3, this.context.sampleRate);
                const samples = this.noise.getChannelData(0);
                for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
                const gravel = this.context.createBufferSource();
                gravel.buffer = this.noise;
                gravel.loop = true;
                this.gravelFilter = this.context.createBiquadFilter();
                this.gravelFilter.type = 'lowpass';
                this.gravelGain = this.context.createGain();
                this.gravelGain.gain.value = 0;
                gravel.connect(this.gravelFilter).connect(this.gravelGain).connect(this.fx);
                gravel.start();
                this.context.addEventListener('statechange', () => {
                    if (this.context.state === 'running') this.next = this.context.currentTime;
                    this.syncHorn();
                });
            }
            if (this.context.state !== 'running') this.context.resume().catch(() => {});
        } catch { /* Driving works without an audio device. */ }
    }

    voice(hz, end, start, duration, volume, wave, output, attack = .012) {
        const ctx = this.context;
        const osc = ctx.createOscillator(), envelope = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(hz, start);
        osc.frequency.linearRampToValueAtTime(end, start + duration);
        envelope.gain.setValueAtTime(.0001, start);
        envelope.gain.linearRampToValueAtTime(volume, start + attack);
        envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
        osc.connect(envelope).connect(output);
        osc.start(start);
        osc.stop(start + duration);
    }

    noiseHit(start, duration, hz, volume, output) {
        const ctx = this.context;
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
        source.buffer = this.noise;
        source.loop = duration > this.noise.duration;
        filter.type = 'bandpass';
        filter.frequency.value = hz;
        filter.Q.value = .65;
        envelope.gain.setValueAtTime(volume, start);
        envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
        source.connect(filter).connect(envelope).connect(output);
        source.start(start);
        source.stop(start + duration);
    }

    setRadio(station, running) {
        if (station !== this.station) {
            this.station = station;
            this.step = 0;
            this.next = this.context?.currentTime ?? 0;
        }
        this.running = running;
        if (this.context) {
            const now = this.context.currentTime;
            this.music.gain.cancelScheduledValues(now);
            this.music.gain.setTargetAtTime(running && station ? .42 : 0, now, .025);
            if (!running) this.gravelGain.gain.setTargetAtTime(0, now, .035);
        }
    }

    arrange(track, at) {
        const beat = this.step % 8;
        const bar = Math.floor(this.step / 8);
        const section = sections[Math.floor(bar / 8)];
        const theme = track.themes[section.theme];
        const {root, notes} = theme[bar % theme.length];
        const music = this.music;
        const pulse = track.beat;
        const rhythmic = track.beatStyle !== 'soft';
        if (beat === 0 || (beat === 5 && rhythmic)) {
            const bass = frequency(root - 12 + (beat === 0 ? 0 : 7));
            this.voice(bass, bass, at, pulse * (beat === 0 ? 2.5 : 1.5), .23, 'triangle', music);
            this.voice(bass / 2, bass / 2, at, pulse * 1.65, .07, 'sine', music);
        }
        if ((section.chords && beat === 0) || (!section.chords && (beat === 2 || beat === 6))) {
            for (const note of notes.slice(1)) {
                const tone = frequency(root + note + (note < 5 ? 12 : 0));
                this.voice(tone, tone, at, pulse * (section.chords ? 6.9 : 1.2), .074, 'sine',
                    music, section.chords ? .09 : .016);
            }
        }
        if (section.melody || bar >= (rhythmic ? 0 : 3)) {
            const motif = track.motifs[(section.theme + Math.floor((bar % 8) / 2)) % track.motifs.length];
            const degree = motif[beat];
            if (degree >= 0) {
                const tone = frequency(root + notes[degree % 4] + (degree >= 4 ? 24 : 12));
                this.voice(tone, tone, at, pulse * (beat % 2 ? 1.3 : 1.85), .105, track.wave, music);
                this.voice(tone * 2, tone * 2, at + .014, pulse * .88, .031, 'sine', music);
                if (track.beatStyle === 'dance' || track.beatStyle === 'latin') {
                    this.voice(tone, tone, at + pulse * .74, pulse * 1.38, .027, 'sine', music);
                }
            }
        }
        if (!section.drums && !(bar < 8 && rhythmic)) return;
        const kit = drums[track.beatStyle];
        if (kit.kick.includes(beat)) this.voice(112, 45, at, .13, .19, 'sine', music);
        if (kit.snare.includes(beat)) this.noiseHit(at, .12, 1550, .19, music);
        if (kit.hat.includes(beat)) this.noiseHit(at, .065, 6300, beat === 7 ? .105 : .066, music);
        if (bar % 8 === 7 && beat >= 6) this.voice(182 - beat * 10, 78, at, .14, .12, 'sine', music);
    }

    terrain(time, speed) {
        const now = this.context.currentTime;
        const intensity = this.enabled ? Math.min(1, Math.max(0, (speed - .65) / 10)) : 0;
        const texture = .81 + .13 * Math.sin(time * (15 + speed)) + .06 * Math.sin(time * 41);
        this.gravelGain.gain.setTargetAtTime(intensity * texture * .25, now, .10);
        this.gravelFilter.frequency.setTargetAtTime(330 + 1000 * intensity, now, .12);
    }

    tick(time, car, distance, dirtSpeed = 0) {
        const ctx = this.context;
        if (ctx?.state !== 'running' || !this.running) return;
        const now = ctx.currentTime;
        if (this.station) {
            const track = stations[this.station - 1];
            if (this.next < now - .1) this.next = now;
            while (this.next < now + .12) {
                this.arrange(track, this.next);
                this.next += track.beat * (1 + (this.step % 2 ? -track.swing : track.swing));
                this.step = (this.step + 1) % (sections.length * 8 * 8);
            }
        }
        this.terrain(time, dirtSpeed);

        // The nearest service vehicle supplies a quiet, distance-attenuated siren.
        if (!car || !this.enabled || now < (this.nextSiren ?? 0) || (time + car.id) % 12 > 5) return;
        this.siren(car.kind, time + car.id, now, .15 * (1 - distance / 70));
        this.nextSiren = now + .14;
    }

    siren(kind, time, now, gain) {
        // Police yelp in quick rising/falling bursts; the fire engine has a slower two-layer wail.
        const police = kind === 'police', fire = kind === 'fire';
        const phase = t => .5 + .5 * Math.sin(t * Math.PI * 2 * (police ? 3.1 : fire ? .64 : 1.55));
        const sweep = t => (police ? 690 : fire ? 340 : 590) + (police ? 650 : fire ? 440 : 510) * phase(t);
        const start = sweep(time), end = sweep(time + .14);
        const volume = police && Math.floor(time * 2.5) % 5 === 4 ? gain * .28 : gain;
        this.voice(start, end, now, .19, volume, fire ? 'triangle' : 'sine', this.fx, .026);
        this.voice(start * 2.02, end * 2.02, now, .17, volume * .34, 'triangle', this.fx, .025);
        if (fire) this.voice(162, 153, now, .18, volume * (.33 + .22 * phase(time)), 'sawtooth', this.fx, .03);
    }

    setHorn(held) {
        this.hornHeld = held;
        this.syncHorn();
    }

    syncHorn() {
        const ctx = this.context;
        const active = this.hornHeld && this.enabled && this.running && ctx?.state === 'running';
        if (active && !this.hornVoice) {
            const now = ctx.currentTime;
            const envelope = ctx.createGain();
            envelope.gain.setValueAtTime(0, now);
            envelope.gain.setTargetAtTime(1, now, .009);
            envelope.connect(this.fx);
            const notes = [[398, 392, .21, 'triangle'], [492, 486, .17, 'triangle'],
                [796, 782, .062, 'sine'], [984, 968, .05, 'sine']];
            const oscillators = notes.map(([start, pitch, volume, wave]) => {
                const oscillator = ctx.createOscillator(), level = ctx.createGain();
                oscillator.type = wave;
                oscillator.frequency.setValueAtTime(start, now);
                oscillator.frequency.setTargetAtTime(pitch, now, .045);
                level.gain.value = volume;
                oscillator.connect(level).connect(envelope);
                oscillator.start(now);
                return oscillator;
            });
            this.hornVoice = {envelope, oscillators};
            this.noiseHit(now, .075, 1100, .15, this.fx);
        } else if (!active && this.hornVoice) {
            const {envelope, oscillators} = this.hornVoice;
            const now = ctx.currentTime;
            envelope.gain.cancelScheduledValues(now);
            envelope.gain.setTargetAtTime(0, now, .015);
            oscillators[0].onended = () => envelope.disconnect();
            for (const oscillator of oscillators) oscillator.stop(now + .09);
            this.hornVoice = null;
        }
    }

    reward(name) {
        if (this.context?.state !== 'running' || !this.enabled) return;
        const now = this.context.currentTime, repaired = name === 'repaired';
        if (this.station) {
            this.music.gain.cancelScheduledValues(now);
            this.music.gain.setTargetAtTime(.15, now, .055);
            this.music.gain.setTargetAtTime(.42, now + .8, .2);
        }
        for (const [i, note] of rewards[name].entries()) {
            const time = now + i * (repaired ? .102 : .083);
            const tone = frequency(note);
            this.voice(tone, tone, time, repaired ? .43 : .34, .21, repaired ? 'triangle' : 'sine', this.fx);
            this.voice(tone * 2, tone * 2, time, .19, .069, 'sine', this.fx);
        }
        if (repaired) this.noiseHit(now, .15, 1800, .18, this.fx);
    }

    splash() {
        if (this.context?.state !== 'running' || !this.enabled) return;
        const now = this.context.currentTime;
        this.noiseHit(now, .62, 880, .58, this.fx);
        this.voice(111, 39, now, .32, .35, 'sine', this.fx);
        for (let i = 0; i < 5; i++) {
            const start = now + .18 + i * .096;
            this.voice(280 - i * 29, 515 - i * 54, start, .11, .11 - i * .013, 'sine', this.fx);
        }
    }

    land() {
        if (this.context?.state !== 'running' || !this.enabled) return;
        const now = this.context.currentTime;
        this.voice(107, 48, now, .22, .28, 'sine', this.fx);
        this.noiseHit(now, .14, 430, .28, this.fx);
    }

    crash(strength) {
        const ctx = this.context;
        if (ctx?.state !== 'running' || !this.enabled) return;
        const now = ctx.currentTime;
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
        source.buffer = this.noise;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3100, now);
        filter.frequency.exponentialRampToValueAtTime(240, now + .26);
        envelope.gain.setValueAtTime(Math.min(.8, .28 + strength * .025), now);
        envelope.gain.exponentialRampToValueAtTime(.001, now + .31);
        source.connect(filter).connect(envelope).connect(this.fx);
        source.start(now);
        this.voice(112, 37, now, .22, .4, 'triangle', this.fx);
    }
}
