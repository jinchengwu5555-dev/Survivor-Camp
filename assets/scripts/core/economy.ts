// 资源、产量、上限、士气等数值计算。

import {
    BuildingDef,
    BuildingLevelDef,
    GameConfig,
    GameState,
    RESOURCE_IDS,
    ResourceBag,
    ResourceId,
    SurvivorState,
} from './types';
import { seasonAt } from './seasons';

export function getBuildingDef(config: GameConfig, id: string): BuildingDef | undefined {
    return config.buildings.find((b) => b.id === id);
}

/** 建筑当前等级的数值；未建造返回 undefined */
export function currentLevelDef(config: GameConfig, state: GameState, id: string): BuildingLevelDef | undefined {
    const def = getBuildingDef(config, id);
    const level = state.buildings[id]?.level ?? 0;
    if (!def || level <= 0) return undefined;
    return def.levels[level - 1];
}

export function hqLevel(state: GameState): number {
    return state.buildings['hq']?.level ?? 0;
}

function sumOverBuildings(config: GameConfig, state: GameState, pick: (lv: BuildingLevelDef) => number | undefined): number {
    let total = 0;
    for (const def of config.buildings) {
        const lv = currentLevelDef(config, state, def.id);
        if (lv) total += pick(lv) ?? 0;
    }
    return total;
}

export function storageCap(config: GameConfig, state: GameState, resource: ResourceId): number {
    const base = config.balance.baseStorage[resource];
    if (base === undefined) return Infinity;
    return base + sumOverBuildings(config, state, (lv) => lv.storage?.[resource]);
}

export function bedCount(config: GameConfig, state: GameState): number {
    return sumOverBuildings(config, state, (lv) => lv.beds);
}

export function safety(config: GameConfig, state: GameState): number {
    return sumOverBuildings(config, state, (lv) => lv.safety);
}

/** 幸存者的战斗等级 = 1 + 训练场等建筑提供的加成 */
export function survivorBattleLevel(config: GameConfig, state: GameState): number {
    return 1 + sumOverBuildings(config, state, (lv) => lv.battleLevel);
}

export function workerSlots(config: GameConfig, state: GameState, buildingId: string): number {
    return currentLevelDef(config, state, buildingId)?.workerSlots ?? 0;
}

/** 士气 = 所有幸存者心情的平均值 */
export function morale(state: GameState): number {
    if (state.survivors.length === 0) return 0;
    return state.survivors.reduce((sum, s) => sum + s.mood, 0) / state.survivors.length;
}

/** 士气 50 时产量正常；0 时 75%；100 时 125%。设下限是为了避免“挨饿 → 士气低 → 产量低 → 更饿”的死循环 */
export function moraleMultiplier(state: GameState): number {
    return 0.75 + morale(state) / 200;
}

export function survivorEfficiency(config: GameConfig, survivor: SurvivorState, building: BuildingDef): number {
    if (survivor.injured) return 0;
    const def = config.survivors.find((d) => d.id === survivor.id);
    return def && building.specialty && def.specialty === building.specialty ? config.balance.specialtyBonus : 1;
}

/** 每分钟产量（不含消耗） */
export function productionPerMinute(config: GameConfig, state: GameState): Record<ResourceId, number> {
    const rates = emptyBag();
    const mult = moraleMultiplier(state);
    for (const survivor of state.survivors) {
        if (!survivor.assignment) continue;
        const building = getBuildingDef(config, survivor.assignment);
        const lv = currentLevelDef(config, state, survivor.assignment);
        if (!building || !lv?.production) continue;
        const eff = survivorEfficiency(config, survivor, building) * mult;
        for (const id of RESOURCE_IDS) rates[id] += (lv.production[id] ?? 0) * eff;
    }
    return rates;
}

export function foodConsumptionPerMinute(config: GameConfig, state: GameState): number {
    return state.survivors.length * config.balance.foodPerSurvivorPerMinute;
}

export function emptyBag(): Record<ResourceId, number> {
    return { food: 0, wood: 0, parts: 0, medicine: 0, cans: 0 };
}

