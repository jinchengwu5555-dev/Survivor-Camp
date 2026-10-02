// 配置展开：把建筑的 scaling（成长公式）展开成完整的 levels 数组。
// 游戏启动和测试加载配置后都要先调用 expandConfig，之后所有代码只看 levels，不用关心公式。
//
// 规则（第 L 级，由最后一个手写等级 base 推算，k = L - base 的等级）：
//   花费、时间、产量、仓库、安全值：乘以 growth^k
//   床位、战斗等级、防腐：加上 perLevel × k
//   工人岗位：每 slotsEvery 级 +1；菜地：每 plotsEvery 级 +1；畜栏：每级 +pensPerLevel
//   除指挥部外，生成的等级都要求指挥部达到同样的等级（建筑不能超过指挥部）

import { BuildingDef, BuildingLevelDef, GameConfig, RESOURCE_IDS, ResourceBag } from './types';

/** 大数字取整到好看的值：两位有效数字，比如 1234 → 1200 */
export function niceRound(n: number): number {
    if (n < 100) return Math.round(n);
    const step = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / step) * step;
}

function scaleBag(bag: ResourceBag | undefined, factor: number, round: (n: number) => number): ResourceBag | undefined {
    if (!bag) return undefined;
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) if (bag[id]) out[id] = round(bag[id]! * factor);
    return out;
}

const twoDecimals = (n: number) => Math.round(n * 100) / 100;

/** 由第 baseLevel 级（最后一个手写等级）推算第 level 级 */
export function generatedLevel(def: BuildingDef, baseLevel: number, level: number): BuildingLevelDef {
    const s = def.scaling!;
    const base = def.levels[baseLevel - 1];
    const k = level - baseLevel;
    const g = (growth: number | undefined) => Math.pow(growth ?? 1, k);
    const lv: BuildingLevelDef = {
        cost: scaleBag(base.cost, g(s.costGrowth), niceRound) ?? {},
        buildSeconds: niceRound(base.buildSeconds * g(s.timeGrowth)),
    };
    if (def.id !== 'hq') lv.requiresHq = Math.max(base.requiresHq ?? 0, level);
    if (base.production) lv.production = scaleBag(base.production, g(s.productionGrowth), twoDecimals);
    if (base.storage) lv.storage = scaleBag(base.storage, g(s.storageGrowth), niceRound);
    if (base.safety !== undefined) lv.safety = Math.round(base.safety * g(s.safetyGrowth));
    if (base.beds !== undefined) lv.beds = base.beds + (s.bedsPerLevel ?? 0) * k;
    if (base.workerSlots !== undefined) lv.workerSlots = base.workerSlots + (s.slotsEvery ? Math.floor(k / s.slotsEvery) : 0);
    if (base.battleLevel !== undefined) lv.battleLevel = base.battleLevel + (s.battleLevelPerLevel ?? 0) * k;
    if (base.spoilReduction !== undefined) lv.spoilReduction = Math.min(0.9, twoDecimals(base.spoilReduction + (s.spoilPerLevel ?? 0) * k));
    if (base.workshopLevel !== undefined) lv.workshopLevel = base.workshopLevel;
    if (base.plots !== undefined) lv.plots = base.plots + (s.plotsEvery ? Math.floor(k / s.plotsEvery) : 0);
    if (base.pens !== undefined) lv.pens = base.pens + (s.pensPerLevel ?? 0) * k;
    return lv;
}

/** 展开所有建筑的等级。可以重复调用（已经展开过的不会再展开） */
export function expandConfig(config: GameConfig): GameConfig {
    for (const def of config.buildings) {
        const s = def.scaling;
        if (!s) continue;
        const handWritten = def.levels.length;
        for (let level = handWritten + 1; level <= s.maxLevel; level++) def.levels.push(generatedLevel(def, handWritten, level));
    }
    return config;
}
