// 存档读写。Storage 由平台层提供（Cocos 里用 sys.localStorage，测试里用内存实现）。

import { GameConfig, GameState } from './types';
import { migrateState, syncBuildings } from './state';

export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export const SAVE_KEY = 'doomsday-camp-save';

export function serialize(state: GameState): string {
    return JSON.stringify(state);
}

/** 解析失败或版本不兼容时返回 null（调用方应开新档）。now 用于老存档升级时补全时间字段 */
export function deserialize(config: GameConfig, raw: string | null, now = Date.now()): GameState | null {
    if (!raw) return null;
    let state: GameState;
    try {
        state = JSON.parse(raw) as GameState;
    } catch {
        return null;
    }
    if (typeof state !== 'object' || state === null || !migrateState(config, state, now)) return null;
    syncBuildings(config, state);
    return state;
}

export function saveGame(storage: KeyValueStorage, state: GameState): void {
    storage.setItem(SAVE_KEY, serialize(state));
}

export function loadGame(storage: KeyValueStorage, config: GameConfig, now = Date.now()): GameState | null {
    return deserialize(config, storage.getItem(SAVE_KEY), now);
}
