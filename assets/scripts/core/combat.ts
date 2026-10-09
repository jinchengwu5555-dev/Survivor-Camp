// 战斗接入营地：探索远征、尸潮夜袭、伤员治疗。
// 战斗本身在 battle/ 里；这里负责“谁上阵、打完之后营地发生什么”。
//
// 所有战斗都是按种子自动结算的，战报里保存了完整的 BattleSetup，
// 界面以后可以用同一个种子把整场战斗重放出来（结果完全一致）。

import { campGates, recordWallDamage, wallWear } from './wall';
import { addFamiliar, parseFamiliarTag, settleFamiliar } from './familiar';
import { Battle, BattleSetup, UnitSetup } from './battle/Battle';
import { CampBuilding, campCenter, CampLayout, gateNormal, Rect } from './battle/geometry';
import { battleCamp } from './campzones';
import { BattleRegistry } from './battle/registry';
import { BattleResult } from './battle/types';
import { statsAtLevel } from './battle/units';
import { addResource, canAfford, currentLevelDef, grantResources, hqLevel, pay, safety, survivorBattleLevel } from './economy';
import { conditionMet, discoverSite, queueEvent } from './events';
import { nextRandom } from './rng';
import { addLog, addStat, currentDay, hasFlag, healSurvivorState, setFlag } from './state';
import { killRandom, resolveFallen, survivorInfo, survivorName } from './roster';
import { siteRaidLevel } from './siteMods';
import { CarriedItem, consumeUsedItems, equipItems } from './crafting';
import { formatProps, rollDrops } from './props';
import { combatMultiplier } from './talents';
import { passNight, rollRaid, watchersText } from './watch';
import { changeMoodAll } from './mood';
import { takeDroppedGear } from './gear';
import { firstRecruits, nightQuirks, offerCandidates } from './recruits';
import { locationName } from './names';
import { carryHome, makePieces, newHaul } from './packing';
import { haulSections, pickVehicle, useVehicle, vehicleDef } from './vehicles';
import { tierAt } from './districts';
import { hasMedic, lootBonus, rowOf, squadBonus, weaponRange } from './formation';
import { recordSharedBattle } from './bonds';
import {
    ActionResult,
    BattleReport,
    ExpeditionState,
    PendingRaid,
    GameConfig,
    GameState,
    LocationDef,
    RaidDef,
    RESOURCE_IDS,
    ResourceBag,
    SurvivorRow,
    StragglerGroup,
    SurvivorState,
} from './types';

/** 栅栏在战斗里对应的角色 id（units.json）；营地的每个门都是一个栅栏单位 */
export const BARRICADE_UNIT = 'barricade';
/** 营地核心（units.json）：尸群冲进来拆掉它就算输 */
export const CORE_UNIT = 'camp_core';
/** 四个门的名字（顺序和 campLayout 一致） */
export const GATE_NAMES = ['北门', '东门', '南门', '西门'];

/** 门少时每个门的生命加成：× (4 / 门数)^这个数 */
const GATE_FEW_BONUS = 0.75;

/** 第几个门的 tag */
export function gateTag(gate: number): string {
    return `gate_${gate}`;
}

/**
 * 俯视守夜的营地布局：围墙围成的矩形，每面墙正中一个门（北、东、南、西）。
 * 不给 rect 就是 balance.camp.half 的正方形（数值报告用）；游戏里用营地地图真实的围墙（campzones.ts 的 battleCamp）。
 */
export function campLayout(config: GameConfig, rect?: Rect, buildings?: CampBuilding[]): CampLayout {
    const h = config.balance.camp?.half ?? 6;
    if (!rect) return { half: h, gates: [{ x: 0, y: h }, { x: h, y: 0 }, { x: 0, y: -h }, { x: -h, y: 0 }] };
    const cx = (rect.x1 + rect.x2) / 2;
    const cy = (rect.y1 + rect.y2) / 2;
    return {
        half: Math.max(rect.x2 - rect.x1, rect.y2 - rect.y1) / 2,
        rect,
        gates: [{ x: cx, y: rect.y2 }, { x: rect.x2, y: cy }, { x: cx, y: rect.y1 }, { x: rect.x1, y: cy }],
        buildings,
    };
}
/** 营地的狗（收养后跟大家一起守夜） */
export const DOG_UNIT = 'dog';
export const DOG_FLAG = 'has_dog';
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

/** 在外面：探索小队里，或者正在侦察 */
export function isOnExpedition(state: GameState, survivorId: string): boolean {
    return (
        state.expeditions.some((e) => e.squad.includes(survivorId)) ||
        (state.scouts ?? []).some((s) => s.survivor === survivorId) ||
        (state.surveys ?? []).some((s) => s.squad.includes(survivorId)) ||
        (state.hunts ?? []).some((s) => s.squad.includes(survivorId))
    );
}

