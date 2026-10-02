// 种菜和养殖（farming.json）。
//
// 菜园（garden）：每级有几块菜地。用种子道具种下，过一阵成熟，收获得到食物（草药得到药品）和几颗种子，
//   所以种子能一直种下去。熟了 witherMinutes 分钟不收就烂在地里。
//   生长速度 = 季节（冬天露天种不了，温室大棚可以）× (1 + 在营地的农夫 × farmerBonus)。
// 畜栏（pen）：每级能养几只牲口。牲口来自打猎时活捉、商人、事件（animal 道具）。
//   每天换日时喂一次（从仓库扣食物）：吃饱了才下蛋 / 产奶、才会生崽；连续饿 starveDays 天就会饿死一只。
//   产出攒在畜栏里等人去收；也可以宰了吃肉；每天可以照看一次，全员心情 +petMood。
// 食物产出和打猎一样随指挥部等级成长（foodGrowth）。
// 界面模式由玩家亲手种、收；测试和模拟（liveRaids = false）由 autoFarm 自动打理。

import { addResource, currentLevelDef, hqLevel } from './economy';
import { isOnExpedition } from './combat';
import { changeMoodAll } from './mood';
import { addProp, propCount, propDef } from './props';
import { nextRandom } from './rng';
import { survivorInfo } from './roster';
import { seasonAt } from './seasons';
import { addLog, addStat, currentDay } from './state';
import { ActionResult, AnimalDef, CropDef, FarmState, GameConfig, GameState, ResourceBag, RESOURCE_IDS } from './types';

export function cropDef(config: GameConfig, id: string): CropDef | undefined {
    return config.farming?.crops.find((c) => c.id === id);
}

export function animalDef(config: GameConfig, id: string): AnimalDef | undefined {
    return config.farming?.animals.find((a) => a.id === id);
}

/** 种子道具对应的作物 */
export function cropOfSeed(config: GameConfig, seedId: string): CropDef | undefined {
    return config.farming?.crops.find((c) => c.seed === seedId);
}

/** 食物产出的成长倍率（和打猎一样跟着指挥部走） */
export function foodGrowth(config: GameConfig, state: GameState): number {
    return Math.pow(config.balance.expeditionScaling.lootGrowth, (hqLevel(state) - 1) / 2);
}

export function plotCount(config: GameConfig, state: GameState): number {
    return currentLevelDef(config, state, 'garden')?.plots ?? 0;
}

export function penCapacity(config: GameConfig, state: GameState): number {
    return currentLevelDef(config, state, 'pen')?.pens ?? 0;
}

export function isGreenhouse(config: GameConfig, state: GameState): boolean {
    const f = config.farming;
    return !!f && (state.buildings.garden?.level ?? 0) >= f.greenhouseLevel;
}

/** 补上老存档没有的 farm；菜地数量跟着菜园等级变 */
export function farmOf(config: GameConfig, state: GameState, now: number): FarmState {
    if (!state.farm) state.farm = { plots: [], animals: {}, hunger: 0, day: currentDay(config, state, now), produce: {} };
    const farm = state.farm;
    const n = plotCount(config, state);
    while (farm.plots.length < n) farm.plots.push(null);
    return farm;
}

export function animalTotal(state: GameState): number {
    return Object.values(state.farm?.animals ?? {}).reduce((a, b) => a + b, 0);
}

export function penSpace(config: GameConfig, state: GameState): number {
    return Math.max(0, penCapacity(config, state) - animalTotal(state));
}

/** 在营地里（没出门、没受伤）的农夫有几个 */
export function farmersHome(config: GameConfig, state: GameState): number {
    return state.survivors.filter((s) => !s.injured && !isOnExpedition(state, s.id) && survivorInfo(config, state, s.id)?.specialty === 'farmer').length;
}

/** 现在种这个作物的生长速度倍率；0 = 这个季节种不了 */
export function growthRate(config: GameConfig, state: GameState, crop: CropDef, now: number): number {
    const f = config.farming!;
    const season = seasonAt(config, state, now).season.id;
    const greenhouse = isGreenhouse(config, state);
    let rate = f.seasonGrowth[season] ?? 1;
    if (greenhouse && rate <= 0) rate = f.greenhouseWinter;
    if (!greenhouse && crop.seasons && !crop.seasons.includes(season)) return 0;
    if (rate <= 0) return 0;
    return rate * (1 + f.farmerBonus * Math.min(f.maxFarmers, farmersHome(config, state)));
}

