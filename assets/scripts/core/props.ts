// 背包道具：资源箱、建造加速、召回对讲机、咖啡、医疗包、招募传单、神秘补给箱……
// 种子（种进菜园）、一笼小鸡（放进畜栏）……
// 探索、守夜、拾荒、每日宝箱、商人、事件都会掉落。道具定义在 props.json。

import { completeUpgrades } from './buildings';
import { finishExpeditionNow, formatBag } from './combat';
import { grantResources, hqLevel } from './economy';
import { addAnimals, animalBlocker, animalDef, cropOfSeed, plant, plantBlocker } from './farming';
import { fireFlare, flareBlocker } from './familiar';
import { changeMoodAll } from './mood';
import { traderPresent } from './trader';
import { nextRandom, pickWeighted } from './rng';
import { addWanderer } from './roster';
import { addLog, addStat, healSurvivorState } from './state';
import { ActionResult, GameConfig, GameState, PropDef, PropDrop, RESOURCE_IDS, ResourceBag } from './types';

export function propDef(config: GameConfig, id: string): PropDef | undefined {
    return config.props.find((p) => p.id === id);
}

export function propCount(state: GameState, id: string): number {
    return state.props?.[id] ?? 0;
}

export function addProp(state: GameState, id: string, amount = 1): void {
    if (amount <= 0) return;
    state.props = state.props ?? {};
    state.props[id] = propCount(state, id) + amount;
}

/** 按掉落表掷骰子，得到的道具放进背包（keep = false 时只掷骰子不放），返回得到了什么（道具 id → 数量） */
export function rollDrops(state: GameState, drops: PropDrop[] | undefined, keep = true): Record<string, number> {
    const got: Record<string, number> = {};
    for (const d of drops ?? []) {
        if (nextRandom(state) >= (d.chance ?? 1)) continue;
        const n = d.amount ?? 1;
        if (keep) addProp(state, d.prop, n);
        got[d.prop] = (got[d.prop] ?? 0) + n;
    }
    return got;
}

/** 比如“📦一箱口粮 ×2、🔧扳手” */
export function formatProps(config: GameConfig, props: Record<string, number>): string {
    return Object.entries(props)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => {
            const def = propDef(config, id);
            return `${def?.icon ?? ''}${def?.name ?? id}${n > 1 ? ` ×${n}` : ''}`;
        })
        .join('、');
}

/**
 * 资源箱的实际内容：随指挥部等级成长，但只按探索战利品倍率的一半指数成长（罐头不成长）。
 * 前期很解渴，后期只是锦上添花，不会冲淡无尽尸潮的压力。
 */
export function propReward(config: GameConfig, state: GameState, def: PropDef): ResourceBag {
    const growth = Math.pow(config.balance.expeditionScaling.lootGrowth, (hqLevel(state) - 1) / 2);
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) {
        const base = def.reward?.[id];
        if (base) out[id] = id === 'cans' ? base : Math.round(base * growth);
    }
    return out;
}

/** 稀有品（出大红）卖掉能换多少：随指挥部成长，商人在营地时更贵 */
export function treasureValue(config: GameConfig, state: GameState, def: PropDef, now: number): ResourceBag {
    const base = propReward(config, state, def);
    const mult = traderPresent(state, now) ? config.trader.treasureBonus ?? 1 : 1;
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) if (base[id]) out[id] = Math.round(base[id]! * mult);
    return out;
}

/** 现在能不能用；返回 null 表示可以 */
export function propBlocker(config: GameConfig, state: GameState, id: string, now = state.lastTickAt): string | null {
    const def = propDef(config, id);
    if (!def) return '没有这个道具';
    if (propCount(state, id) <= 0) return '背包里没有了';
    switch (def.type) {
        case 'speedup':
            return Object.values(state.buildings).some((b) => b.upgradeEndsAt !== null) ? null : '没有正在升级的建筑';
        case 'recall':
            return state.expeditions.length > 0 ? null : '没有在外面的小队';
        case 'heal':
            return state.survivors.some((s) => s.injured) ? null : '没有伤员';
        case 'gear':
            return '装备要在幸存者档案里给人穿上';
        case 'flare':
            return flareBlocker(config, state);
        case 'seed':
            return plantBlocker(config, state, cropOfSeed(config, id)?.id ?? '', now);
        case 'animal':
            return animalBlocker(config, state, def.animal ?? '');
        default:
            return null;
    }
}

/** 使用一个道具 */
export function useProp(config: GameConfig, state: GameState, id: string, now: number): ActionResult {
    const blocker = propBlocker(config, state, id, now);
    if (blocker) return { ok: false, reason: blocker };
    const def = propDef(config, id)!;
    state.props![id] -= 1;
    addStat(state, 'props_used');
    let message = '';
    switch (def.type) {
        case 'resource': {
            const got = grantResources(config, state, propReward(config, state, def));
            message = formatBag(config, got) ? `获得 ${formatBag(config, got)}` : '仓库满了，东西没地方放';
            break;
        }
        case 'speedup': {
            const b = Object.values(state.buildings).find((x) => x.upgradeEndsAt !== null)!;
            b.upgradeEndsAt = Math.max(now, b.upgradeEndsAt! - (def.minutes ?? 0) * 60_000);
            completeUpgrades(config, state, now);
            message = b.upgradeEndsAt === null ? '升级完成了！' : '升级加快了';
            break;
        }
        case 'recall':
            finishExpeditionNow(config, state, state.expeditions[0].id, now);
            message = '小队回来了';
            break;
        case 'mood':
            changeMoodAll(state, def.amount ?? 0, `分享了${def.name}`, now);
            message = `所有人心情 +${def.amount ?? 0}`;
            break;
        case 'heal':
            for (const s of state.survivors) if (s.injured) healSurvivorState(s);
            message = '伤员都治好了';
            break;
        case 'recruit': {
            const w = addWanderer(config, state, now);
            if (!w) {
                state.props![id] += 1;
                return { ok: false, reason: '没有空床位了' };
            }
            message = `${w.profile?.name ?? '一个流浪者'}来投奔了`;
            break;
        }
        case 'flare': {
            const r = fireFlare(config, state, now);
            if (!r.ok) return r;
            message = r.message ?? '';
            break;
        }
        case 'treasure': {
            const got = grantResources(config, state, treasureValue(config, state, def, now));
            message = `卖了个好价钱：${formatBag(config, got)}`;
            addStat(state, 'treasures_sold');
            break;
        }
        case 'seed': {
            state.props![id] += 1; // plant 自己会扣种子
            const r = plant(config, state, cropOfSeed(config, id)!.id, now);
            if (!r.ok) return r;
            message = r.message ?? '种下了';
            break;
        }
        case 'animal': {
            const n = addAnimals(config, state, def.animal ?? '', def.amount ?? 1, now);
            const a = animalDef(config, def.animal ?? '');
            message = `${n} 只${a?.name ?? '牲口'}进了${a?.space === 'pond' ? '鱼塘' : '畜栏'}`;
            break;
        }
        case 'chest': {
            const pick = pickWeighted(state, def.contents ?? []);
            if (pick?.prop) {
                addProp(state, pick.prop, pick.amount ?? 1);
                message = `开出了 ${formatProps(config, { [pick.prop]: pick.amount ?? 1 })}`;
            } else if (pick?.resources) {
                message = `开出了 ${formatBag(config, grantResources(config, state, pick.resources))}`;
            }
            break;
        }
    }
    addLog(state, now, `使用了${def.icon}${def.name}：${message}。`);
    return { ok: true, message };
}
