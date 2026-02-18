// Web Audio API Sound Manager (No external files needed)
class SoundService {
    constructor() {
        this.audioCtx = null;
        this.activeOscillators = [];
    }

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    async ensureAudioContext() {
        this.init();
        if (this.audioCtx.state === 'suspended') {
            try {
                await this.audioCtx.resume();
                console.log("[SoundService] AudioContext resumed");
            } catch (e) {
                console.warn("[SoundService] Failed to resume AudioContext:", e);
            }
        }
    }

    play(type, loop = false) {
        this.init();
        this.ensureAudioContext(); // Try to resume, but don't blocking wait for immediate start
        this.stop(); // Stop any pending sounds

        const playTone = () => {
            const oscillator = this.audioCtx.createOscillator();
            const gainNode = this.audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);
            const now = this.audioCtx.currentTime;

            if (type === 'ringtone') {
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(880, now);
                oscillator.frequency.exponentialRampToValueAtTime(1100, now + 0.4);
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.3, now + 0.1);
                gainNode.gain.linearRampToValueAtTime(0, now + 1.5);
                oscillator.start(now);
                oscillator.stop(now + 1.5);
            } else if (type === 'dialing') {
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, now);
                // Dial tone is traditionally dual-frequency (350+440). 
                // For simplification, we use a single stable frequency.
                oscillator.frequency.setValueAtTime(440, now);
                gainNode.gain.setValueAtTime(0.1, now);
                oscillator.start(now);
                oscillator.stop(now + 1.5);
            } else if (type === 'end') {
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(400, now);
                oscillator.frequency.linearRampToValueAtTime(100, now + 0.3);
                gainNode.gain.setValueAtTime(0.3, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
                oscillator.start(now);
                oscillator.stop(now + 0.3);
            }

            this.activeOscillators.push({ oscillator, gainNode });
            oscillator.onended = () => {
                this.activeOscillators = this.activeOscillators.filter(o => o.oscillator !== oscillator);
            };
        };

        playTone();
        if (loop) {
            this.loopInterval = setInterval(playTone, type === 'ringtone' ? 2000 : 3000);
        }
    }

    stop() {
        if (this.loopInterval) {
            clearInterval(this.loopInterval);
            this.loopInterval = null;
        }
        if (this.activeOscillators) {
            this.activeOscillators.forEach(({ oscillator, gainNode }) => {
                try {
                    oscillator.stop();
                    oscillator.disconnect();
                    gainNode.disconnect();
                } catch (e) { /* ignore if already stopped */ }
            });
            this.activeOscillators = [];
        }
    }
}

export const soundService = new SoundService();