/** 现在种下去要多少游戏分钟 */
export function growMinutes(config: GameConfig, state: GameState, crop: CropDef, now: number): number {
    const rate = growthRate(config, state, crop, now);
    return rate > 0 ? Math.round(crop.minutes / rate) : Infinity;
}

/** 能不能种；返回 null 表示可以 */
export function plantBlocker(config: GameConfig, state: GameState, cropId: string, now: number): string | null {
    const crop = cropDef(config, cropId);
    if (!crop) return '没有这种作物';
    if ((state.buildings.garden?.level ?? 0) <= 0) return '还没有菜园';
    if (propCount(state, crop.seed) <= 0) return `没有${crop.name}种子`;
    if (!farmOf(config, state, now).plots.some((p) => p === null)) return '菜地都种满了';
    if (growthRate(config, state, crop, now) <= 0) {
        const season = seasonAt(config, state, now).season;
        return season.id === 'winter' ? '地冻住了，要温室大棚才能种' : `${season.name}天种不了${crop.name}`;
    }
    return null;
}

/** 在第一块空地（或指定的地）种下一颗种子 */
export function plant(config: GameConfig, state: GameState, cropId: string, now: number, plotIndex?: number): ActionResult {
    const blocker = plantBlocker(config, state, cropId, now);
    if (blocker) return { ok: false, reason: blocker };
    const farm = farmOf(config, state, now);
    const index = plotIndex !== undefined && farm.plots[plotIndex] === null ? plotIndex : farm.plots.findIndex((p) => p === null);
    if (index < 0 || index >= farm.plots.length) return { ok: false, reason: '没有空地' };
    const crop = cropDef(config, cropId)!;
    state.props![crop.seed] -= 1;
    farm.plots[index] = { crop: crop.id, plantedAt: now, readyAt: now + growMinutes(config, state, crop, now) * 60_000 };
    addStat(state, 'crops_planted');
    return { ok: true, message: `种下了${crop.icon}${crop.name}` };
}

function grantBag(config: GameConfig, state: GameState, bag: ResourceBag): ResourceBag {
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) {
        if (!bag[id]) continue;
        out[id] = bag[id];
        addResource(config, state, id, bag[id]!);
    }
    return out;
}

function bagText(config: GameConfig, bag: ResourceBag): string {
    return RESOURCE_IDS.filter((id) => bag[id])
        .map((id) => `${config.resources.find((r) => r.id === id)?.icon ?? id}${bag[id]}`)
        .join(' ');
}

/** 收一块地；返回收到了什么 */
function harvestPlot(config: GameConfig, state: GameState, index: number, now: number): string | null {
    const farm = farmOf(config, state, now);
    const plot = farm.plots[index];
    if (!plot || plot.readyAt > now) return null;
    const crop = cropDef(config, plot.crop);
    farm.plots[index] = null;
    if (!crop) return null;
    const growth = foodGrowth(config, state);
    const bag: ResourceBag = {};
    for (const id of RESOURCE_IDS) if (crop.yield[id]) bag[id] = Math.round(crop.yield[id]! * (id === 'food' ? growth : 1));
    const got = grantBag(config, state, bag);
    const [lo, hi] = crop.seedsBack;
    const seeds = lo + Math.floor(nextRandom(state) * (hi - lo + 1));
    if (seeds > 0) addProp(state, crop.seed, seeds);
    addStat(state, 'harvests');
    addStat(state, `crop_${crop.id}`);
    return `${crop.icon}${crop.name}（${bagText(config, got)}${seeds > 0 ? `，种子×${seeds}` : ''}）`;
}

export function readyPlots(config: GameConfig, state: GameState, now: number): number {
    return (state.farm?.plots ?? []).filter((p) => p && p.readyAt <= now).length;
}

/** 把熟了的都收了 */
export function harvestAll(config: GameConfig, state: GameState, now: number): ActionResult {
    const farm = farmOf(config, state, now);
    const got: string[] = [];
    farm.plots.forEach((_, i) => {
        const text = harvestPlot(config, state, i, now);
        if (text) got.push(text);
    });
    if (got.length === 0) return { ok: false, reason: '还没有熟的' };
    const message = `收了 ${got.join('、')}`;
    addLog(state, now, `🧺 ${message}。`);
    return { ok: true, message };
}

