// 存档读写。Storage 由平台层提供（Cocos 里用 sys.localStorage，测试里用内存实现）。

import { GameConfig, GameState } from './types';
import { SAVE_VERSION, syncBuildings } from './state';

export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export const SAVE_KEY = 'doomsday-camp-save';

export function serialize(state: GameState): string {
    return JSON.stringify(state);
}

/** 解析失败或版本不兼容时返回 null（调用方应开新档） */
export function deserialize(config: GameConfig, raw: string | null): GameState | null {
    if (!raw) return null;
    let state: GameState;
    try {
        state = JSON.parse(raw) as GameState;
    } catch {
        return null;
    }
    if (typeof state !== 'object' || state === null || state.version !== SAVE_VERSION) return null;
    syncBuildings(config, state);
    return state;
}

export function saveGame(storage: KeyValueStorage, state: GameState): void {
    storage.setItem(SAVE_KEY, serialize(state));
}

export function loadGame(storage: KeyValueStorage, config: GameConfig): GameState | null {
    return deserialize(config, storage.getItem(SAVE_KEY));
}
