// 战斗接入营地：探索远征、尸潮夜袭、伤员治疗。
// 战斗本身在 battle/ 里；这里负责“谁上阵、打完之后营地发生什么”。
//
// 所有战斗都是按种子自动结算的，战报里保存了完整的 BattleSetup，
// 界面以后可以用同一个种子把整场战斗重放出来（结果完全一致）。

import { Battle, BattleSetup, UnitSetup } from './battle/Battle';
import { BattleRegistry } from './battle/registry';
import { BattleResult } from './battle/types';
import { statsAtLevel } from './battle/units';
import { addResource, canAfford, currentLevelDef, grantResources, pay, safety, survivorBattleLevel } from './economy';
import { conditionMet, queueEvent } from './events';
import { nextRandom } from './rng';
import { addLog, addStat, hasFlag, healSurvivorState, injureSurvivor, setFlag } from './state';
import { consumeUsedItems, equipItems } from './crafting';
import {
    ActionResult,
    BattleReport,
    ExpeditionState,
    GameConfig,
    GameState,
    LocationDef,
    RaidDef,
    RESOURCE_IDS,
    ResourceBag,
    SurvivorState,
} from './types';

/** 路障在战斗里对应的角色 id（units.json） */
export const BARRICADE_UNIT = 'barricade';
/** 营地的狗（收养后跟大家一起守夜） */
export const DOG_UNIT = 'dog';
export const DOG_FLAG = 'has_dog';
/** 路障站在我方最前面 */
const BARRICADE_X = 1.5;
const MAX_REPORTS = 10;

const registries = new WeakMap<GameConfig, BattleRegistry>();

export function battleRegistry(config: GameConfig): BattleRegistry {
    let reg = registries.get(config);
    if (!reg) {
        reg = new BattleRegistry(config);
        registries.set(config, reg);
    }
    return reg;
}

// ---------- 上阵人员 ----------

export function isOnExpedition(state: GameState, survivorId: string): boolean {
    return state.expeditions.some((e) => e.squad.includes(survivorId));
}

function battleUnitOf(config: GameConfig, survivorId: string): string | undefined {
    return config.survivors.find((d) => d.id === survivorId)?.battleUnit;
}

/** 战斗力估算（生命 × 攻击），用来自动编队 */
export function survivorPower(config: GameConfig, survivorId: string): number {
    const unitId = battleUnitOf(config, survivorId);
    if (!unitId) return 0;
    const stats = statsAtLevel(battleRegistry(config).unit(unitId), 1);
    return Math.round((stats.maxHp * stats.atk) / 100);
}

/** 能上阵的人：没受伤、不在外面探索、有战斗角色 */
export function availableFighters(config: GameConfig, state: GameState): SurvivorState[] {
    return state.survivors.filter((s) => !s.injured && !isOnExpedition(state, s.id) && !!battleUnitOf(config, s.id));
}

/** 自动编队：战斗力最高的几个人 */
export function suggestSquad(config: GameConfig, state: GameState, size = config.balance.maxSquadSize): string[] {
    return availableFighters(config, state)
        .map((s) => s.id)
        .sort((a, b) => survivorPower(config, b) - survivorPower(config, a))
        .slice(0, size);
}

function squadSetups(config: GameConfig, squad: string[], level: number): UnitSetup[] {
    return squad.map((id) => ({ unit: battleUnitOf(config, id)!, level, tag: id }));
}

/** 探索战斗的参数。单独拆出来，数值平衡报告也用它，保证模拟的和游戏里打的一样 */
export function expeditionSetup(config: GameConfig, loc: LocationDef, squad: string[], level: number, seed: number): BattleSetup {
    return {
        allies: squadSetups(config, squad, level),
        enemies: loc.enemies,
        timeLimit: loc.timeLimit,
        timeoutResult: 'lose',
        seed,
        autoCastActive: true,
    };
}

export interface RaidOptions {
    /** 营地养了狗：狗一起上阵 */
    dog?: boolean;
    /** 血月夜：尸群多一半 */
    bloodMoon?: boolean;
}

/** 血月夜的敌人：原来的尸群里每隔一只再来一只（多 50%），晚 2 秒出场 */
export function bloodMoonEnemies(enemies: UnitSetup[]): UnitSetup[] {
    const extra = enemies.filter((_, i) => i % 2 === 0).map((e) => ({ ...e, spawnAt: (e.spawnAt ?? 0) + 2 }));
    return [...enemies, ...extra];
}

