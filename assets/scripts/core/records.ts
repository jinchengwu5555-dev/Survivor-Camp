// 跨局记录：营地覆灭后保留下来的东西——最长存活天数、局数、历史战绩、成就。
// 单独存档（不在 GameState 里），新开一局时成就会带过去，不会重复发奖励。

import { KeyValueStorage } from './save';
import { GameConfig, GameState } from './types';

export const RECORDS_KEY = 'doomsday-camp-records';
const MAX_HISTORY = 10;

export interface RunSummary {
    endedAt: number;
    days: number;
    cause: string;
    site: string;
    bestRaidLevel: number;
    zombiesKilled: number;
}

export interface MetaRecords {
    version: 1;
    bestDays: number;
    bestRaidLevel: number;
    runs: number;
    /** 所有局加起来存活的天数 */
    totalDays: number;
    achievements: string[];
    history: RunSummary[];
}

export function emptyRecords(): MetaRecords {
    return { version: 1, bestDays: 0, bestRaidLevel: 0, runs: 0, totalDays: 0, achievements: [], history: [] };
}

export function loadRecords(storage: KeyValueStorage): MetaRecords {
    try {
        const raw = storage.getItem(RECORDS_KEY);
        const parsed = raw ? (JSON.parse(raw) as MetaRecords) : null;
        return parsed?.version === 1 ? parsed : emptyRecords();
    } catch {
        return emptyRecords();
    }
}

export function saveRecords(storage: KeyValueStorage, records: MetaRecords): void {
    storage.setItem(RECORDS_KEY, JSON.stringify(records));
}

/** 营地覆灭后记录这一局；返回是否刷新了最长存活纪录 */
export function recordRun(config: GameConfig, records: MetaRecords, state: GameState): boolean {
    const over = state.gameOver;
    if (!over) return false;
    const newBest = over.day > records.bestDays;
    records.runs += 1;
    records.totalDays += over.day;
    records.bestDays = Math.max(records.bestDays, over.day);
    records.bestRaidLevel = Math.max(records.bestRaidLevel, state.stats.best_raid_level ?? 0);
    for (const a of state.achievements) if (!records.achievements.includes(a.id)) records.achievements.push(a.id);
    records.history.unshift({
        endedAt: over.at,
        days: over.day,
        cause: over.cause,
        site: config.sites.find((s) => s.id === state.siteId)?.name ?? state.siteId,
        bestRaidLevel: state.stats.best_raid_level ?? 0,
        zombiesKilled: state.stats.zombies_killed ?? 0,
    });
    records.history.splice(MAX_HISTORY);
    return newBest;
}

/** 新的一局：已经解锁的成就带过来（不再发奖励） */
export function carryOverAchievements(records: MetaRecords, state: GameState, now: number): void {
    for (const id of records.achievements) if (!state.achievements.some((a) => a.id === id)) state.achievements.push({ id, at: now });
}
