// 装备：武器 / 护甲 / 工具三个位置，穿在幸存者身上。
// 装备本身是背包道具（props.json 里 type = gear），穿上时从背包拿出来，脱下放回背包；
// 人死了或离开营地，身上的装备留在营地（回到背包）。
// 属性都是倍率：武器加攻击，护甲加生命，工具加某个岗位的产量或侦察速度。
// 部分装备工坊能打造（craft）。

import { canAfford, pay } from './economy';
import { workshopLevel } from './crafting';
import { addProp, propCount, propDef } from './props';
import { addLog, addStat } from './state';
import { ActionResult, GameConfig, GameState, GEAR_SLOTS, GearSlot, PropDef, SurvivorState } from './types';

export const GEAR_SLOT_NAMES: Record<GearSlot, string> = { weapon: '武器', armor: '护甲', tool: '工具' };

/** 这个人身上的装备 */
export function gearOf(config: GameConfig, state: GameState, survivorId: string): PropDef[] {
    const s = state.survivors.find((x) => x.id === survivorId);
    return GEAR_SLOTS.flatMap((slot) => {
        const def = s?.gear?.[slot] ? propDef(config, s.gear[slot]!) : undefined;
        return def ? [def] : [];
    });
}

/** 背包里的装备（可以穿的） */
export function gearInBag(config: GameConfig, state: GameState, slot?: GearSlot): PropDef[] {
    return config.props.filter((p) => p.type === 'gear' && (!slot || p.slot === slot) && propCount(state, p.id) > 0);
}

/** 装备属性写成一行，比如“攻击 +20%”“厨房产量 +20%” */
export function gearStatsText(config: GameConfig, def: PropDef): string {
    const g = def.gear ?? {};
    const pct = (m: number) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
    const parts: string[] = [];
    if (g.atk) parts.push(`攻击 ${pct(g.atk)}`);
    if (g.hp) parts.push(`生命 ${pct(g.hp)}`);
    if (g.work) {
        const b = g.work.building ? config.buildings.find((x) => x.id === g.work!.building)?.name ?? g.work.building : '所有岗位';
        parts.push(`${b}产量 ${pct(g.work.mult)}`);
    }
    if (g.scout) parts.push(`侦察快 ${Math.round((1 - g.scout) * 100)}%`);
    return parts.join('，');
}

export function equipGear(config: GameConfig, state: GameState, survivorId: string, propId: string): ActionResult {
    const s = state.survivors.find((x) => x.id === survivorId);
    const def = propDef(config, propId);
    if (!s) return { ok: false, reason: '没有这个人' };
    if (!def || def.type !== 'gear' || !def.slot) return { ok: false, reason: '这不是装备' };
    if (propCount(state, propId) <= 0) return { ok: false, reason: '背包里没有了' };
    s.gear = s.gear ?? {};
    const old = s.gear[def.slot];
    if (old) addProp(state, old, 1);
    state.props![propId] -= 1;
    s.gear[def.slot] = propId;
    addStat(state, 'gear_equipped');
    return { ok: true, message: `${def.icon}${def.name}` };
}

export function unequipGear(state: GameState, survivorId: string, slot: GearSlot): ActionResult {
    const s = state.survivors.find((x) => x.id === survivorId);
    const id = s?.gear?.[slot];
    if (!s || !id) return { ok: false, reason: '这个位置没有装备' };
    addProp(state, id, 1);
    delete s.gear![slot];
    return { ok: true };
}

/** 人离开营地时，把装备留下（放回背包） */
export function dropGear(state: GameState, s: SurvivorState): void {
    for (const slot of GEAR_SLOTS) {
        const id = s.gear?.[slot];
        if (id) addProp(state, id, 1);
    }
    s.gear = {};
}

/** 死在外面：装备掉在那个地点（state.droppedGear），下次打下那里放进战利品里 */
export function dropGearAt(state: GameState, s: SurvivorState, locationId: string): void {
    const items = GEAR_SLOTS.flatMap((slot) => (s.gear?.[slot] ? [s.gear[slot]!] : []));
    s.gear = {};
    if (items.length === 0) return;
    state.droppedGear = state.droppedGear ?? {};
    const spot = (state.droppedGear[locationId] = state.droppedGear[locationId] ?? {});
    for (const id of items) spot[id] = (spot[id] ?? 0) + 1;
}

/** 捡回掉在某个地点的装备（从 droppedGear 里拿走），返回道具 id → 数量 */
export function takeDroppedGear(state: GameState, locationId: string): Record<string, number> {
    const got = state.droppedGear?.[locationId] ?? {};
    if (state.droppedGear) delete state.droppedGear[locationId];
    return got;
}

/** 能在工坊打造的装备 */
export function craftableGear(config: GameConfig): PropDef[] {
    return config.props.filter((p) => p.type === 'gear' && p.craft);
}

export function forgeBlocker(config: GameConfig, state: GameState, propId: string): string | null {
    const def = propDef(config, propId);
    if (!def?.craft) return '不能打造';
    const level = workshopLevel(config, state);
    if (level <= 0) return '需要先建造工坊';
    if (level < def.craft.workshopLevel) return `需要工坊 ${def.craft.workshopLevel} 级`;
    if (!canAfford(state, def.craft.cost)) return '资源不足';
    return null;
}

export function forgeGear(config: GameConfig, state: GameState, propId: string, now: number): ActionResult {
    const blocker = forgeBlocker(config, state, propId);
    if (blocker) return { ok: false, reason: blocker };
    const def = propDef(config, propId)!;
    pay(state, def.craft!.cost);
    addProp(state, propId, 1);
    addStat(state, 'gear_forged');
    addLog(state, now, `工坊打造了${def.icon}${def.name}，放进了背包。`);
    return { ok: true };
}

/** 装备带来的倍率（talents.ts 的各个倍率会乘上它） */
export function gearWork(config: GameConfig, state: GameState, survivorId: string, buildingId: string): number {
    return gearOf(config, state, survivorId).reduce((m, d) => {
        const w = d.gear?.work;
        return w && (!w.building || w.building === buildingId) ? m * w.mult : m;
    }, 1);
}

export function gearCombat(config: GameConfig, state: GameState, survivorId: string): { atk: number; hp: number } {
    return gearOf(config, state, survivorId).reduce(
        (m, d) => ({ atk: m.atk * (d.gear?.atk ?? 1), hp: m.hp * (d.gear?.hp ?? 1) }),
        { atk: 1, hp: 1 },
    );
}

export function gearScout(config: GameConfig, state: GameState, survivorId: string): number {
    return gearOf(config, state, survivorId).reduce((m, d) => m * (d.gear?.scout ?? 1), 1);
}
