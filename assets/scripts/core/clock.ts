// 在线时钟：游戏时间只在玩家在线时走。
//
// 界面每秒调用一次 advanceClock(真实时间)：两次调用间隔不超过 onlineGapSeconds 秒就算“一直在线”，
// 游戏时间按 onlineTimeScale 倍速前进；间隔更长（切到后台、关掉游戏、断网）就算离线，游戏时间停住，
// 离线的这段只用来发一点挂机收益（见 offline.ts）。
// 这样存活天数只和在线时长有关，改手机时间也没用：往前拨不会让游戏时间多走，往回拨也拿不到重复的离线收益。

import { GameConfig, GameState } from './types';

export interface ClockState {
    /** 当前游戏时间（毫秒），core 里所有的 now 都是它 */
    gameTime: number;
    /** 上一次调用 advanceClock 时的真实时间 */
    lastRealAt: number;
    /** 见过的最大真实时间：离线收益只从这之后算，把手机时间往回拨再往前拨拿不到重复收益 */
    maxRealAt: number;
    /** 累计在线的真实毫秒数（排行榜校验用） */
    onlineMs: number;
    /** 玩家按了暂停：游戏时间不走，也不算离线收益 */
    paused?: boolean;
    /** 玩家选的倍速（设置里的 ×1 / ×2 / ×4），不写 = 1 */
    speed?: number;
}

export interface ClockStep {
    gameNow: number;
    /** 这次调用前离线了多久（真实毫秒）；一直在线时是 0 */
    offlineMs: number;
}

export function newClock(realNow: number): ClockState {
    return { gameTime: realNow, lastRealAt: realNow, maxRealAt: realNow, onlineMs: 0 };
}

export function advanceClock(config: GameConfig, state: GameState, realNow: number): ClockStep {
    const c = state.clock;
    const { onlineTimeScale, onlineGapSeconds } = config.balance.clock;
    const gap = realNow - c.lastRealAt;
    let offlineMs = 0;
    if (c.paused) {
        // 暂停中：时间不走；暂停期间也不算离线（不然暂停挂着就能白拿离线收益）
    } else if (gap > 0 && gap <= onlineGapSeconds * 1000) {
        c.gameTime += gap * onlineTimeScale * (c.speed ?? 1);
        c.onlineMs += gap;
    } else if (gap > 0) {
        offlineMs = Math.max(0, realNow - c.maxRealAt);
    }
    c.lastRealAt = realNow;
    c.maxRealAt = Math.max(c.maxRealAt, realNow);
    return { gameNow: c.gameTime, offlineMs };
}

/** 游戏时间的毫秒数换算成在线的真实秒数（界面倒计时用） */
export function realSeconds(config: GameConfig, gameMs: number): number {
    return Math.max(0, Math.ceil(gameMs / config.balance.clock.onlineTimeScale / 1000));
}

/**
 * 现在几点（给界面显示）：尸潮在晚上 22:00 来，按“离下一次尸潮还有多久”倒推时钟；
 * 尸潮还没开始时按天的进度算（一天结束是 22:00）。nightInMs = 离入夜还有多少游戏毫秒（没有尸潮安排时为 null）。
 */
export function timeOfDay(config: GameConfig, state: GameState, now: number): { hour: number; minute: number; nightInMs: number | null } {
    const interval = config.balance.raidIntervalMinutes * 60_000;
    const dayMs = config.balance.dayLengthMinutes * 60_000;
    const scheduled = state.nextRaidAt - now <= interval * 1.5 && state.nextRaidAt > now - interval;
    let fraction: number;
    let nightInMs: number | null = null;
    if (scheduled) {
        const remaining = Math.max(0, Math.min(interval, state.nextRaidAt - now));
        fraction = 1 - remaining / interval;
        nightInMs = remaining;
    } else {
        fraction = (((now - state.createdAt) % dayMs) + dayMs) % dayMs / dayMs;
    }
    const minutes = Math.floor((22 * 60 + fraction * 24 * 60) % (24 * 60));
    return { hour: Math.floor(minutes / 60), minute: minutes % 60, nightInMs };
}
