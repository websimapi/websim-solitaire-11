export class AudioManager {
    constructor() {
        this.sounds = {};
        this.enabled = true;
    }

    async load() {
        // Pre-instantiate Audio objects
        this.sounds['place'] = new Audio('card_place.mp3');
        this.sounds['shuffle'] = new Audio('card_shuffle.mp3');
        this.sounds['win'] = new Audio('win.mp3');
    }

    play(name) {
        if (!this.enabled || !this.sounds[name]) return;

        // Clone node allows overlapping sounds
        const sound = this.sounds[name].cloneNode();
        sound.volume = 0.5;
        sound.play().catch(e => console.log("Audio play failed (interaction needed first)", e));
    }
}