/** 守夜战斗的参数：路障站在最前面，大家守在路障后面，路障被拆就算输，撑到时间结束算赢 */
export function raidSetup(
    config: GameConfig,
    raid: RaidDef,
    defenders: string[],
    wallHp: number,
    level: number,
    seed: number,
    options: RaidOptions = {},
): BattleSetup {
    const dog: UnitSetup[] = options.dog ? [{ unit: DOG_UNIT, level, tag: DOG_UNIT }] : [];
    return {
        allies: [{ unit: BARRICADE_UNIT, x: BARRICADE_X, maxHp: wallHp, tag: BARRICADE_UNIT }, ...squadSetups(config, defenders, level), ...dog],
        enemies: options.bloodMoon ? bloodMoonEnemies(raid.enemies) : raid.enemies,
        timeLimit: raid.timeLimit,
        timeoutResult: 'win',
        seed,
        autoCastActive: true,
        mustSurvive: [BARRICADE_UNIT],
        allyHoldLine: BARRICADE_X,
    };
}

interface Outcome {
    result: BattleResult;
    /** 倒下的我方单位的 tag */
    fallen: string[];
    /** 这场战斗里用掉的物品名 */
    itemsUsed: string[];
}

/** 打一场营地战斗：先分配物品，打完记录击杀统计、扣掉用掉的物品 */
function fight(config: GameConfig, state: GameState, setup: BattleSetup): Outcome {
    const carried = equipItems(config, state, setup.allies);
    const battle = new Battle(battleRegistry(config), setup);
    const result = battle.runToEnd();
    for (const u of battle.side('enemy')) {
        if (u.alive) continue;
        addStat(state, `kill_${u.def.id}`);
        if (u.def.faction === 'zombie') addStat(state, 'zombies_killed');
    }
    const fallen = battle.side('ally').filter((u) => !u.alive && u.tag).map((u) => u.tag!);
    return { result, fallen, itemsUsed: consumeUsedItems(state, battle, carried) };
}

/** 下一次尸潮是不是血月夜 */
export function nextRaidIsBloodMoon(config: GameConfig, state: GameState): boolean {
    const every = config.balance.bloodMoonEvery;
    return every > 0 && (state.raidCount + 1) % every === 0;
}

function usedText(items: string[]): string {
    return items.length ? `（用掉了${items.join('、')}）` : '';
}

function randomSeed(state: GameState): number {
    return Math.floor(nextRandom(state) * 2 ** 31);
}

// ---------- 探索 ----------

export function getLocation(config: GameConfig, id: string): LocationDef | undefined {
    return config.locations.find((l) => l.id === id);
}

export function availableLocations(config: GameConfig, state: GameState, now: number): LocationDef[] {
    return config.locations.filter((l) => conditionMet(config, state, l.conditions, now));
}

export function clearedFlag(locationId: string): string {
    return `cleared_${locationId}`;
}

/** 检查能否出发；返回 null 表示可以 */
export function expeditionBlocker(config: GameConfig, state: GameState, locationId: string, squad: string[], now: number): string | null {
    const loc = getLocation(config, locationId);
    if (!loc) return '地点不存在';
    if (!conditionMet(config, state, loc.conditions, now)) return '这个地点还没解锁';
    if (state.expeditions.some((e) => e.location === locationId)) return '已经有小队在这里了';
    if (squad.length === 0) return '没有能出发的人';
    if (squad.length > config.balance.maxSquadSize) return `小队最多 ${config.balance.maxSquadSize} 人`;
    if (new Set(squad).size !== squad.length) return '小队成员重复';
    const fighters = new Set(availableFighters(config, state).map((s) => s.id));
    if (!squad.every((id) => fighters.has(id))) return '有成员受伤或已经在外面';
    return null;
}

export function startExpedition(config: GameConfig, state: GameState, locationId: string, squad: string[], now: number): ActionResult {
    const blocker = expeditionBlocker(config, state, locationId, squad, now);
    if (blocker) return { ok: false, reason: blocker };
    const loc = getLocation(config, locationId)!;
    for (const s of state.survivors) if (squad.includes(s.id)) s.assignment = null;
    state.expeditions.push({
        id: state.nextId++,
        location: locationId,
        squad: [...squad],
        startedAt: now,
        returnsAt: now + loc.durationMinutes * 60_000,
        seed: randomSeed(state),
    });
    addLog(state, now, `小队出发前往${loc.name}。`);
    return { ok: true };
}

