// 工坊合成：用资源做燃烧瓶、急救包等消耗品。
// 战斗时自动分给上阵的人带着，只有在战斗里真的用掉了才扣库存。

import { Battle, UnitSetup } from './battle/Battle';
import { canAfford, pay } from './economy';
import { addLog, addStat } from './state';
import { ActionResult, GameConfig, GameState, ItemDef } from './types';

export function workshopLevel(config: GameConfig, state: GameState): number {
    let level = 0;
    for (const def of config.buildings) {
        const lv = state.buildings[def.id]?.level ?? 0;
        if (lv > 0) level += def.levels[lv - 1].workshopLevel ?? 0;
    }
    return level;
}

export function getItem(config: GameConfig, id: string): ItemDef | undefined {
    return config.items.find((i) => i.id === id);
}

export function itemCount(state: GameState, id: string): number {
    return state.items[id] ?? 0;
}

/** 检查能否制作；返回 null 表示可以 */
export function craftBlocker(config: GameConfig, state: GameState, itemId: string): string | null {
    const item = getItem(config, itemId);
    if (!item) return '没有这种物品';
    const level = workshopLevel(config, state);
    if (level <= 0) return '需要先建造工坊';
    if (level < item.workshopLevel) return `需要工坊 ${item.workshopLevel} 级`;
    if (!canAfford(state, item.cost)) return '资源不足';
    return null;
}

export function craftItem(config: GameConfig, state: GameState, itemId: string, now: number): ActionResult {
    const blocker = craftBlocker(config, state, itemId);
    if (blocker) return { ok: false, reason: blocker };
    const item = getItem(config, itemId)!;
    pay(state, item.cost);
    state.items[itemId] = itemCount(state, itemId) + 1;
    addStat(state, 'items_crafted');
    addStat(state, `craft_${itemId}`);
    addLog(state, now, `工坊做好了一个${item.name}。`);
    return { ok: true };
}

/** 陷阱装在栅栏上（和 combat.ts 的 BARRICADE_UNIT 一致） */
const TRAP_HOLDER = 'barricade';

export interface CarriedItem {
    tag: string;
    item: ItemDef;
}

/**
 * 给上阵的人分配物品：每种有库存的物品带一个，依次分给不同的人；陷阱每种一个装在栅栏上（没有栅栏就不带）。
 * 直接修改 setups 的 extraSkills，返回谁带了什么，战后用来结算消耗。
 */
export function equipItems(config: GameConfig, state: GameState, setups: UnitSetup[]): CarriedItem[] {
    // 只有幸存者会带物品（栅栏、狗也有 tag，但不算）
    const carriers = setups.filter((s) => s.tag && state.survivors.some((x) => x.id === s.tag));
    const wall = setups.find((s) => s.tag === TRAP_HOLDER);
    const carried: CarriedItem[] = [];
    let handed = 0;
    for (const item of config.items) {
        if (itemCount(state, item.id) <= 0) continue;
        const carrier = item.trap ? wall : carriers.length ? carriers[handed++ % carriers.length] : undefined;
        if (!carrier) continue;
        carrier.extraSkills = [...(carrier.extraSkills ?? []), item.battleSkill];
        carried.push({ tag: carrier.tag!, item });
    }
    return carried;
}

/** 战后结算：携带者在战斗中放出了物品技能，就扣掉一个库存 */
export function consumeUsedItems(state: GameState, battle: Battle, carried: CarriedItem[]): string[] {
    const used: string[] = [];
    for (const { tag, item } of carried) {
        const unit = battle.units.find((u) => u.tag === tag);
        const cast = unit && battle.events.some((e) => e.type === 'skill' && e.source === unit.uid && e.skill === item.battleSkill);
        if (!cast) continue;
        state.items[item.id] = Math.max(0, itemCount(state, item.id) - 1);
        addStat(state, `use_${item.id}`);
        used.push(item.name);
    }
    return used;
}