function battleUnitOf(config: GameConfig, state: GameState, survivorId: string): string | undefined {
    return survivorInfo(config, state, survivorId)?.battleUnit;
}

/** 上阵成员：幸存者 id + 战斗角色 */
export interface SquadMember {
    id: string;
    unit: string;
    /** 天赋、装备、站位、搭配带来的攻击 / 生命倍率（没有就是 1） */
    atkMult?: number;
    hpMult?: number;
    /** 站位和远程武器射程（formation.ts） */
    row?: SurvivorRow;
    range?: number;
}

/** 把幸存者 id 列表转成上阵成员（没有战斗角色的人会被跳过）；站位和搭配的加成按整支队伍算 */
export function squadOf(config: GameConfig, state: GameState, ids: string[], now = state.clock.gameTime): SquadMember[] {
    const fighters = ids.filter((id) => !!battleUnitOf(config, state, id));
    return fighters.map((id) => {
        const { atk, hp } = combatMultiplier(config, state, id);
        const bonus = squadBonus(config, state, fighters, id, now);
        const range = weaponRange(config, state, id);
        return { id, unit: battleUnitOf(config, state, id)!, atkMult: atk * bonus.atk, hpMult: hp * bonus.hp, row: rowOf(config, state, id), range: range || undefined };
    });
}

/** 战斗力估算（生命 × 攻击），用来自动编队 */
export function survivorPower(config: GameConfig, state: GameState, survivorId: string): number {
    const unitId = battleUnitOf(config, state, survivorId);
    if (!unitId) return 0;
    const stats = statsAtLevel(battleRegistry(config).unit(unitId), 1);
    const m = combatMultiplier(config, state, survivorId);
    return Math.round((stats.maxHp * m.hp * stats.atk * m.atk) / 100);
}

/** 能上阵的人：没受伤、不在外面探索、有战斗角色 */
export function availableFighters(config: GameConfig, state: GameState): SurvivorState[] {
    return state.survivors.filter((s) => !s.injured && !isOnExpedition(state, s.id) && !!battleUnitOf(config, state, s.id));
}

/**
 * 自动编队：优先派闲着的人，人手不够再从工作岗位上抽人；同一组里按战斗力从高到低。
 * 否则最能打的厨师也会被拉走，厨房没人、全营地挨饿。
 */
export function suggestSquad(config: GameConfig, state: GameState, size = config.balance.maxSquadSize): string[] {
    return availableFighters(config, state)
        .sort((a, b) => Number(!!a.assignment) - Number(!!b.assignment) || survivorPower(config, state, b.id) - survivorPower(config, state, a.id))
        .map((s) => s.id)
        .slice(0, size);
}

/** 前排从 x=0 往后排，后排从 BACK_ROW_X 往后排：尸群先撞上前排 */
const FRONT_SPACING = 0.6;
const BACK_ROW_X = -3;

function squadSetups(squad: SquadMember[], level: number): UnitSetup[] {
    let front = 0;
    let back = 0;
    return squad.map((m) => {
        const x = m.row === 'back' ? BACK_ROW_X - back++ * FRONT_SPACING : -front++ * FRONT_SPACING;
        const setup: UnitSetup = { unit: m.unit, level, tag: m.id, x };
        if (m.atkMult && m.atkMult !== 1) setup.atkMult = m.atkMult;
        if (m.hpMult && m.hpMult !== 1) setup.hpMult = m.hpMult;
        if (m.range) setup.range = m.range;
        return setup;
    });
}

/** 所有敌人等级 +bonus */
export function levelUpEnemies(enemies: UnitSetup[], bonus: number): UnitSetup[] {
    return bonus > 0 ? enemies.map((e) => ({ ...e, level: (e.level ?? 1) + bonus })) : enemies;
}

function scaleBag(bag: ResourceBag, factor: number): ResourceBag {
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) if (bag[id]) out[id] = Math.round(bag[id]! * factor);
    return out;
}

/** 探索随指挥部成长：敌人等级加成 */
export function expeditionEnemyBonus(config: GameConfig, state: GameState): number {
    return Math.floor((hqLevel(state) - 1) * config.balance.expeditionScaling.enemyLevelPerHq);
}

/** 探索随指挥部成长：实际战利品（和升级花费一样按指数增长，后期才不会变得没意义） */
export function expeditionLoot(config: GameConfig, state: GameState, loc: LocationDef): ResourceBag {
    // 打下过的地方再去，好东西已经被搜走了
    const repeat = (state.stats[`clear_${loc.id}`] ?? 0) > 0 ? config.balance.repeatLootFactor ?? 1 : 1;
    return scaleBag(loc.loot, Math.pow(config.balance.expeditionScaling.lootGrowth, hqLevel(state) - 1) * repeat);
}

