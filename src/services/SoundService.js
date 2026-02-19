// Web Audio API Sound Manager (No external files needed)
class SoundService {
    constructor() {
        this.audioCtx = null;
        this.activeOscillators = [];
        this.unlocked = false;

        this.activeOscillators = [];
        this.unlocked = false;
        // Global unlock removed to prevent "AudioContext not allowed to start" errors.
        // We now rely on lazy initialization in play() checking navigator.userActivation.
    }


    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    async ensureAudioContext() {
        this.init();
        // Only attempt to resume if we think we might be allowed, or if we want to risk the warning.
        // If state is suspended and we haven't unlocked, it will likely fail for ringtones (no interaction).
        if (this.audioCtx.state === 'suspended') {
            try {
                await this.audioCtx.resume();
                console.log("[SoundService] AudioContext resumed");
                this.unlocked = true;
            } catch (e) {
                // Squelch error - it's expected if no interaction yet
                console.debug("[SoundService] Autoplay prevented (waiting for interaction)");
            }
        }
    }

    play(type, loop = false) {
        // STRICT CHECK: Do not even initialize AudioContext if we haven't interacted.
        // This avoids the "AudioContext was not allowed to start" console warning.
        const canVibrate = typeof navigator !== 'undefined' && navigator.vibrate;
        const isInteracted = this.unlocked || (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive);

        if (!isInteracted) {
            console.debug(`[SoundService] Skipping '${type}' sound - no user interaction yet.`);
            // If it's a loop (ringtone), we can try to start it later if they interact
            if (loop && !this.loopInterval) {
                this.loopInterval = setInterval(() => {
                    const currentUnlocked = this.unlocked || (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive);
                    if (currentUnlocked) {
                        this.play(type, loop); // Retry playing fully
                        // Clear this specific polling interval since play() will set up its own
                        if (this.loopInterval) clearInterval(this.loopInterval);
                    }
                }, 1000);
            }
            return;
        }

        this.init();
        this.ensureAudioContext();
        this.stop(); // Stop previous sounds

        // Vibration (active interaction confirmed by isInteracted check above)
        if (type === 'ringtone' && canVibrate) {
            try {
                navigator.vibrate([500, 200]);
            } catch (e) { console.debug("Vibration blocked"); }
        }

        const playTone = () => {
            if (this.audioCtx.state === 'suspended') return; // Skip if still locked

            try {
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
            } catch (e) {
                console.debug("[SoundService] Sound play failed:", e);
            }
        };

        // Loop Logic
        playTone();
        if (loop) {
            this.loopInterval = setInterval(() => {
                const currentUnlocked = this.unlocked || (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive);
                if (type === 'ringtone' && canVibrate && currentUnlocked) {
                    try { navigator.vibrate([500, 200]); } catch (e) { }
                }
                playTone();
            }, type === 'ringtone' ? 2000 : 3000);
        }
    }

    stop() {
        if (this.loopInterval) {
            clearInterval(this.loopInterval);
            this.loopInterval = null;
        }

        // Stop vibration
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(0); } catch (e) { }
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
