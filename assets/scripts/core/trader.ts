// 流浪商人（资料库 R07）：第 2 天起定期开着破皮卡来营地，以物易物。
// 每次来摆几笔随机交易，换到的数量上下浮动（有时划算，有时不划算），待一阵子就走。
// 看激励视频可以刷新一次货架。数量随指挥部等级按探索战利品的倍率成长（罐头不成长）。

import { canAfford, grantResources, hqLevel, pay } from './economy';
import { formatBag } from './combat';
import { nextRandom, pickWeighted } from './rng';
import { addLog, addStat } from './state';
import { ActionResult, GameConfig, GameState, RESOURCE_IDS, ResourceBag, TraderState } from './types';

/** 商人现在在不在营地 */
export function traderPresent(state: GameState, now: number): boolean {
    const t = state.trader;
    return !!t && t.leavesAt !== null && now < t.leavesAt;
}

function scale(config: GameConfig, state: GameState, bag: ResourceBag, jitter: number): ResourceBag {
    const growth = Math.pow(config.balance.expeditionScaling.lootGrowth, hqLevel(state) - 1);
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) {
        const base = bag[id];
        if (!base) continue;
        out[id] = Math.max(1, Math.round(base * (id === 'cans' ? 1 : growth) * jitter));
    }
    return out;
}

function rollOffers(config: GameConfig, state: GameState): TraderState['offers'] {
    const cfg = config.trader;
    const pool = [...cfg.offers];
    const offers: TraderState['offers'] = [];
    while (offers.length < cfg.offersPerVisit && pool.length > 0) {
        const def = pickWeighted(state, pool)!;
        pool.splice(pool.indexOf(def), 1);
        const jitter = 1 + (nextRandom(state) * 2 - 1) * cfg.priceJitter;
        offers.push({ id: def.id, give: scale(config, state, def.give, 1), get: scale(config, state, def.get, jitter), bought: false });
    }
    return offers;
}

/** 推进到 now：到时间就来，待够了就走 */
export function updateTrader(config: GameConfig, state: GameState, now: number): void {
    const cfg = config.trader;
    if (cfg.offers.length === 0 || state.gameOver) return;
    if (!state.trader) {
        const dayMs = config.balance.dayLengthMinutes * 60_000;
        state.trader = { nextVisitAt: state.createdAt + (cfg.firstDay - 1) * dayMs, leavesAt: null, visit: 0, offers: [], refreshesLeft: 0 };
    }
    const t = state.trader;
    if (t.leavesAt !== null && now >= t.leavesAt) {
        t.leavesAt = null;
        t.offers = [];
        addLog(state, now, '流浪商人开着皮卡走了。');
    }
    if (t.leavesAt === null && now >= t.nextVisitAt) {
        // 离开很久才回来：商人按现在的时间来，不补以前错过的
        t.leavesAt = now + cfg.stayMinutes * 60_000;
        t.nextVisitAt = t.leavesAt + cfg.intervalMinutes * 60_000;
        t.visit += 1;
        t.offers = rollOffers(config, state);
        t.refreshesLeft = cfg.refreshesPerVisit;
        addLog(state, now, '🚚 一辆破皮卡停在了营地门口——流浪商人来了，想换点东西。');
    }
}

export function trade(config: GameConfig, state: GameState, index: number, now: number): ActionResult {
    if (!traderPresent(state, now)) return { ok: false, reason: '商人已经走了' };
    const offer = state.trader!.offers[index];
    if (!offer) return { ok: false, reason: '没有这笔交易' };
    if (offer.bought) return { ok: false, reason: '已经换过了' };
    if (!canAfford(state, offer.give)) return { ok: false, reason: '东西不够换' };
    pay(state, offer.give);
    const got = grantResources(config, state, offer.get);
    offer.bought = true;
    addStat(state, 'trades');
    addLog(state, now, `和商人用 ${formatBag(config, offer.give)} 换了 ${formatBag(config, got) || '（仓库满了，没拿到）'}。`);
    return { ok: true, message: formatBag(config, got) };
}

/** 看完激励视频后调用：重新摆一批货 */
export function refreshTraderOffers(config: GameConfig, state: GameState, now: number): ActionResult {
    if (!traderPresent(state, now)) return { ok: false, reason: '商人已经走了' };
    const t = state.trader!;
    if (t.refreshesLeft <= 0) return { ok: false, reason: '这次已经刷新过了' };
    t.refreshesLeft -= 1;
    t.offers = rollOffers(config, state);
    return { ok: true };
}
