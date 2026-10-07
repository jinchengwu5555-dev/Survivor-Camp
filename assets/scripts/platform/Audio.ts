// 音效和背景音乐。音频文件在 assets/resources/audio/（由 tools/make_audio.py 合成，想换正式音效直接同名覆盖）。
// 文件还没加载完、或者根本没有这个文件时静默跳过，不会报错。
// 音效、音乐的开关分开存在本地（不进存档）。

import { AudioClip, AudioSource, Node, resources } from 'cc';
import { KeyValueStorage } from '../core/save';

export type SfxName =
    | 'click'
    | 'confirm'
    | 'coin'
    | 'error'
    | 'build'
    | 'hit'
    | 'crit'
    | 'zombie_die'
    | 'ally_down'
    | 'alarm'
    | 'win'
    | 'lose'
    | 'heal'
    | 'skill'
    | 'repair'
    | 'page';

export type MusicName = 'day' | 'night';

const SFX: SfxName[] = ['click', 'confirm', 'coin', 'error', 'build', 'hit', 'crit', 'zombie_die', 'ally_down', 'alarm', 'win', 'lose', 'heal', 'skill', 'repair', 'page'];
const MUSIC: MusicName[] = ['day', 'night'];
const SFX_KEY = 'doomsday_camp_sfx';
const MUSIC_KEY = 'doomsday_camp_music';
/** 同一个音效两次之间至少隔多少毫秒（尸群一多，打击声会糊成一片） */
const MIN_GAP: Partial<Record<SfxName, number>> = { hit: 70, crit: 90, zombie_die: 90, click: 40, heal: 120 };
const VOLUME: Partial<Record<SfxName, number>> = { hit: 0.45, crit: 0.6, click: 0.5, zombie_die: 0.6, heal: 0.5, skill: 0.6 };
const MUSIC_VOLUME = 0.35;

export class GameAudio {
    sfxOn: boolean;
    musicOn: boolean;
    private readonly sfxSource: AudioSource;
    private readonly musicSource: AudioSource;
    private readonly clips = new Map<string, AudioClip>();
    private readonly lastPlayed = new Map<SfxName, number>();
    private wantedMusic: MusicName | null = null;
    private playingMusic: MusicName | null = null;

    constructor(
        node: Node,
        private readonly storage: KeyValueStorage,
    ) {
        this.sfxSource = node.addComponent(AudioSource);
        this.musicSource = node.addComponent(AudioSource);
        this.musicSource.loop = true;
        this.musicSource.volume = MUSIC_VOLUME;
        this.sfxOn = this.read(SFX_KEY);
        this.musicOn = this.read(MUSIC_KEY);
        for (const name of [...SFX.map((s) => `sfx_${s}`), ...MUSIC.map((m) => `music_${m}`)]) this.load(name);
    }

    /** 放一个音效 */
    play(name: SfxName): void {
        if (!this.sfxOn) return;
        const clip = this.clips.get(`sfx_${name}`);
        if (!clip) return;
        const now = Date.now();
        const gap = MIN_GAP[name] ?? 30;
        if (now - (this.lastPlayed.get(name) ?? 0) < gap) return;
        this.lastPlayed.set(name, now);
        try {
            this.sfxSource.playOneShot(clip, VOLUME[name] ?? 0.8);
        } catch {
            // 部分机型音频上下文还没准备好，跳过这一下
        }
    }

    /** 切换背景音乐（null = 停掉）；同一首不会从头重放 */
    music(name: MusicName | null): void {
        this.wantedMusic = name;
        this.applyMusic();
    }

    setSfx(on: boolean): void {
        this.sfxOn = on;
        this.write(SFX_KEY, on);
    }

    setMusic(on: boolean): void {
        this.musicOn = on;
        this.write(MUSIC_KEY, on);
        this.applyMusic();
    }

    private applyMusic(): void {
        const name = this.musicOn ? this.wantedMusic : null;
        if (name === this.playingMusic) return;
        const clip = name ? this.clips.get(`music_${name}`) : undefined;
        if (name && !clip) return; // 还没加载好，加载完会再调一次
        try {
            this.musicSource.stop();
            if (clip) {
                this.musicSource.clip = clip;
                this.musicSource.play();
            }
            this.playingMusic = name;
        } catch {
            this.playingMusic = null;
        }
    }

    private load(name: string): void {
        const path = `audio/${name}`;
        if (!resources.getInfoWithPath(path, AudioClip)) return;
        resources.load(path, AudioClip, (err, clip) => {
            if (err || !clip) return;
            this.clips.set(name, clip);
            if (name.startsWith('music_')) this.applyMusic();
        });
    }

    private read(key: string): boolean {
        try {
            return this.storage.getItem(key) !== '0';
        } catch {
            return true;
        }
    }

    private write(key: string, on: boolean): void {
        try {
            this.storage.setItem(key, on ? '1' : '0');
        } catch {
            // 存不了也没关系
        }
    }
}

/** 全局的音频（GameRoot 创建）；没创建时调用都是空操作，方便 widgets / BattleView 直接用 */
let instance: GameAudio | null = null;

export function initAudio(node: Node, storage: KeyValueStorage): GameAudio {
    instance = new GameAudio(node, storage);
    return instance;
}

export function sfx(name: SfxName): void {
    instance?.play(name);
}

export function music(name: MusicName | null): void {
    instance?.music(name);
}

export function audio(): GameAudio | null {
    return instance;
}
