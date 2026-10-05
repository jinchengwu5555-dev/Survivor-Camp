// 轮流守夜 + 安静的夜晚。
// 每到晚上（maybeRunRaid 的时间点）：
//   1. 按人数排出守夜的人（balance.nightWatch.survivorsPerWatcher 个人要 1 个守夜的）：
//      “固定守夜”的人先上，其余“轮班”的人里精力最高的上，“不守夜”的人不排；受伤、在外面的人不排。
//   2. 守夜的人精力下降，其他人睡一觉恢复。精力低了干活、打仗都打折扣（talents.ts 的 sleepFactor）。
//   3. 不是每晚都有尸潮：按 raidChance 掷骰子（第一次尸潮必来）。人手不够时，尸潮来了栅栏更容易被冲破。

import { isOnExpedition } from './combat';
import { changeMood, isBrokenDown } from './mood';
import { currentDay } from './state';
import { quirkRaidChance } from './recruits';
import { nextRandom } from './rng';
import { survivorInfo, survivorName } from './roster';
import { GameConfig, GameState, SurvivorState, WatchMode } from './types';

export const WATCH_MODE_NAMES: Record<WatchMode, string> = { auto: '轮班', always: '固定守夜', never: '不守夜' };

/** 今晚需要几个人守夜 */
export function watchersNeeded(config: GameConfig, state: GameState): number {
    const per = config.balance.nightWatch?.survivorsPerWatcher ?? 4;
    return Math.max(1, Math.ceil(state.survivors.length / per));
}

function canWatch(state: GameState, s: SurvivorState): boolean {
    return !s.injured && !isBrokenDown(s) && !isOnExpedition(state, s.id) && (s.watch ?? 'auto') !== 'never';
}

/** 今晚会是谁守夜（界面预览和晚上结算用同一个规则） */
export function planWatch(config: GameConfig, state: GameState): string[] {
    const needed = watchersNeeded(config, state);
    const pool = state.survivors.filter((s) => canWatch(state, s));
    const always = pool.filter((s) => s.watch === 'always');
    // 轮班：精力高的先上；精力一样时按名单顺序
    const auto = pool.filter((s) => (s.watch ?? 'auto') === 'auto').sort((a, b) => (b.sleep ?? 100) - (a.sleep ?? 100));
    const picked = [...always];
    for (const s of auto) {
        if (picked.length >= needed) break;
        picked.push(s);
    }
    return picked.map((s) => s.id);
}

/** 今晚尸潮来的概率 */
export function raidChanceTonight(config: GameConfig, state: GameState, now: number): number {
    const c = config.balance.raidChance;
    if (!c || state.raidCount === 0) return 1;
    return Math.min(1, Math.min(c.max, c.base + c.perDay * currentDay(config, state, now)) + quirkRaidChance(config, state));
}

/** 过一夜：守夜的人累，其他人恢复；返回守夜的人和人手够不够 */
export function passNight(config: GameConfig, state: GameState, at: number): { watchers: string[]; understaffed: boolean } {
    const cfg = config.balance.nightWatch;
    const watchers = planWatch(config, state);
    if (cfg) {
        for (const s of state.survivors) {
            const sleep = s.sleep ?? 100;
            // 守卫守夜不怎么累
            const cost = survivorInfo(config, state, s.id)?.specialty === 'guard' ? cfg.watchCost / 2 : cfg.watchCost;
            s.sleep = watchers.includes(s.id) ? Math.max(0, sleep - cost) : Math.min(100, sleep + cfg.restGain);
            // 累垮了心情也会变差
            if (s.sleep < cfg.tiredBelow / 2) changeMood(state, s, -4, '守夜太累', at);
        }
    }
    const needed = watchersNeeded(config, state);
    state.lastNight = { at, watchers, needed, raid: false };
    return { watchers, understaffed: watchers.length < needed };
}

/** 掷骰子决定今晚有没有尸潮 */
export function rollRaid(config: GameConfig, state: GameState, now: number): boolean {
    const chance = raidChanceTonight(config, state, now);
    return chance >= 1 || nextRandom(state) < chance;
}

export function watchersText(config: GameConfig, state: GameState, ids: string[]): string {
    return ids.map((id) => survivorName(config, state, id)).join('、') || '没有人';
}

export function setWatchMode(state: GameState, survivorId: string, mode: WatchMode): boolean {
    const s = state.survivors.find((x) => x.id === survivorId);
    if (!s) return false;
    s.watch = mode;
    return true;
}