/** 拔掉一块地上的菜（换种别的），种子不退 */
export function clearPlot(config: GameConfig, state: GameState, index: number, now: number): ActionResult {
    const farm = farmOf(config, state, now);
    if (!farm.plots[index]) return { ok: false, reason: '这块地是空的' };
    farm.plots[index] = null;
    return { ok: true };
}

/** 放进畜栏，返回实际放进去几只（畜栏满了放不下） */
export function addAnimals(config: GameConfig, state: GameState, animalId: string, amount: number, now: number): number {
    if (!animalDef(config, animalId)) return 0;
    const farm = farmOf(config, state, now);
    const n = Math.min(amount, penSpace(config, state));
    if (n <= 0) return 0;
    farm.animals[animalId] = (farm.animals[animalId] ?? 0) + n;
    addStat(state, 'animals_raised', n);
    return n;
}

/** 少一只（死了、跑了、宰了） */
export function removeAnimal(state: GameState, animalId: string): void {
    const farm = state.farm;
    if (!farm || !farm.animals[animalId]) return;
    farm.animals[animalId] = Math.max(0, (farm.animals[animalId] ?? 0) - 1);
    if (farm.animals[animalId] === 0) {
        delete farm.animals[animalId];
        delete farm.produce[animalId];
    } else if (farm.produce[animalId]) {
        farm.produce[animalId] = Math.min(farm.produce[animalId], farm.animals[animalId] * 3);
    }
}

/** 每天要喂多少食物 */
export function dailyFeed(config: GameConfig, state: GameState): number {
    return Object.entries(state.farm?.animals ?? {}).reduce((sum, [id, n]) => sum + (animalDef(config, id)?.feed ?? 0) * n, 0);
}

/** 换日：喂食、下蛋、生崽、挨饿 */
function feedDay(config: GameConfig, state: GameState, at: number): void {
    const f = config.farming!;
    const farm = state.farm!;
    const need = dailyFeed(config, state);
    if (need <= 0) {
        farm.hunger = 0;
        return;
    }
    if (state.resources.food >= need) {
        state.resources.food -= need;
        farm.hunger = 0;
    } else {
        state.resources.food = 0;
        farm.hunger += 1;
        if (farm.hunger >= f.starveDays) {
            // 饿太久：吃得最多的那种先饿死（或者跑掉）一只
            const victim = Object.keys(farm.animals)
                .map((id) => animalDef(config, id)!)
                .filter(Boolean)
                .sort((a, b) => b.feed - a.feed)[0];
            if (victim) {
                removeAnimal(state, victim.id);
                addLog(state, at, `🥀 畜栏断粮好几天了，一只${victim.icon}${victim.name}饿死了。`);
            }
            farm.hunger = 0;
        } else {
            addLog(state, at, `⚠️ 没有食物喂牲口了！它们今天不会下蛋，再饿下去会饿死。`);
        }
        return;
    }
    const born: string[] = [];
    for (const [id, n] of Object.entries(farm.animals)) {
        const def = animalDef(config, id);
        if (!def || n <= 0) continue;
        // 产出攒着，最多攒三天
        if (def.product) farm.produce[id] = Math.min(n * 3, (farm.produce[id] ?? 0) + n);
        if (n >= 2 && nextRandom(state) < def.breed) {
            const [lo, hi] = def.litter;
            const kids = addAnimals(config, state, id, lo + Math.floor(nextRandom(state) * (hi - lo + 1)), at);
            if (kids > 0) born.push(`${def.icon}${def.name}×${kids}`);
        }
    }
    if (born.length) addLog(state, at, `🐣 畜栏里添了新生命：${born.join('、')}。`);
}

/** 攒着的产出能换多少食物 */
export function produceFood(config: GameConfig, state: GameState): number {
    const growth = foodGrowth(config, state);
    return Object.entries(state.farm?.produce ?? {}).reduce((sum, [id, n]) => sum + Math.round((animalDef(config, id)?.product?.food ?? 0) * n * growth), 0);
}

export function collectProduce(config: GameConfig, state: GameState, now: number): ActionResult {
    const farm = farmOf(config, state, now);
    const food = produceFood(config, state);
    if (food <= 0) return { ok: false, reason: '还没有可以收的' };
    const items = Object.entries(farm.produce)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => {
            const p = animalDef(config, id)?.product;
            return p ? `${p.icon}${p.name}×${n}` : '';
        })
        .filter(Boolean);
    farm.produce = {};
    addResource(config, state, 'food', food);
    addStat(state, 'produce_collected');
    const message = `收了 ${items.join('、')}，🍞+${food}`;
    addLog(state, now, `🧺 ${message}。`);
    return { ok: true, message };
}