/** 看完广告后立即返回 */
export function finishExpeditionNow(config: GameConfig, state: GameState, expeditionId: number, now: number): ActionResult {
    const ex = state.expeditions.find((e) => e.id === expeditionId);
    if (!ex) return { ok: false, reason: '没有这支小队' };
    ex.returnsAt = now;
    resolveExpeditions(config, state, now);
    return { ok: true };
}

export function resolveExpeditions(config: GameConfig, state: GameState, now: number): void {
    const due = state.expeditions.filter((e) => e.returnsAt <= now).sort((a, b) => a.returnsAt - b.returnsAt);
    for (const ex of due) {
        state.expeditions = state.expeditions.filter((e) => e !== ex);
        resolveExpedition(config, state, ex);
    }
}

function resolveExpedition(config: GameConfig, state: GameState, ex: ExpeditionState): void {
    const loc = getLocation(config, ex.location);
    const at = ex.returnsAt;
    const squad = ex.squad.filter((id) => state.survivors.some((s) => s.id === id));
    if (!loc || squad.length === 0) return;

    const setup = expeditionSetup(config, loc, squad, survivorBattleLevel(config, state), ex.seed);
    const { result, fallen, itemsUsed } = fight(config, state, setup);
    let loot: ResourceBag = {};

    if (result === 'win') {
        addStat(state, 'expeditions_won');
        addStat(state, `clear_${loc.id}`);
        loot = grantResources(config, state, loc.loot);
        if (!hasFlag(state, clearedFlag(loc.id))) {
            setFlag(state, clearedFlag(loc.id));
            if (loc.firstClearFlag) setFlag(state, loc.firstClearFlag);
            if (loc.firstClearEvent) queueEvent(state, loc.firstClearEvent);
        }
    } else {
        addStat(state, 'expeditions_lost');
        for (const s of state.survivors) if (squad.includes(s.id)) s.mood = Math.max(0, s.mood - 5);
    }
    injureFallen(config, state, fallen, at);

    const names = fallen.map((id) => survivorName(config, id));
    const summary =
        result === 'win'
            ? `探索${loc.name}成功！带回 ${formatBag(config, loot) || '一些杂物'}` + (names.length ? `，${names.join('、')}受了伤。` : '。')
            : `探索${loc.name}失败，小队狼狈撤回` + (names.length ? `，${names.join('、')}受了伤。` : '。');
    const fullSummary = summary + usedText(itemsUsed);
    addReport(state, { kind: 'expedition', title: loc.name, at, result, setup, loot, lost: {}, injured: fallen, summary: fullSummary });
}

// ---------- 尸潮夜袭 ----------

/** 当前会来的尸潮：满足条件的里面取最后一个 */
export function currentRaid(config: GameConfig, state: GameState, now: number): RaidDef | undefined {
    const eligible = config.raids.filter((r) => conditionMet(config, state, r.conditions, now));
    return eligible[eligible.length - 1];
}

export function raidDefenders(config: GameConfig, state: GameState): string[] {
    return suggestSquad(config, state, config.balance.maxDefenders);
}

export function barricadeHp(config: GameConfig, state: GameState): number {
    return Math.max(1, safety(config, state) * config.balance.barricadeHpPerSafety);
}

/** 到时间就结算一次尸潮。离线期间最多结算一次，避免回来发现营地被连打好几轮 */
export function maybeRunRaid(config: GameConfig, state: GameState, now: number): void {
    if (now < state.nextRaidAt) return;
    const at = state.nextRaidAt;
    state.nextRaidAt = now + config.balance.raidIntervalMinutes * 60_000;
    const raid = currentRaid(config, state, now);
    if (raid) runRaid(config, state, raid, at);
}

