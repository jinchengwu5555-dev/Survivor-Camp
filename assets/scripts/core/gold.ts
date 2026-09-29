// 黄金：开局兜里有一点。末日刚开始时，镇上还有人认钱，可以拿黄金换物资；
// 日子越久越没人要，到 worthlessDay 就彻底没用了（balance.gold）。
// 换东西随时都能换（找附近还认钱的人），每次花 lot 两。

import { grantResources } from './economy';
import { addLog, addStat, currentDay } from './state';
import { ActionResult, GameConfig, GameState, ResourceBag, ResourceId } from './types';

/** 现在黄金值多少（0～1）：fullValueDays 天以内是 1，之后一路跌到 worthlessDay 天变成 0 */
export function goldValue(config: GameConfig, state: GameState, now: number): number {
    const g = config.balance.gold;
    if (!g) return 0;
    const day = currentDay(config, state, now);
    if (day <= g.fullValueDays) return 1;
    if (day >= g.worthlessDay) return 0;
    return 1 - (day - g.fullValueDays) / (g.worthlessDay - g.fullValueDays);
}

/** 花一次黄金（lot 两）能换到多少 */
export function goldOffer(config: GameConfig, state: GameState, resource: ResourceId, now: number): number {
    const base = config.balance.gold?.rates[resource] ?? 0;
    return Math.floor(base * goldValue(config, state, now));
}

export function goldBlocker(config: GameConfig, state: GameState, resource: ResourceId, now: number): string | null {
    const g = config.balance.gold;
    if (!g) return '没有黄金';
    if ((state.gold ?? 0) < g.lot) return `黄金不够（要 ${g.lot} 两）`;
    if (goldValue(config, state, now) <= 0) return '已经没人要黄金了';
    if (goldOffer(config, state, resource, now) <= 0) return '换不到了';
    return null;
}

/** 花 lot 两黄金换一种资源 */
export function spendGold(config: GameConfig, state: GameState, resource: ResourceId, now: number): ActionResult {
    const blocker = goldBlocker(config, state, resource, now);
    if (blocker) return { ok: false, reason: blocker };
    const g = config.balance.gold!;
    state.gold = (state.gold ?? 0) - g.lot;
    const bag: ResourceBag = { [resource]: goldOffer(config, state, resource, now) };
    const got = grantResources(config, state, bag);
    addStat(state, 'gold_spent', g.lot);
    const icon = config.resources.find((r) => r.id === resource)?.icon ?? resource;
    addLog(state, now, `💰 用 ${g.lot} 两黄金换了 ${icon}${got[resource] ?? 0}。`);
    return { ok: true, message: `${icon}${got[resource] ?? 0}` };
}
