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

export function workerSlots(config: GameConfig, state: GameState, buildingId: string): number {
    return currentLevelDef(config, state, buildingId)?.workerSlots ?? 0;
}

/** 士气 = 所有幸存者心情的平均值 */
export function morale(state: GameState): number {
    if (state.survivors.length === 0) return 0;
    return state.survivors.reduce((sum, s) => sum + s.mood, 0) / state.survivors.length;
}

/** 士气 50 时产量正常；0 时减半；100 时 1.5 倍 */
export function moraleMultiplier(state: GameState): number {
    return 0.5 + morale(state) / 100;
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

/**
 * 推进 minutes 分钟的生产、吃饭和心情变化。
 * 如果中途食物吃光，只有吃光之后的那段时间算挨饿。
 */
export function advanceEconomy(config: GameConfig, state: GameState, minutes: number): void {
    if (minutes <= 0) return;
    const b = config.balance;
    const rates = productionPerMinute(config, state);

    for (const id of RESOURCE_IDS) {
        if (id !== 'food') addResource(config, state, id, rates[id] * minutes);
    }

    const netFood = rates.food - foodConsumptionPerMinute(config, state);
    const food = state.resources.food;
    let starvingMinutes = 0;
    if (netFood < 0) {
        const minutesUntilEmpty = food / -netFood;
        starvingMinutes = Math.max(0, minutes - minutesUntilEmpty);
    }
    addResource(config, state, 'food', netFood * minutes);

    const fedMinutes = minutes - starvingMinutes;
    for (const s of state.survivors) {
        if (s.mood < b.moodRecoveryMax) {
            s.mood = Math.min(b.moodRecoveryMax, s.mood + b.moodRecoveryPerMinute * fedMinutes);
        }
        s.mood = clampMood(s.mood - b.hungerMoodPenaltyPerMinute * starvingMinutes);
    }
}

export function clampMood(mood: number): number {
    return Math.max(0, Math.min(100, mood));
}
