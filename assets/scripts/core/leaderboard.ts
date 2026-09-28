// 排行榜上报的数据。比的是“最长存活天数”，天数按在线时间算（见 clock.ts），服务器还会再校验一次。

import { GameConfig, GameState } from './types';
import { MetaRecords } from './records';
import { currentDay } from './state';

export interface ScoreEntry {
    /** 这一局的 id（开局时间），服务器用它区分是不是同一局 */
    runId: number;
    /** 这一局存活到第几天 */
    days: number;
    /** 历史最长（含这一局） */
    bestDays: number;
}

export function scoreEntry(config: GameConfig, state: GameState, records: MetaRecords, now: number): ScoreEntry {
    const days = state.gameOver ? state.gameOver.day : currentDay(config, state, now);
    return { runId: state.createdAt, days, bestDays: Math.max(records.bestDays, days) };
}

export interface RankRow {
    name: string;
    bestDays: number;
    /** 是不是自己 */
    me: boolean;
}

export interface GlobalRanking {
    list: RankRow[];
    me: { bestDays: number; rank: number } | null;
}
