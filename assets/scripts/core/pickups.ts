// 路边拾荒：营地附近时不时出现补给箱、废铁堆、落单的行尸……点一下就能捡走。
// 按游戏时间刷新（只在在线时出现），没人捡一段时间后消失。奖励随指挥部等级成长。

import { formatBag } from './combat';
import { formatProps, rollDrops } from './props';
import { grantResources, hqLevel } from './economy';
import { nextRandom, pickWeighted } from './rng';
import { addLog, addStat } from './state';
import { ActionResult, GameConfig, GameState, PickupKindDef, PickupState, RESOURCE_IDS, ResourceBag } from './types';

export function pickupKind(config: GameConfig, id: string): PickupKindDef | undefined {
    return config.pickups.kinds.find((k) => k.id === id);
}

/** 现在能捡的东西（没到期的） */
export function activePickups(state: GameState, now: number): PickupState[] {
    return (state.pickups ?? []).filter((p) => p.expiresAt > now);
}

/** 实际奖励：基础奖励 × 探索战利品的成长倍率 */
export function pickupReward(config: GameConfig, state: GameState, kind: PickupKindDef): ResourceBag {
    const mult = Math.pow(config.balance.expeditionScaling.lootGrowth, hqLevel(state) - 1);
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) {
        const base = kind.reward[id];
        if (base) out[id] = id === 'cans' ? base : Math.round(base * mult);
    }
    return out;
}

function nextInterval(config: GameConfig, state: GameState): number {
    return config.pickups.intervalMinutes * (0.5 + nextRandom(state)) * 60_000;
}

/** 推进到 now：清掉过期的，按间隔刷出新的 */
export function updatePickups(config: GameConfig, state: GameState, now: number): void {
    const cfg = config.pickups;
    if (cfg.kinds.length === 0 || state.gameOver) return;
    state.pickups = activePickups(state, now);
    let next = state.nextPickupAt ?? now + nextInterval(config, state);
    // 离开很久（测试里一次跳很远）也最多补满，不会一次刷一大堆
    let guard = 0;
    while (next <= now && guard++ < cfg.maxActive * 2) {
        const at = next;
        next = at + nextInterval(config, state);
        if (state.pickups.length >= cfg.maxActive) continue;
        const kind = pickWeighted(state, cfg.kinds);
        const expiresAt = at + cfg.lifetimeMinutes * 60_000;
        if (kind && expiresAt > now) state.pickups.push({ id: state.nextId++, kind: kind.id, expiresAt });
    }
    state.nextPickupAt = next <= now ? now + nextInterval(config, state) : next;
}

export interface PickupResult {
    ok: boolean;
    reason?: string;
    text?: string;
    gained?: ResourceBag;
    /** 顺便捡到的道具，比如“🔧扳手” */
    found?: string;
}

export function collectPickup(config: GameConfig, state: GameState, pickupId: number, now: number): PickupResult & ActionResult {
    const p = activePickups(state, now).find((x) => x.id === pickupId);
    const kind = p && pickupKind(config, p.kind);
    if (!p || !kind) return { ok: false, reason: '已经没了' };
    state.pickups = (state.pickups ?? []).filter((x) => x !== p);
    const gained = grantResources(config, state, pickupReward(config, state, kind));
    addStat(state, 'pickups_collected');
    if (kind.kill) {
        addStat(state, 'zombies_killed');
        addStat(state, 'kill_walker');
    }
    const found = formatProps(config, rollDrops(state, kind.drops));
    addLog(state, now, `${kind.icon}${kind.text}${formatBag(config, gained) ? `（${formatBag(config, gained)}）` : ''}${found ? `还捡到了${found}。` : ''}`);
    return { ok: true, text: kind.text, gained, found };
}
