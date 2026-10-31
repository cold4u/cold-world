// Audio Manager for Messenger Planet
// Streams the official soundtrack from https://messenger.abeto.co/assets/audio/music/bgmusic-highq.ogg
// Includes Web Audio API procedural synthesizer fallback and rich sound effects!

class AudioManager {
  constructor() {
    this.audioElement = document.getElementById('bg-audio');
    this.isMuted = false;
    this.volume = 0.5;
    this.audioCtx = null;
    this.isInitialized = false;
    this.officialMusicUrl = 'https://messenger.abeto.co/assets/audio/music/bgmusic-highq.ogg';
    this.mobileMusicUrl = 'https://messenger.abeto.co/assets/audio/music/bgmusic-mobile.ogg';
    this.synthMusicPlaying = false;
    this.synthLoopTimeout = null;

    // Connect audio toggle button
    this.audioBtn = document.getElementById('btn-audio');
    this.audioIcon = document.getElementById('audio-icon');

    if (this.audioBtn) {
      this.audioBtn.addEventListener('click', () => this.toggleMute());
    }
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Create Web Audio context for SFX and procedural fallback
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      this.audioCtx = new AudioContextClass();
    }

    // Try playing the official soundtrack
    if (this.audioElement) {
      this.audioElement.src = this.officialMusicUrl;
      this.audioElement.volume = this.volume;
      this.audioElement.loop = true;

      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('Playing official soundtrack from messenger.abeto.co');
        }).catch(err => {
          console.warn('Audio autoplay prevented or stream blocked. Starting fallback synth music:', err);
          this.startProceduralMusic();
        });
      }

      this.audioElement.addEventListener('error', (e) => {
        console.warn('Official stream error, falling back to gentle synthesizer:', e);
        this.startProceduralMusic();
      });
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.audioElement) {
      this.audioElement.muted = this.isMuted;
    }
    if (this.audioIcon) {
      this.audioIcon.textContent = this.isMuted ? '🔇' : '🔊';
    }
    if (this.isMuted && this.synthMusicPlaying) {
      this.stopProceduralMusic();
    } else if (!this.isMuted && !this.audioElement?.currentTime && !this.synthMusicPlaying) {
      this.startProceduralMusic();
    }
  }

  // Animal Crossing style speech chatter blips
  playDialogueBlip(pitch = 1.0) {
    if (this.isMuted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      const baseFreq = 260 * pitch + (Math.random() * 40 - 20);
      osc.frequency.setValueAtTime(baseFreq, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, this.audioCtx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.08 * this.volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.08);
    } catch (e) {
      // Ignore audio error
    }
  }

  // Jump sound
  playJump() {
    if (this.isMuted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(480, this.audioCtx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.12 * this.volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.22);
    } catch (e) {}
  }

  // Package Pickup chime
  playPackageReceived() {
    if (this.isMuted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const startTime = this.audioCtx.currentTime + idx * 0.08;
        gain.gain.setValueAtTime(0.12 * this.volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.4);
      });
    } catch (e) {}
  }

  // Delivery Completed Victory Fanfare
  playDeliveryCompleted() {
    if (this.isMuted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const melody = [
        { f: 440, d: 0.15 }, // A4
        { f: 554.37, d: 0.15 }, // C#5
        { f: 659.25, d: 0.15 }, // E5
        { f: 880, d: 0.45 }     // A5
      ];
      let offset = 0;
      melody.forEach(item => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = item.f;

        const start = this.audioCtx.currentTime + offset;
        gain.gain.setValueAtTime(0.18 * this.volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + item.d + 0.1);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(start);
        osc.stop(start + item.d + 0.15);
        offset += item.d;
      });
    } catch (e) {}
  }

  // Soft Footstep Sound
  playFootstep() {
    if (this.isMuted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(100 + Math.random() * 20, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.audioCtx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.04 * this.volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.06);
    } catch (e) {}
  }

  // Procedural Calming Ambient Chords (fallback if offline / stream blocked)
  startProceduralMusic() {
    if (this.synthMusicPlaying || this.isMuted || !this.audioCtx) return;
    this.synthMusicPlaying = true;

    const chords = [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00], // Am7
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [196.00, 246.94, 293.66, 392.00]  // G7
    ];
    let chordIndex = 0;

    const playChord = () => {
      if (!this.synthMusicPlaying || this.isMuted) return;
      try {
        const chord = chords[chordIndex % chords.length];
        chordIndex++;
        const now = this.audioCtx.currentTime;

        chord.forEach((freq, i) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = i === 0 ? 'sine' : 'triangle';
          osc.frequency.value = freq;

          const duration = 3.8;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.03 * this.volume, now + 1.2);
          gain.gain.linearRampToValueAtTime(0.0001, now + duration);

          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now);
          osc.stop(now + duration + 0.1);
        });

        this.synthLoopTimeout = setTimeout(playChord, 3600);
      } catch (e) {}
    };

    playChord();
  }

  stopProceduralMusic() {
    this.synthMusicPlaying = false;
    if (this.synthLoopTimeout) {
      clearTimeout(this.synthLoopTimeout);
      this.synthLoopTimeout = null;
    }
  }
}

// Global instance
window.audioManager = new AudioManager();
