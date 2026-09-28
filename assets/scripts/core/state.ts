// 新游戏初始化、日志、存档迁移。

import { GameConfig, GameState, RESOURCE_IDS, SurvivorState } from './types';
import { emptyBag } from './economy';

export const SAVE_VERSION = 1;
const MAX_LOG = 50;

export function createNewState(config: GameConfig, now: number, seed: number): GameState {
    const b = config.balance;
    const resources = emptyBag();
    for (const id of RESOURCE_IDS) resources[id] = b.startingResources[id] ?? 0;

    const state: GameState = {
        version: SAVE_VERSION,
        createdAt: now,
        lastTickAt: now,
        resources,
        buildings: {},
        survivors: b.startingSurvivors.map((id) => newSurvivorState(config, id)),
        flags: [],
        seenEvents: [],
        eventQueue: [],
        nextRandomEventAt: now + b.eventIntervalMinutes * 60_000,
        episodeIndex: 0,
        rngState: seed | 0,
        log: [],
    };
    syncBuildings(config, state);
    return state;
}

export function newSurvivorState(config: GameConfig, id: string): SurvivorState {
    return { id, mood: config.balance.newSurvivorMood, injured: false, assignment: null };
}

/** 配置里新增的建筑补进老存档，已删除的建筑从存档移除 */
export function syncBuildings(config: GameConfig, state: GameState): void {
    const next: GameState['buildings'] = {};
    for (const def of config.buildings) {
        next[def.id] = state.buildings[def.id] ?? { id: def.id, level: def.startLevel, upgradeEndsAt: null };
    }
    state.buildings = next;
    for (const s of state.survivors) {
        if (s.assignment && !next[s.assignment]) s.assignment = null;
    }
}

export function addLog(state: GameState, at: number, text: string): void {
    state.log.push({ at, text });
    if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

/** 营地已存活的天数，从第 1 天开始 */
export function currentDay(config: GameConfig, state: GameState, now: number): number {
    const dayMs = config.balance.dayLengthMinutes * 60_000;
    return Math.floor(Math.max(0, now - state.createdAt) / dayMs) + 1;
}

export function hasFlag(state: GameState, flag: string): boolean {
    return state.flags.includes(flag);
}

export function setFlag(state: GameState, flag: string): void {
    if (!hasFlag(state, flag)) state.flags.push(flag);
}
