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

    play(type, loop = false) {
        this.init();
        this.stop(); // Stop any pending sounds

        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;

        if (type === 'ringtone') {
            // Incoming Call Pattern (High-Low)
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, now); // A5
            oscillator.frequency.setValueAtTime(1100, now + 0.4); // C#6
            oscillator.frequency.setValueAtTime(880, now + 0.8);

            gainNode.gain.setValueAtTime(0.5, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 1.5);

            oscillator.start(now);
            if (loop) {
                // Approximate loop by re-triggering? 
                // Web Audio loop is complex without AudioBuffer. 
                // For simple tone, we just play once or use setInterval in a real app.
                // Here we'll just play a long tone for simplicity if looped
                oscillator.frequency.setValueAtTime(600, now);
                gainNode.gain.setValueAtTime(0.3, now);
                oscillator.stop(now + 4);
            } else {
                oscillator.stop(now + 1.5);
            }

        } else if (type === 'dialing') {
            // Outgoing Call (Standard Dial Tone)
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, now); // A4
            oscillator.frequency.setValueAtTime(480, now + 0.1);

            gainNode.gain.setValueAtTime(0.1, now);
            oscillator.start(now);
            if (loop) {
                oscillator.stop(now + 2); // Play for 2s then caller usually handles repetition
            } else {
                oscillator.stop(now + 2);
            }

        } else if (type === 'end') {
            // Call Ended (Descending)
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(400, now);
            oscillator.frequency.linearRampToValueAtTime(100, now + 0.3);

            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.3);

            oscillator.start(now);
            oscillator.stop(now + 0.3);
        }

        this.activeOscillators.push({ oscillator, gainNode });

        // Cleanup when done
        oscillator.onended = () => {
            this.activeOscillators = this.activeOscillators.filter(o => o.oscillator !== oscillator);
        };
    }

    stop() {
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
