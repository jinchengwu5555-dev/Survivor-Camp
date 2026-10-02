// 交通工具：决定能去多远的分区（tier）、探索背包有多大（grid、cargo）、路上多快（speed）。
// 摩托、皮卡、货车每趟要烧汽油（背包道具 gasoline）。一辆车同一时间只能跟一支队伍出去。
// 来源：开局就有（托比的自行车）、某人加入时自带（老乔的皮卡）、在工坊自己修（obtain）。

import { workshopLevel } from './crafting';
import { canAfford, hqLevel, pay } from './economy';
import { propCount } from './props';
import { addLog, addStat } from './state';
import { ActionResult, GameConfig, GameState, HaulSection, VehicleDef } from './types';
import { survivorName } from './roster';
import { carryBonus } from './formation';

export const FUEL_PROP = 'gasoline';
export const TIER_NAMES = ['走路', '自行车', '摩托 / 皮卡', '货车'];

export function vehicleDef(config: GameConfig, id: string | undefined): VehicleDef | undefined {
    return id ? (config.vehicles ?? []).find((v) => v.id === id) : undefined;
}

/** 拥有的车（老存档第一次用到时补上开局的车） */
export function ownedVehicles(config: GameConfig, state: GameState): VehicleDef[] {
    if (!state.vehicles) state.vehicles = (config.vehicles ?? []).filter((v) => v.startOwned).map((v) => v.id);
    return state.vehicles.flatMap((id) => vehicleDef(config, id) ?? []);
}

/** 正在外面的车 */
export function vehicleBusy(state: GameState, id: string): boolean {
    return state.expeditions.some((e) => e.vehicle === id) || (state.surveys ?? []).some((s) => s.vehicle === id);
}

/** 这辆车现在能不能开出去；返回 null 表示可以 */
export function vehicleBlocker(state: GameState, v: VehicleDef): string | null {
    if (vehicleBusy(state, v.id)) return '车已经开出去了';
    if (v.fuel > 0 && propCount(state, FUEL_PROP) < v.fuel) return `没有汽油（要 ${v.fuel} 桶）`;
    return null;
}

/** 能开出去的车里，能到 tier 的、最好的一辆（背包最大的）；都不行返回 undefined */
export function bestVehicle(config: GameConfig, state: GameState, tier: number): VehicleDef | undefined {
    return ownedVehicles(config, state)
        .filter((v) => v.tier >= tier && vehicleBlocker(state, v) === null)
        .sort((a, b) => b.grid[0] * b.grid[1] - a.grid[0] * a.grid[1] || a.fuel - b.fuel)[0];
}

/** 拥有的车里最远能到哪一级（不管有没有油） */
export function maxTierOwned(config: GameConfig, state: GameState): number {
    return ownedVehicles(config, state).reduce((m, v) => Math.max(m, v.tier), 0);
}

/**
 * 出发时决定开哪辆车：指定了就用指定的（'walk' = 走路），没指定就挑能到的最好的一辆。
 * 返回车（走路为 undefined）或者不能出发的原因。
 */
export function pickVehicle(
    config: GameConfig,
    state: GameState,
    tier: number,
    wanted?: string,
): { vehicle?: VehicleDef; blocker?: string } {
    if (wanted === 'walk') return tier > 0 ? { blocker: `太远了，要${TIER_NAMES[tier]}才能去` } : {};
    if (wanted) {
        const v = ownedVehicles(config, state).find((x) => x.id === wanted);
        if (!v) return { blocker: '没有这辆车' };
        if (v.tier < tier) return { blocker: `${v.name}到不了那么远` };
        const b = vehicleBlocker(state, v);
        return b ? { blocker: `${v.name}${b}` } : { vehicle: v };
    }
    const v = bestVehicle(config, state, tier);
    if (v) return { vehicle: v };
    if (tier === 0) return {};
    return { blocker: maxTierOwned(config, state) >= tier ? '能去那里的车都开出去了，或者没有汽油' : `太远了，要${TIER_NAMES[tier]}才能去` };
}

/** 出发：烧掉汽油 */
export function useVehicle(state: GameState, v: VehicleDef | undefined): void {
    if (v && v.fuel > 0) state.props![FUEL_PROP] = propCount(state, FUEL_PROP) - v.fuel;
}

/** 造 / 修一辆车；返回 null 表示可以 */
export function buildVehicleBlocker(config: GameConfig, state: GameState, id: string): string | null {
    const v = vehicleDef(config, id);
    if (!v?.obtain) return '这辆车不能自己造';
    if (ownedVehicles(config, state).some((x) => x.id === id)) return '已经有了';
    if (hqLevel(state) < v.obtain.hq) return `需要指挥部 ${v.obtain.hq} 级`;
    if (workshopLevel(config, state) < v.obtain.workshopLevel) return `需要工坊 ${v.obtain.workshopLevel} 级`;
    if (!canAfford(state, v.obtain.cost)) return '资源不足';
    return null;
}

export function buildVehicle(config: GameConfig, state: GameState, id: string, now: number): ActionResult {
    const blocker = buildVehicleBlocker(config, state, id);
    if (blocker) return { ok: false, reason: blocker };
    const v = vehicleDef(config, id)!;
    pay(state, v.obtain!.cost);
    ownedVehicles(config, state);
    state.vehicles!.push(id);
    addStat(state, 'vehicles_built');
    addLog(state, now, `🔧 修好了${v.icon}${v.name}！${v.description}`);
    return { ok: true, message: `${v.icon}${v.name}` };
}

/** 有人带着车加入（比如老乔和他的皮卡） */
export function checkVehicleOwners(config: GameConfig, state: GameState, now: number): void {
    for (const v of config.vehicles ?? []) {
        if (!v.comesWith || ownedVehicles(config, state).some((x) => x.id === v.id)) continue;
        if (!state.survivors.some((s) => s.id === v.comesWith)) continue;
        state.vehicles!.push(v.id);
        addLog(state, now, `${v.icon}${v.name}开进了营地！以后能开着它去更远的地方。`);
    }
}

/**
 * 这支队伍能装多少：每个人背的包（没背包就是两只手 handsGrid）各是一块或几块格子区，开车再加一块后备箱；
 * 重量 = 每人 carryPerPerson + 包多背的 + 车的 cargo。
 */
export function haulSections(config: GameConfig, state: GameState, squad: string[], v: VehicleDef | undefined): { sections: HaulSection[]; maxWeight: number } {
    const hands = config.packing?.handsGrid ?? [2, 2];
    const perPerson = config.districts?.carryPerPerson ?? 8;
    const sections: HaulSection[] = [];
    let maxWeight = 0;
    for (const id of squad) {
        const s = state.survivors.find((x) => x.id === id);
        const bagDef = s?.gear?.bag ? config.props.find((p) => p.id === s.gear!.bag) : undefined;
        const name = survivorName(config, state, id);
        if (bagDef?.bag) {
            bagDef.bag.sections.forEach(([w, h], i) => sections.push({ label: `${name}的${bagDef.name}${bagDef.bag!.sections.length > 1 ? ` ${i + 1}` : ''}`, w, h }));
            maxWeight += perPerson + bagDef.bag.carry;
        } else {
            sections.push({ label: `${name}的两只手`, w: hands[0], h: hands[1] });
            maxWeight += perPerson;
        }
    }
    if (v) {
        sections.push({ label: `${v.icon}${v.name}`, w: v.grid[0], h: v.grid[1] });
        maxWeight += v.cargo;
    }
    maxWeight += carryBonus(config, state, squad);
    return { sections, maxWeight };
}
