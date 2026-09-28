// 换营地：探索中发现新的营地地点，可以举营搬过去。每个地点有不同的效果（见 sites.json）。
//
// 搬迁的代价：
//   - 路上会遭遇伏击（所有能战斗的人上阵），倒下的人可能牺牲
//   - 只能带走一部分物资（罐头和工坊物品全部带走）
//   - 栅栏要重建：保留 wallRetention 比例的等级，但不低于新地点自带的 minWallLevel
//   - 其他建筑保留（设备带走了），搬完后 cooldownDays 天内不能再搬

import { Battle } from './battle/Battle';
import { battleRegistry, casualtyText, availableFighters, squadOf } from './combat';
import { survivorBattleLevel } from './economy';
import { conditionMet, getEventDef, queueEvent } from './events';
import { nextRandom } from './rng';
import { resolveFallen } from './roster';
import { currentSite, getSite } from './siteMods';
import { addLog, addStat, currentDay } from './state';
import { ActionResult, BattleReport, GameConfig, GameState, RESOURCE_IDS, ResourceBag, SiteDef } from './types';

const MAX_REPORTS = 10;

/** 可以搬去的地点（已发现、不是当前营地） */
export function relocationTargets(config: GameConfig, state: GameState): SiteDef[] {
    return state.discoveredSites.filter((id) => id !== state.siteId).flatMap((id) => getSite(config, id) ?? []);
}

export function relocationFoodCost(config: GameConfig, state: GameState): number {
    return state.survivors.length * config.balance.relocation.foodPerSurvivor;
}

/** 检查能否搬迁；返回 null 表示可以 */
export function relocationBlocker(config: GameConfig, state: GameState, siteId: string, now: number): string | null {
    const site = getSite(config, siteId);
    if (!site) return '没有这个地点';
    if (!state.discoveredSites.includes(siteId)) return '还没发现这个地点';
    if (siteId === state.siteId) return '已经在这里了';
    if (state.expeditions.length > 0) return '还有小队在外面，等他们回来';
    if (state.lastRelocationAt !== null) {
        const days = config.balance.relocation.cooldownDays;
        const readyAt = state.lastRelocationAt + days * config.balance.dayLengthMinutes * 60_000;
        if (now < readyAt) return `刚搬过家，${days} 天内不能再搬`;
    }
    if (state.resources.food < relocationFoodCost(config, state)) return `路上的口粮不够（需要 ${relocationFoodCost(config, state)} 食物）`;
    return null;
}

export function relocate(config: GameConfig, state: GameState, siteId: string, now: number): ActionResult {
    const blocker = relocationBlocker(config, state, siteId, now);
    if (blocker) return { ok: false, reason: blocker };
    const from = currentSite(config, state);
    const site = getSite(config, siteId)!;
    const b = config.balance;

    state.resources.food -= relocationFoodCost(config, state);

    // 路上的伏击战
    const fighters = squadOf(config, state, availableFighters(config, state).map((s) => s.id));
    const setup = {
        allies: fighters.map((m) => ({ unit: m.unit, level: survivorBattleLevel(config, state), tag: m.id })),
        enemies: site.journey.enemies,
        timeLimit: site.journey.timeLimit,
        timeoutResult: 'win' as const,
        seed: Math.floor(nextRandom(state) * 2 ** 31),
        autoCastActive: true,
    };
    const battle = new Battle(battleRegistry(config), setup);
    const result = fighters.length > 0 ? battle.runToEnd() : 'lose';
    const fallen = battle.side('ally').filter((u) => !u.alive && u.tag).map((u) => u.tag!);
    const { dead, injured } = resolveFallen(config, state, fallen, now, `在迁往${site.name}的路上牺牲了`);

    // 只能带走一部分物资
    const lost: ResourceBag = {};
    for (const id of RESOURCE_IDS) {
        if (id === 'cans') continue;
        const drop = Math.floor(state.resources[id] * (1 - b.relocation.carryRatio));
        if (drop > 0) {
            state.resources[id] -= drop;
            lost[id] = drop;
        }
    }

    // 栅栏重建，其他建筑保留；正在升级的栅栏作废
    const wall = state.buildings['wall'];
    if (wall) {
        wall.level = Math.max(site.minWallLevel, Math.floor(wall.level * site.wallRetention), 1);
        wall.upgradeEndsAt = null;
    }
    for (const s of state.survivors) s.assignment = null;

    state.siteId = siteId;
    state.lastRelocationAt = now;
    addStat(state, 'relocations');
    // 到达事件要满足它自己的条件（比如水坝的重逢需要伊森还活着）
    const arrival = site.arrivalEvent ? getEventDef(config, site.arrivalEvent) : undefined;
    if (arrival && conditionMet(config, state, arrival.conditions, now)) queueEvent(state, arrival.id);

    const summary =
        `全营地从${from?.name ?? '旧营地'}搬到了${site.icon}${site.name}。` +
        (result === 'win' ? '路上击退了伏击。' : '路上遭遇伏击，大家拼死冲了过去。') +
        casualtyText(config, state, injured, dead) +
        '带不走的物资只能留下了。';
    const report: BattleReport = {
        id: state.nextId++,
        kind: 'journey',
        title: `迁往${site.name}`,
        at: now,
        result,
        setup,
        loot: {},
        lost,
        injured,
        dead,
        summary,
    };
    state.reports.push(report);
    if (state.reports.length > MAX_REPORTS) state.reports.splice(0, state.reports.length - MAX_REPORTS);
    addLog(state, now, summary);
    addLog(state, now, `新营地从第 ${currentDay(config, state, now)} 天开始。记得重新分配工作、修好栅栏。`);
    return { ok: true };
}