/** 无尽尸潮：只按天数算的等级加成 */
export function raidDayBonus(config: GameConfig, state: GameState, now: number): number {
    const { startDay, daysPerLevel } = config.balance.raidScaling;
    return Math.max(0, Math.floor((currentDay(config, state, now) - startDay) / daysPerLevel) + 1);
}

/** 无尽尸潮：实际的等级加成 = 天数加成 - 喘息值 + 营地地点的加减 */
export function raidEnemyBonus(config: GameConfig, state: GameState, now: number): number {
    return Math.max(0, raidDayBonus(config, state, now) - state.raidRelief + siteRaidLevel(config, state));
}

/** 探索战斗的参数。单独拆出来，数值平衡报告也用它，保证模拟的和游戏里打的一样 */
export function expeditionSetup(
    config: GameConfig,
    loc: LocationDef,
    squad: SquadMember[],
    level: number,
    seed: number,
    enemyBonus = 0,
): BattleSetup {
    return {
        allies: squadSetups(squad, level),
        enemies: levelUpEnemies(loc.enemies, enemyBonus),
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
    /** 无尽尸潮的等级加成 */
    enemyBonus?: number;
    /** 营地真实的围墙和建筑（营地地图上清理出来的范围）；不给就是标准的正方形营地 */
    camp?: { rect: Rect; buildings: CampBuilding[] };
    /** 营地有哪几个门（0 北、1 东、2 南、3 西）；不给就是四个门都有 */
    gates?: number[];
}

/** 血月夜的敌人：原来的尸群里每隔一只再来一只（多 50%），晚 2 秒出场 */
export function bloodMoonEnemies(enemies: UnitSetup[]): UnitSetup[] {
    const extra = enemies.filter((_, i) => i % 2 === 0).map((e) => ({ ...e, spawnAt: (e.spawnAt ?? 0) + 2 }));
    return [...enemies, ...extra];
}

/** 栅栏上陷阱的攻击力（栅栏本身不打人） */
export function trapAtk(config: GameConfig, level: number): number {
    const t = config.balance.trapAtk ?? { base: 30, perLevel: 2 };
    return t.base + t.perLevel * Math.max(0, level - 1);
}

/** 尸群今晚从哪几个门来（门的下标；按种子轮换起始方向） */
export function attackedGates(raid: RaidDef, seed: number): number[] {
    const n = Math.max(1, Math.min(4, raid.sides ?? 1));
    const start = Math.abs(seed) % 4;
    // 两个方向时是对面的两个门，三个方向时空着一面
    const order = n === 2 ? [0, 2] : [0, 1, 2, 3];
    return order.slice(0, n).map((k) => (start + k) % 4);
}

/** 小丧尸一只变几只（swarm），看起来是一大群 */
function swarmEnemies(config: GameConfig, enemies: UnitSetup[]): UnitSetup[] {
    const sw = config.balance.camp?.swarm;
    if (!sw || sw.count <= 1) return enemies;
    return enemies.flatMap((e) => {
        if (!sw.units.includes(e.unit) || e.tag) return [e];
        return Array.from({ length: sw.count }, (_, k) => ({
            ...e,
            hpMult: (e.hpMult ?? 1) * sw.hpMult,
            atkMult: (e.atkMult ?? 1) * sw.atkMult,
            spawnAt: (e.spawnAt ?? 0) + k * 0.3,
        }));
    });
}

/**
 * 守夜战斗的参数（俯视营地）：四面围墙各一个门，中间是营地核心；
 * 尸群从今晚的几个方向涌来，守夜的人分到这几个门。核心被拆就算输，撑到时间结束算赢。
 */
export function raidSetup(
    config: GameConfig,
    raid: RaidDef,
    defenders: SquadMember[],
    wallHp: number,
    level: number,
    seed: number,
    options: RaidOptions = {},
): BattleSetup {
    const camp = campLayout(config, options.camp?.rect, options.camp?.buildings);
    const open = options.gates?.length ? options.gates : [0, 1, 2, 3];
    if (open.length < 4) camp.closed = [0, 1, 2, 3].filter((g) => !open.includes(g));
    const center = campCenter(camp);
    const cfg = config.balance.camp ?? { half: 6, spawnDistance: 9, gateHpShare: 0.5, coreHpShare: 0.6 };
    const open0 = options.gates?.length ? options.gates : [0, 1, 2, 3];
    // 尸群冲着门来：今晚要来的方向上没开门，就改从离它最近的门那边来（相邻的方向优先）
    const nearestOpen = (g: number) => [...open0].sort((a, b) => Math.min((a - g + 4) % 4, (g - a + 4) % 4) - Math.min((b - g + 4) % 4, (g - b + 4) % 4) || a - b)[0];
    const sides = attackedGates(raid, seed).map((g) => (open0.includes(g) ? g : nearestOpen(g)));
    // 门：只有开了的门才有栅栏；被攻打的方向排在前面（陷阱先装在这些门上）
    const gateOrder = [...new Set([...sides, 0, 1, 2, 3])].filter((g) => open.includes(g));
    // 守门的人分到被攻打方向上的门；那个方向没开门，就守离得最近的门
    const postGates = gateOrder.filter((g) => sides.includes(g));
    if (!postGates.length) postGates.push(...gateOrder);
    const gates: UnitSetup[] = gateOrder.map((g) => ({
        unit: BARRICADE_UNIT,
        x: camp.gates[g].x,
        y: camp.gates[g].y,
        gate: g,
        // 门少的时候，整圈栅栏的料都用在这几个门上：门越少每个门越结实
        maxHp: Math.max(1, Math.round(wallHp * cfg.gateHpShare * Math.pow(4 / open.length, GATE_FEW_BONUS))),
        tag: gateTag(g),
        atk: trapAtk(config, level),
    }));
    const core: UnitSetup = { unit: CORE_UNIT, x: center.x, y: center.y, maxHp: Math.max(1, Math.round(wallHp * cfg.coreHpShare)), tag: CORE_UNIT };
    const people = squadSetups(defenders, level);
    if (options.dog) people.push({ unit: DOG_UNIT, level, tag: DOG_UNIT });
    // 守门的人轮流分到今晚被攻打的门，站在门里面
    people.forEach((p, i) => {
        const g = postGates[i % postGates.length];
        const gate = camp.gates[g];
        p.post = g;
        p.x = gate.x + (center.x - gate.x) * 0.2;
        p.y = gate.y + (center.y - gate.y) * 0.2;
    });
    const base = levelUpEnemies(options.bloodMoon ? bloodMoonEnemies(raid.enemies) : raid.enemies, options.enemyBonus ?? 0);
    const enemies = swarmEnemies(config, base).map((e, i) => {
        const g = camp.gates[sides[i % sides.length]];
        const n = gateNormal(camp, g);
        const along = (((i * 7) % 9) - 4) * 0.9;
        const out = cfg.spawnDistance + ((i * 5) % 4) * 0.5;
        return { ...e, x: g.x + n.x * out - n.y * along, y: g.y + n.y * out + n.x * along };
    });
    return {
        allies: [...gates, core, ...people],
        enemies,
        timeLimit: raid.timeLimit,
        timeoutResult: 'win',
        seed,
        autoCastActive: true,
        mustSurvive: [CORE_UNIT],
        camp,
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
    battle.runToEnd();
    return battleOutcome(config, state, battle, carried);
}

/** 战斗结束后：记录击杀统计、扣掉用掉的物品，返回结果和倒下的人 */
function battleOutcome(config: GameConfig, state: GameState, battle: Battle, carried: CarriedItem[]): Outcome {
    const result = battle.result;
    for (const u of battle.side('enemy')) {
        if (u.alive) continue;
        addStat(state, `kill_${u.def.id}`);
        if (u.def.faction === 'zombie') addStat(state, 'zombies_killed');
        if (u.def.faction === 'raider') addStat(state, 'raiders_killed');
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

/** 地点刚被搜刮过：还要过多少秒（游戏时间）才能再去；0 表示可以去 */
export function restockSecondsLeft(state: GameState, locationId: string, now: number): number {
    const at = state.restockAt[locationId];
    return at === undefined ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

/** 检查能否出发；返回 null 表示可以 */
export function expeditionBlocker(config: GameConfig, state: GameState, locationId: string, squad: string[], now: number, vehicle?: string): string | null {
    const loc = getLocation(config, locationId);
    if (!loc) return '地点不存在';
    if (!conditionMet(config, state, loc.conditions, now)) return '这个地点还没解锁';
    const ride = pickVehicle(config, state, tierAt(config, loc.map), vehicle);
    if (ride.blocker) return ride.blocker;
    if (state.expeditions.some((e) => e.location === locationId)) return '已经有小队在这里了';
    const restock = restockSecondsLeft(state, locationId, now);
    if (restock > 0) return '刚搜刮过，物资还没重新聚起来';
    if (squad.length === 0) return '没有能出发的人';
    if (squad.length > config.balance.maxSquadSize) return `小队最多 ${config.balance.maxSquadSize} 人`;
    if (new Set(squad).size !== squad.length) return '小队成员重复';
    const fighters = new Set(availableFighters(config, state).map((s) => s.id));
    if (!squad.every((id) => fighters.has(id))) return '有成员受伤或已经在外面';
    return null;
}

export function startExpedition(config: GameConfig, state: GameState, locationId: string, squad: string[], now: number, vehicle?: string): ActionResult {
    const blocker = expeditionBlocker(config, state, locationId, squad, now, vehicle);
    if (blocker) return { ok: false, reason: blocker };
    const loc = getLocation(config, locationId)!;
    const v = pickVehicle(config, state, tierAt(config, loc.map), vehicle).vehicle;
    useVehicle(state, v);
    for (const s of state.survivors) if (squad.includes(s.id)) s.assignment = null;
    state.expeditions.push({
        id: state.nextId++,
        location: locationId,
        squad: [...squad],
        startedAt: now,
        returnsAt: now + loc.durationMinutes * (v?.speed ?? 1) * 60_000,
        seed: randomSeed(state),
        vehicle: v?.id,
    });
    addLog(state, now, `小队${v ? `开着${v.icon}${v.name}` : '步行'}出发前往${locationName(config, state, loc)}。`);
    return { ok: true };
}

/** 这个地点在哪个区、要什么交通工具 */
export function locationTier(config: GameConfig, loc: LocationDef): number {
    return tierAt(config, loc.map);
}

/** 看完广告后立即返回 */
export function finishExpeditionNow(config: GameConfig, state: GameState, expeditionId: number, now: number): ActionResult {
    const ex = state.expeditions.find((e) => e.id === expeditionId);
    if (!ex) return { ok: false, reason: '没有这支小队' };
    ex.returnsAt = now;
    resolveExpeditions(config, state, now);
    return { ok: true };
}

/**
 * 到时间的小队回来。live = true（界面在看）时，打赢的战利品放进 state.pendingHauls 让玩家自己装背包；
 * 否则（测试、模拟、对讲机召回）自动装好带回来。
 */
export function resolveExpeditions(config: GameConfig, state: GameState, now: number, live = false): void {
    const due = state.expeditions.filter((e) => e.returnsAt <= now).sort((a, b) => a.returnsAt - b.returnsAt);
    for (const ex of due) {
        state.expeditions = state.expeditions.filter((e) => e !== ex);
        resolveExpedition(config, state, ex, live);
    }
}

function resolveExpedition(config: GameConfig, state: GameState, ex: ExpeditionState, live: boolean): void {
    const loc = getLocation(config, ex.location);
    const at = ex.returnsAt;
    const squad = ex.squad.filter((id) => state.survivors.some((s) => s.id === id));
    if (!loc || squad.length === 0) return;

    const setup = expeditionSetup(config, loc, squadOf(config, state, squad), survivorBattleLevel(config, state), ex.seed, expeditionEnemyBonus(config, state));
    const { result, fallen, itemsUsed } = fight(config, state, setup);
    let loot: ResourceBag = {};
    let found = '';
    let packNote = '';

    if (result === 'win') {
        addStat(state, 'expeditions_won');
        // 先按“打下前”算战利品（第一次打下拿全额，之后再来打折）
        const lootBag = scaleBag(expeditionLoot(config, state, loc), lootBonus(config, state, squad));
        addStat(state, `clear_${loc.id}`);
        // 战利品要装进背包才能带回来（见 packing.ts）
        const drops = rollDrops(state, loc.drops, false);
        // 以前死在这里的人留下的装备
        const recovered = takeDroppedGear(state, loc.id);
        for (const [id, n] of Object.entries(recovered)) drops[id] = (drops[id] ?? 0) + n;
        if (Object.keys(recovered).length) addLog(state, at, `小队在${locationName(config, state, loc)}找到了战友留下的装备：${formatProps(config, recovered)}。`);
        const pieces = makePieces(config, state, lootBag, drops);
        const cap = haulSections(config, state, squad, vehicleDef(config, ex.vehicle));
        const haul = newHaul(config, state, locationName(config, state, loc), at, pieces, cap.sections, cap.maxWeight);
        if (live) {
            state.pendingHauls = [...(state.pendingHauls ?? []), haul];
            packNote = '战利品摊了一地，等你装背包。';
        } else {
            const home = carryHome(config, state, haul);
            loot = home.loot;
            found = formatProps(config, home.props);
            if (home.left) packNote = `背包装不下，留下了：${home.left}。`;
        }
        state.restockAt[loc.id] = at + config.balance.locationRestockMinutes * 60_000;
        if (!hasFlag(state, clearedFlag(loc.id))) {
            setFlag(state, clearedFlag(loc.id));
            if (loc.firstClearFlag) setFlag(state, loc.firstClearFlag);
            if (loc.firstClearEvent) queueEvent(state, loc.firstClearEvent);
            if (loc.discoversSite) discoverSite(config, state, loc.discoversSite, at);
        }
    } else {
        addStat(state, 'expeditions_lost');
        changeMoodAll(state, -5, `在${locationName(config, state, loc)}吃了败仗`, at, (s) => squad.includes(s.id));
    }
    // 打赢了队友会把倒下的人背回来，只有打输撤退时才会有人回不来
    recordSharedBattle(state, squad);
    const { dead, injured } = resolveFallen(config, state, fallen, at, `在${locationName(config, state, loc)}牺牲了`, result === 'lose', loc.id, hasMedic(config, state, squad) ? 0.5 : 1);
    // 第一次探索回来一定会遇到人；之后打赢时按 recruitChance 偶尔遇到一个
    let rescued = '';
    const place = locationName(config, state, loc);
    const metBefore = (state.candidates ?? []).length;
    if (!hasFlag(state, 'first_recruits')) firstRecruits(config, state, place, at);
    else if (result === 'win' && loc.recruitChance && nextRandom(state) < loc.recruitChance) offerCandidates(config, state, 1, place, at);
    const met = (state.candidates ?? []).length - metBefore;
    if (met > 0) rescued = `路上遇到了 ${met} 个幸存者，等你决定留不留。`;

    const summary =
        (result === 'win'
            ? live
                ? `探索${locationName(config, state, loc)}成功！${packNote}`
                : `探索${locationName(config, state, loc)}成功！带回 ${formatBag(config, loot) || '一些杂物'}。${found ? `还找到了${found}。` : ''}${packNote}`
            : `探索${locationName(config, state, loc)}失败，小队狼狈撤回。`) +
        casualtyText(config, state, injured, dead) +
        rescued +
        usedText(itemsUsed);
    addReport(state, { kind: 'expedition', title: locationName(config, state, loc), at, result, setup, loot, lost: {}, injured, dead, summary });
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

/**
 * 到时间就来一次尸潮。live = true 时（玩家在看界面）不自动结算，而是放进 state.pendingRaid，
 * 由界面用 LiveRaid 让玩家亲手守夜；否则（测试、模拟）直接自动结算。
 */
export function maybeRunRaid(config: GameConfig, state: GameState, now: number, live = false): void {
    if (state.pendingRaid || now < state.nextRaidAt) return;
    const at = state.nextRaidAt;
    state.nextRaidAt = now + config.balance.raidIntervalMinutes * 60_000;
    // 过一夜：轮流守夜（见 watch.ts）
    const { watchers, understaffed } = passNight(config, state, at);
    nightQuirks(config, state, at);
    const raid = currentRaid(config, state, now);
    if (!raid) return;
    // 放过信号弹：今晚一定有尸潮
    if (!state.flare && !rollRaid(config, state, now)) {
        addStat(state, 'quiet_nights');
        addLog(state, at, `🌙 平静的一夜，没有尸潮。守夜的是${watchersText(config, state, watchers)}。`);
        return;
    }
    state.lastNight!.raid = true;
    const wallFactor = understaffed ? config.balance.nightWatch?.understaffedWallFactor ?? 1 : 1;
    if (understaffed) addLog(state, at, '⚠️ 守夜人手不够，尸群摸到栅栏下才被发现！');
    if (live) state.pendingRaid = prepareRaid(config, state, raid, at, wallFactor);
    else runRaid(config, state, raid, at, wallFactor);
}

/**
 * 第一次尸潮提前：第 1 集结束（raids_started）后很快就来一次，让新玩家早点体验守夜。
 * 之后按正常间隔。
 */
export function scheduleFirstRaid(config: GameConfig, state: GameState, now: number): void {
    if (state.raidCount > 0 || state.pendingRaid || !hasFlag(state, 'raids_started') || hasFlag(state, 'first_raid_scheduled')) return;
    setFlag(state, 'first_raid_scheduled');
    state.nextRaidAt = Math.min(state.nextRaidAt, now + config.balance.firstRaidMinutes * 60_000);
}

/** 自动结算一次尸潮（测试、数值模拟、离开界面时用） */
export function runRaid(config: GameConfig, state: GameState, raid: RaidDef, at: number, wallFactor = 1): BattleReport {
    const pending = prepareRaid(config, state, raid, at, wallFactor);
    const battle = new Battle(battleRegistry(config), pending.setup);
    battle.runToEnd();
    return finishRaid(config, state, pending, battle);
}

/** 准备一次尸潮：选人、带物品、算加成、生成战斗参数。之后可以自动结算，也可以交给玩家亲手打 */
export function prepareRaid(config: GameConfig, state: GameState, raid: RaidDef, at: number, wallFactor = 1): PendingRaid {
    const defenders = squadOf(config, state, raidDefenders(config, state));
    const level = survivorBattleLevel(config, state);
    const bloodMoon = nextRaidIsBloodMoon(config, state);
    state.raidCount += 1;
    // 信号弹引来的尸潮更大（用掉一次）
    const flareBonus = state.flare ? config.balance.flare?.raidBonus ?? 0 : 0;
    state.flare = false;
    const enemyBonus = raidEnemyBonus(config, state, at) + flareBonus;
    const options: RaidOptions = { bloodMoon, dog: hasFlag(state, DOG_FLAG), enemyBonus, camp: battleCamp(config, state), gates: campGates(config, state) };
    const setup = raidSetup(config, raid, defenders, barricadeHp(config, state) * wallFactor, level, randomSeed(state), options);
    // 上一晚没修好的栅栏：每个门都带着伤出场（wall.ts）
    const wear = wallWear(state);
    if (wear > 0) setup.allies = setup.allies.map((a) => (a.gate !== undefined ? { ...a, hpRatio: 1 - wear } : a));
    // 死在外面的熟人可能混在尸群里（familiar.ts）
    const familiar = addFamiliar(config, state, setup, Math.max(1, ...setup.enemies.map((e) => e.level ?? 1)), at);
    const carried = equipItems(config, state, setup.allies).map((c) => ({ tag: c.tag, item: c.item.id }));
    const title = `${bloodMoon ? '血月·' : ''}${flareBonus ? '信号弹·' : ''}${raid.name}${enemyBonus > 0 ? ` +${enemyBonus}` : ''}`;
    return { raid: raid.id, at, title, bloodMoon, enemyBonus, setup, carried, repairs: 0, familiar };
}

/** 守夜结束：发奖励或扣物资、处理伤亡、写战报。battle 必须已经分出胜负 */
export function finishRaid(config: GameConfig, state: GameState, pending: PendingRaid, battle: Battle): BattleReport {
    const raid = config.raids.find((r) => r.id === pending.raid) ?? config.raids[0];
    const { at, title, bloodMoon, enemyBonus } = pending;
    const carried: CarriedItem[] = pending.carried.flatMap((c) => {
        const item = config.items.find((x) => x.id === c.item);
        return item ? [{ tag: c.tag, item }] : [];
    });
    const { result, fallen, itemsUsed } = battleOutcome(config, state, battle, carried);
    const setup: BattleSetup = { ...pending.setup, inputs: [...battle.inputs] };
    const survivorIds = new Set(state.survivors.map((s) => s.id));
    const fallenSurvivors = fallen.filter((t) => survivorIds.has(t));
    let loot: ResourceBag = {};
    let found = '';
    const lost: ResourceBag = {};

    if (result === 'win') {
        addStat(state, 'raids_won');
        if (bloodMoon) addStat(state, 'blood_moons_won');
        state.stats.best_raid_level = Math.max(state.stats.best_raid_level ?? 0, enemyBonus);
        state.raidRelief = Math.max(0, state.raidRelief - config.balance.raidScaling.reliefRecoverPerWin);
        const mult = (bloodMoon ? config.balance.bloodMoonRewardMultiplier : 1) * Math.pow(config.balance.raidScaling.rewardGrowth, enemyBonus);
        const reward: ResourceBag = {};
        for (const id of RESOURCE_IDS) if (raid.reward[id]) reward[id] = Math.round(raid.reward[id]! * mult);
        loot = grantResources(config, state, reward);
        found = formatProps(config, rollDrops(state, raid.drops));
        changeMoodAll(state, 3, '守夜守住了', at);
    } else {
        addStat(state, 'raids_lost');
        state.raidRelief += config.balance.raidScaling.reliefPerLoss;
        for (const id of RESOURCE_IDS) {
            if (id === 'cans') continue;
            const amount = Math.floor(state.resources[id] * config.balance.raidLossRatio);
            if (amount > 0) {
                addResource(config, state, id, -amount);
                lost[id] = amount;
            }
        }
        changeMoodAll(state, -10, '尸群冲破了栅栏', at);
    }
    // 栅栏的损伤留到下一晚
    const walls = battle.side('ally').filter((u) => u.def.id === BARRICADE_UNIT);
    const remaining = walls.length ? walls.reduce((sum, u) => sum + (u.alive ? u.hp / u.stats.maxHp : 0), 0) / walls.length : 0;
    recordWallDamage(config, state, remaining, result === 'lose' || walls.some((u) => !u.alive));
    const defenderIds = pending.setup.allies.map((u) => u.tag).filter((t): t is string => !!t && survivorIds.has(t));
    recordSharedBattle(state, defenderIds);
    // 在营地里倒下的人多半能被同伴拖回来：牺牲概率按 raidDeathScale 打折
    const raidScale = config.balance.raidDeathScale ?? 1;
    const { dead, injured } = resolveFallen(config, state, fallenSurvivors, at, '在守夜中牺牲了', true, undefined, (hasMedic(config, state, defenderIds) ? 0.5 : 1) * raidScale);
    // 栅栏被冲破：尸群冲进营地，有人被咬死
    if (result === 'lose') {
        for (let i = 0; i < config.balance.raidBreachDeaths && state.survivors.length > 0; i++) {
            const name = killRandom(config, state, at, '被冲进营地的尸群咬死了');
            if (name) dead.push(name);
        }
    }

    const familiarUnit = battle.side('enemy').find((u) => parseFamiliarTag(u.tag)?.id === pending.familiar);
    const familiarText = pending.familiar ? settleFamiliar(config, state, pending.familiar, !!familiarUnit && !familiarUnit.alive, at) : '';

    const summary =
        familiarText +
        (result === 'win'
            ? `【${title}】营地守住了！${formatBag(config, loot) ? `缴获 ${formatBag(config, loot)}。` : ''}${found ? `还捡到了${found}。` : ''}`
            : `【${title}】尸群冲进了营地，损失了 ${formatBag(config, lost) || '一些物资'}。`) +
        casualtyText(config, state, injured, dead) +
        usedText(itemsUsed);
    return addReport(state, { kind: 'raid', title, at, result, setup, loot, lost, injured, dead, summary });
}

// ---------- 白天的游荡丧尸 ----------

/**
 * 白天晃到营地外的一小群丧尸（stragglers.ts）：用守夜的营地布局打一场小仗（只从一个门来），自动结算。
 * 倒下的人只会受伤、不会牺牲；noticed = 玩家及时派人清理（有奖励），否则门还会被抓挠出额外的损伤。
 */
export function fightStragglers(config: GameConfig, state: GameState, group: StragglerGroup, at: number, noticed: boolean): BattleReport {
    const cfg = config.balance.stragglers!;
    const raid: RaidDef = { id: 'stragglers', name: '游荡的丧尸', enemies: group.enemies, timeLimit: cfg.timeLimit, reward: {}, sides: 1 };
    const defenders = squadOf(config, state, raidDefenders(config, state));
    // 种子 % 4 决定从哪个门来（attackedGates）
    const seed = Math.floor(nextRandom(state) * 2 ** 28) * 4 + group.gate;
    const setup = raidSetup(config, raid, defenders, barricadeHp(config, state), survivorBattleLevel(config, state), seed, { camp: battleCamp(config, state), gates: campGates(config, state) });
    const wear = wallWear(state);
    if (wear > 0) setup.allies = setup.allies.map((a) => (a.gate !== undefined ? { ...a, hpRatio: 1 - wear } : a));
    const battle = new Battle(battleRegistry(config), setup);
    battle.runToEnd();
    const { result, fallen } = battleOutcome(config, state, battle, []);
    const walls = battle.side('ally').filter((u) => u.gate !== undefined);
    const remaining = walls.length ? walls.reduce((sum, u) => sum + (u.alive ? u.hp / u.stats.maxHp : 0), 0) / walls.length : 1;
    recordWallDamage(config, state, remaining, walls.some((u) => !u.alive));
    if (!noticed && (config.balance.wallRepair?.maxWear ?? 0) > 0) state.wallWear = Math.min(config.balance.wallRepair!.maxWear, wallWear(state) + cfg.wallDamage);
    const survivorIds = new Set(state.survivors.map((s) => s.id));
    const { injured } = resolveFallen(config, state, fallen.filter((t) => survivorIds.has(t)), at, '', false);
    let loot: ResourceBag = {};
    if (result === 'win') {
        addStat(state, 'stragglers_cleared');
        if (noticed) loot = grantResources(config, state, cfg.reward);
    }
    const title = '游荡的丧尸';
    const head = result === 'win' ? (noticed ? '把晃到营地外的丧尸清理掉了' : '丧尸摸到了门口，大家手忙脚乱地把它们打退了') : '丧尸在门口闹了一阵，大家没能打退它们，只好关紧门等它们散去';
    const summary = `【${title}】${head}。${formatBag(config, loot) ? `捡到 ${formatBag(config, loot)}。` : ''}${!noticed ? '门被抓挠得不轻。' : ''}${casualtyText(config, state, injured, [])}`;
    return addReport(state, { kind: 'raid', title, at, result, setup: { ...setup, inputs: [] }, loot, lost: {}, injured, dead: [], summary });
}

// ---------- 伤员 ----------

/** 战报里的伤亡描述，比如“德里克受了伤。☠ 汉克牺牲了。” */
export function casualtyText(config: GameConfig, state: GameState, injured: string[], dead: string[]): string {
    const hurt = injured.length ? `${injured.map((id) => survivorName(config, state, id)).join('、')}受了伤。` : '';
    const killed = dead.length ? `☠ ${dead.join('、')}牺牲了。` : '';
    return hurt + killed;
}

/** 到时间的伤员自然痊愈 */
export function recoverInjuries(config: GameConfig, state: GameState, now: number): void {
    for (const s of state.survivors) {
        if (s.injured && s.recoverAt !== null && s.recoverAt <= now) {
            healSurvivorState(s);
            addLog(state, now, `${survivorName(config, state, s.id)}的伤好了。`);
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
    addLog(state, now, `${survivorName(config, state, s.id)}在医务室接受了治疗。`);
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

export function formatBag(config: GameConfig, bag: ResourceBag): string {
    return RESOURCE_IDS.filter((id) => bag[id])
        .map((id) => `${config.resources.find((r) => r.id === id)?.icon ?? id}${bag[id]}`)
        .join(' ');
}