export function canAfford(state: GameState, cost: ResourceBag | undefined): boolean {
    if (!cost) return true;
    return RESOURCE_IDS.every((id) => state.resources[id] >= (cost[id] ?? 0));
}

export function pay(state: GameState, cost: ResourceBag | undefined): void {
    if (!cost) return;
    for (const id of RESOURCE_IDS) state.resources[id] -= cost[id] ?? 0;
}

export function addResource(config: GameConfig, state: GameState, id: ResourceId, amount: number): void {
    const next = state.resources[id] + amount;
    state.resources[id] = Math.max(0, Math.min(storageCap(config, state, id), next));
}

/** 发放资源，返回实际到手的数量（仓库满了会少拿） */
export function grantResources(config: GameConfig, state: GameState, bag: ResourceBag): ResourceBag {
    const gained: ResourceBag = {};
    for (const id of RESOURCE_IDS) {
        const amount = bag[id];
        if (!amount) continue;
        const before = state.resources[id];
        addResource(config, state, id, amount);
        // 库存带小数（腐烂按比例扣），相减会有浮点误差，四舍五入到整数
        const got = Math.round(state.resources[id] - before);
        if (got > 0) gained[id] = got;
    }
    return gained;
}

export interface EconomyRates {
    /** 每分钟的净变化（已扣除吃饭、腐烂、取暖） */
    net: Record<ResourceId, number>;
    /** 每分钟腐烂掉的食物 */
    spoil: number;
    /** 每分钟烧掉的取暖木材 */
    heating: number;
}

/** 腐烂速度降低的比例，最多 90% */
export function spoilReduction(config: GameConfig, state: GameState): number {
    return Math.min(0.9, sumOverBuildings(config, state, (lv) => lv.spoilReduction));
}

/** now 所在季节下，每分钟各项资源的变化 */
export function economyRates(config: GameConfig, state: GameState, now: number): EconomyRates {
    const { season } = seasonAt(config, state, now);
    const net = productionPerMinute(config, state);
    net.food *= season.foodProduction;
    const spoil = state.resources.food * config.balance.foodSpoilPerMinute * season.spoilMultiplier * (1 - spoilReduction(config, state));
    const heating = state.survivors.length * season.heatingWoodPerSurvivorPerMinute;
    net.food -= foodConsumptionPerMinute(config, state) + spoil;
    net.wood -= heating;
    return { net, spoil, heating };
}

/** 净变化为负时，资源多久耗尽；返回在 minutes 里有多少分钟处于“耗尽”状态 */
function minutesWithout(amount: number, rate: number, minutes: number): number {
    if (rate >= 0) return 0;
    return Math.max(0, minutes - amount / -rate);
}

/**
 * 推进 minutes 分钟的生产、吃饭、腐烂、取暖和心情变化（按 now 所在的季节计算）。
 * 如果中途食物吃光 / 木材烧光，只有耗尽之后的那段时间算挨饿 / 受冻。
 */
export function advanceEconomy(config: GameConfig, state: GameState, minutes: number, now: number): void {
    if (minutes <= 0) return;
    const b = config.balance;
    const { net, heating } = economyRates(config, state, now);

    const starvingMinutes = minutesWithout(state.resources.food, net.food, minutes);
    const freezingMinutes = heating > 0 ? minutesWithout(state.resources.wood, net.wood, minutes) : 0;
    for (const id of RESOURCE_IDS) addResource(config, state, id, net[id] * minutes);

    const fedMinutes = minutes - starvingMinutes;
    for (const s of state.survivors) {
        if (s.mood < b.moodRecoveryMax) {
            s.mood = Math.min(b.moodRecoveryMax, s.mood + b.moodRecoveryPerMinute * fedMinutes);
        }
        s.mood = clampMood(s.mood - b.hungerMoodPenaltyPerMinute * starvingMinutes - b.coldMoodPenaltyPerMinute * freezingMinutes);
    }
}

export function clampMood(mood: number): number {
    return Math.max(0, Math.min(100, mood));
}