export function slaughter(config: GameConfig, state: GameState, animalId: string, now: number): ActionResult {
    const def = animalDef(config, animalId);
    if (!def || (state.farm?.animals[animalId] ?? 0) <= 0) return { ok: false, reason: '畜栏里没有' };
    removeAnimal(state, animalId);
    const food = Math.round(def.meat * foodGrowth(config, state));
    addResource(config, state, 'food', food);
    addStat(state, 'animals_slaughtered');
    addLog(state, now, `🔪 宰了一只${def.icon}${def.name}，🍞+${food}。`);
    return { ok: true, message: `🍞+${food}` };
}

export function petBlocker(config: GameConfig, state: GameState, now: number): string | null {
    if (animalTotal(state) <= 0) return '畜栏里还没有牲口';
    if (state.farm?.pettedDay === currentDay(config, state, now)) return '今天已经照看过了';
    return null;
}

/** 照看牲口：喂把草、摸摸头，大家心情好一点（每天一次） */
export function petAnimals(config: GameConfig, state: GameState, now: number): ActionResult {
    const blocker = petBlocker(config, state, now);
    if (blocker) return { ok: false, reason: blocker };
    const amount = config.farming!.petMood;
    state.farm!.pettedDay = currentDay(config, state, now);
    changeMoodAll(state, amount, '照看了畜栏里的牲口', now);
    addStat(state, 'animals_petted');
    return { ok: true, message: `所有人心情 +${amount}` };
}

/** 每次 tick：送开局种子、烂掉没收的菜、按天喂牲口 */
export function updateFarm(config: GameConfig, state: GameState, now: number): void {
    const f = config.farming;
    if (!f) return;
    const hasGarden = (state.buildings.garden?.level ?? 0) > 0;
    const hasPen = (state.buildings.pen?.level ?? 0) > 0;
    if (!state.farm && !hasGarden && !hasPen) return;
    const farm = farmOf(config, state, now);
    if (hasGarden && !farm.starter) {
        farm.starter = true;
        for (const [id, n] of Object.entries(f.starterSeeds)) addProp(state, id, n);
        const names = Object.entries(f.starterSeeds).map(([id, n]) => `${propDef(config, id)?.icon ?? ''}${propDef(config, id)?.name ?? id}×${n}`);
        addLog(state, now, `🌱 收拾菜园的时候，在超市花卉区的货架底下翻出了几包种子：${names.join('、')}。`);
    }
    farm.plots.forEach((p, i) => {
        if (!p || now <= p.readyAt + f.witherMinutes * 60_000) return;
        farm.plots[i] = null;
        const crop = cropDef(config, p.crop);
        addLog(state, p.readyAt + f.witherMinutes * 60_000, `🥀 ${crop?.icon ?? ''}${crop?.name ?? '菜'}熟了没人收，烂在地里了。`);
    });
    const today = currentDay(config, state, now);
    const dayMs = config.balance.dayLengthMinutes * 60_000;
    while (farm.day < today) {
        farm.day += 1;
        feedDay(config, state, state.createdAt + (farm.day - 1) * dayMs);
    }
}

/** 收益最高的、现在能种的作物（自动打理和界面推荐用） */
export function bestCrop(config: GameConfig, state: GameState, now: number): CropDef | undefined {
    const value = (c: CropDef) => ((c.yield.food ?? 0) + (c.yield.medicine ?? 0) * 4) / c.minutes;
    return (config.farming?.crops ?? []).filter((c) => !plantBlocker(config, state, c.id, now)).sort((a, b) => value(b) - value(a))[0];
}

/** 没有界面在看（测试、模拟）：收熟了的菜、收蛋、种满空地 */
export function autoFarm(config: GameConfig, state: GameState, now: number): void {
    if (!state.farm) return;
    if (readyPlots(config, state, now) > 0) harvestAll(config, state, now);
    if (produceFood(config, state) > 0) collectProduce(config, state, now);
    for (let guard = 0; guard < 20; guard++) {
        const crop = bestCrop(config, state, now);
        if (!crop || !plant(config, state, crop.id, now).ok) break;
    }
}