export function runRaid(config: GameConfig, state: GameState, raid: RaidDef, at: number): BattleReport {
    const defenders = raidDefenders(config, state);
    const level = survivorBattleLevel(config, state);
    const bloodMoon = nextRaidIsBloodMoon(config, state);
    state.raidCount += 1;
    const options: RaidOptions = { bloodMoon, dog: hasFlag(state, DOG_FLAG) };
    const setup = raidSetup(config, raid, defenders, barricadeHp(config, state), level, randomSeed(state), options);
    const { result, fallen, itemsUsed } = fight(config, state, setup);
    const survivorIds = new Set(state.survivors.map((s) => s.id));
    const injured = fallen.filter((t) => survivorIds.has(t));
    const title = bloodMoon ? `血月·${raid.name}` : raid.name;
    let loot: ResourceBag = {};
    const lost: ResourceBag = {};

    if (result === 'win') {
        addStat(state, 'raids_won');
        if (bloodMoon) addStat(state, 'blood_moons_won');
        const mult = bloodMoon ? config.balance.bloodMoonRewardMultiplier : 1;
        const reward: ResourceBag = {};
        for (const id of RESOURCE_IDS) if (raid.reward[id]) reward[id] = raid.reward[id]! * mult;
        loot = grantResources(config, state, reward);
        for (const s of state.survivors) s.mood = Math.min(100, s.mood + 3);
    } else {
        addStat(state, 'raids_lost');
        for (const id of RESOURCE_IDS) {
            if (id === 'cans') continue;
            const amount = Math.floor(state.resources[id] * config.balance.raidLossRatio);
            if (amount > 0) {
                addResource(config, state, id, -amount);
                lost[id] = amount;
            }
        }
        for (const s of state.survivors) s.mood = Math.max(0, s.mood - 10);
    }
    injureFallen(config, state, injured, at);

    const names = injured.map((id) => survivorName(config, id));
    const hurt = names.length ? `${names.join('、')}受了伤。` : '';
    const summary =
        result === 'win'
            ? `【${title}】营地守住了！${formatBag(config, loot) ? `缴获 ${formatBag(config, loot)}。` : ''}${hurt}`
            : `【${title}】尸群冲进了营地，损失了 ${formatBag(config, lost) || '一些物资'}。${hurt}`;
    return addReport(state, { kind: 'raid', title, at, result, setup, loot, lost, injured, summary: summary + usedText(itemsUsed) });
}

// ---------- 伤员 ----------

function injureFallen(config: GameConfig, state: GameState, ids: string[], at: number): void {
    for (const s of state.survivors) if (ids.includes(s.id)) injureSurvivor(config, s, at);
}

/** 到时间的伤员自然痊愈 */
export function recoverInjuries(config: GameConfig, state: GameState, now: number): void {
    for (const s of state.survivors) {
        if (s.injured && s.recoverAt !== null && s.recoverAt <= now) {
            healSurvivorState(s);
            addLog(state, now, `${survivorName(config, s.id)}的伤好了。`);
        }
    }
}

/** 在医务室花药品立即治好一个伤员 */
export function treatSurvivor(config: GameConfig, state: GameState, survivorId: string, now: number): ActionResult {
    const s = state.survivors.find((x) => x.id === survivorId);
    if (!s) return { ok: false, reason: '找不到这个幸存者' };
    if (!s.injured) return { ok: false, reason: '没有受伤' };
    if (!currentLevelDef(config, state, 'infirmary')) return { ok: false, reason: '需要先建造医务室' };
    if (!canAfford(state, config.balance.healCost)) return { ok: false, reason: '药品不足' };
    pay(state, config.balance.healCost);
    healSurvivorState(s);
    addStat(state, 'treated');
    addLog(state, now, `${survivorName(config, s.id)}在医务室接受了治疗。`);
    return { ok: true };
}

// ---------- 工具 ----------

function addReport(state: GameState, data: Omit<BattleReport, 'id'>): BattleReport {
    const report: BattleReport = { id: state.nextId++, ...data };
    state.reports.push(report);
    if (state.reports.length > MAX_REPORTS) state.reports.splice(0, state.reports.length - MAX_REPORTS);
    addLog(state, data.at, data.summary);
    return report;
}

function survivorName(config: GameConfig, id: string): string {
    return config.survivors.find((s) => s.id === id)?.name ?? id;
}

export function formatBag(config: GameConfig, bag: ResourceBag): string {
    return RESOURCE_IDS.filter((id) => bag[id])
        .map((id) => `${config.resources.find((r) => r.id === id)?.icon ?? id}${bag[id]}`)
        .join(' ');
}
