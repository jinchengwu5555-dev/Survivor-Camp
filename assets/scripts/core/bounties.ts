// 悬赏板：接取悬赏 → 在探索 / 守夜中完成目标 → 领取奖励和猎人经验，猎人等级越高能接的悬赏越难。
// 悬赏目标用统计数据表示：接取时记下当前值，之后再增加 goal.amount 就算完成。

import { conditionMet } from './events';
import { formatBag } from './combat';
import { grantResources } from './economy';
import { addLog, addStat, getStat } from './state';
import { ActionResult, BountyDef, GameConfig, GameState } from './types';

export function getBounty(config: GameConfig, id: string): BountyDef | undefined {
    return config.bounties.find((b) => b.id === id);
}

/** 当前猎人等级（hunterRanks 的下标） */
export function hunterRank(config: GameConfig, state: GameState): number {
    let rank = 0;
    config.balance.hunterRanks.forEach((r, i) => {
        if (state.hunterXp >= r.xp) rank = i;
    });
    return rank;
}

export function hunterRankName(config: GameConfig, state: GameState): string {
    return config.balance.hunterRanks[hunterRank(config, state)]?.name ?? '';
}

/** 悬赏板上可以接的悬赏 */
export function availableBounties(config: GameConfig, state: GameState, now: number): BountyDef[] {
    const rank = hunterRank(config, state);
    return config.bounties.filter(
        (b) =>
            b.rank <= rank &&
            !state.bounties.completed.includes(b.id) &&
            !state.bounties.active.some((a) => a.id === b.id) &&
            conditionMet(config, state, b.conditions, now),
    );
}

export function bountyProgress(config: GameConfig, state: GameState, id: string): { current: number; target: number } {
    const def = getBounty(config, id);
    const active = state.bounties.active.find((a) => a.id === id);
    if (!def || !active) return { current: 0, target: 0 };
    return { current: Math.min(def.goal.amount, getStat(state, def.goal.stat) - active.baseline), target: def.goal.amount };
}

export function acceptBounty(config: GameConfig, state: GameState, id: string, now: number): ActionResult {
    const def = getBounty(config, id);
    if (!def) return { ok: false, reason: '没有这个悬赏' };
    if (!availableBounties(config, state, now).includes(def)) return { ok: false, reason: '现在不能接这个悬赏' };
    if (state.bounties.active.length >= config.balance.maxActiveBounties) {
        return { ok: false, reason: `最多同时接 ${config.balance.maxActiveBounties} 个悬赏` };
    }
    state.bounties.active.push({ id, baseline: getStat(state, def.goal.stat) });
    addLog(state, now, `接下了悬赏「${def.title}」。`);
    return { ok: true };
}

export function abandonBounty(state: GameState, id: string): ActionResult {
    const before = state.bounties.active.length;
    state.bounties.active = state.bounties.active.filter((a) => a.id !== id);
    return state.bounties.active.length < before ? { ok: true } : { ok: false, reason: '没有接这个悬赏' };
}

export function claimBounty(config: GameConfig, state: GameState, id: string, now: number): ActionResult {
    const def = getBounty(config, id);
    if (!def || !state.bounties.active.some((a) => a.id === id)) return { ok: false, reason: '没有接这个悬赏' };
    const { current, target } = bountyProgress(config, state, id);
    if (current < target) return { ok: false, reason: `还没完成（${current}/${target}）` };

    const rankBefore = hunterRank(config, state);
    state.bounties.active = state.bounties.active.filter((a) => a.id !== id);
    state.bounties.completed.push(id);
    state.hunterXp += def.xp;
    addStat(state, 'bounties_completed');
    const got = grantResources(config, state, def.reward);
    addLog(state, now, `悬赏「${def.title}」完成！获得 ${formatBag(config, got) || '一些物资'}，猎人经验 +${def.xp}。`);
    if (hunterRank(config, state) > rankBefore) addLog(state, now, `猎人等级提升为「${hunterRankName(config, state)}」！`);
    return { ok: true };
}
