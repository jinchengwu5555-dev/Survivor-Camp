// 白天的游荡丧尸（balance.stragglers）：白天时不时有一小群丧尸从某个方向晃到营地外，
// 过几分钟就会摸到门口。玩家及时点一下派人清理，打完有一点战利品；
// 没人管，它们自己撞上门，打完也没有奖励，门还会被抓挠出额外的损伤。
// 战斗用守夜的营地布局（只从一个门来），自动结算，战报可以回放。
// 没有界面在看（测试、模拟）时一出现就当作玩家去清理了。

import { UnitSetup } from './battle/Battle';
import { timeOfDay } from './clock';
import { fightStragglers, raidEnemyBonus } from './combat';
import { nextRandom } from './rng';
import { addLog, currentDay, hasFlag } from './state';
import { BattleReport, GameConfig, GameState, StragglerGroup } from './types';

/** 白天：早上 7 点到晚上 7 点 */
export function isDaytime(config: GameConfig, state: GameState, now: number): boolean {
    const { hour } = timeOfDay(config, state, now);
    return hour >= 7 && hour < 19;
}

export function activeStragglers(state: GameState): StragglerGroup[] {
    return state.stragglers ?? [];
}

/** 每次 tick：到时间就可能刷出一群；摸到门口的自己打起来 */
export function updateStragglers(config: GameConfig, state: GameState, now: number, live: boolean): BattleReport[] {
    const cfg = config.balance.stragglers;
    if (!cfg || state.gameOver) return [];
    const reports: BattleReport[] = [];
    for (const g of [...activeStragglers(state)]) {
        if (g.arriveAt <= now) {
            const r = resolveStragglers(config, state, g.id, g.arriveAt, false);
            if (r) reports.push(r);
        }
    }
    if (state.nextStragglerAt === undefined) state.nextStragglerAt = now + cfg.intervalMinutes * 60_000;
    if (now < state.nextStragglerAt) return reports;
    state.nextStragglerAt = now + cfg.intervalMinutes * 60_000 * (0.6 + nextRandom(state) * 0.8);
    const ready = hasFlag(state, 'raids_started') && currentDay(config, state, now) >= cfg.minDay && !state.pendingRaid;
    if (!ready || !isDaytime(config, state, now) || activeStragglers(state).length >= cfg.maxGroups) return reports;
    if (nextRandom(state) >= cfg.chance) return reports;
    const group = spawnStragglers(config, state, now);
    if (!live) {
        const r = resolveStragglers(config, state, group.id, now, true);
        if (r) reports.push(r);
    }
    return reports;
}

export function spawnStragglers(config: GameConfig, state: GameState, now: number): StragglerGroup {
    const cfg = config.balance.stragglers!;
    const [lo, hi] = cfg.size;
    const n = lo + Math.floor(nextRandom(state) * (hi - lo + 1));
    const level = 1 + raidEnemyBonus(config, state, now);
    const enemies: UnitSetup[] = Array.from({ length: n }, (_, i) => ({
        unit: cfg.units[Math.floor(nextRandom(state) * cfg.units.length)],
        level,
        spawnAt: i * 0.6,
    }));
    const group: StragglerGroup = {
        id: state.nextId++,
        gate: Math.floor(nextRandom(state) * 4),
        enemies,
        spawnedAt: now,
        arriveAt: now + cfg.arriveMinutes * 60_000,
    };
    state.stragglers = [...activeStragglers(state), group];
    addLog(state, now, `🧟 有一小群丧尸朝营地晃过来了，快派人去清理！`);
    return group;
}

/** 打这一群：noticed = 玩家及时派人去了（有奖励）；否则是它们自己摸到了门口 */
export function resolveStragglers(config: GameConfig, state: GameState, id: number, now: number, noticed: boolean): BattleReport | null {
    const group = activeStragglers(state).find((g) => g.id === id);
    if (!group) return null;
    state.stragglers = activeStragglers(state).filter((g) => g.id !== id);
    return fightStragglers(config, state, group, now, noticed);
}
