// 栅栏耐久：守夜时栅栏被尸群打坏的部分会留下来（state.wallWear），下一晚出场时就是带伤的；
// 在栅栏的建筑面板里花木材修补。尸群冲破栅栏（守夜失败）时损伤到最大。
// 没有界面在看（测试、模拟）时，有木材就自动修。

import { addResource, canAfford } from './economy';
import { addLog, addStat } from './state';
import { ActionResult, GameConfig, GameState } from './types';

export function wallWear(state: GameState): number {
    return state.wallWear ?? 0;
}

/** 现在的耐久百分比（100 = 完好） */
export function wallDurability(state: GameState): number {
    return Math.round((1 - wallWear(state)) * 100);
}

/** 修好要多少木材 */
export function wallRepairCost(config: GameConfig, state: GameState): number {
    const cfg = config.balance.wallRepair;
    const wear = wallWear(state);
    if (!cfg || wear <= 0) return 0;
    const level = state.buildings.wall?.level ?? 0;
    return Math.ceil(wear * 100 * cfg.woodPerPercent * (1 + level * cfg.perLevel));
}

/** 守夜结束：按栅栏剩下的生命记下损伤 */
export function recordWallDamage(config: GameConfig, state: GameState, remainingRatio: number, broken: boolean): void {
    const max = config.balance.wallRepair?.maxWear ?? 0;
    if (max <= 0) return;
    state.wallWear = broken ? max : Math.min(max, Math.max(0, 1 - remainingRatio));
}

export function repairBlocker(config: GameConfig, state: GameState): string | null {
    if (wallWear(state) <= 0) return '栅栏完好，不用修';
    if (!canAfford(state, { wood: wallRepairCost(config, state) })) return '木材不够';
    return null;
}

export function repairWall(config: GameConfig, state: GameState, now: number): ActionResult {
    const blocker = repairBlocker(config, state);
    if (blocker) return { ok: false, reason: blocker };
    const cost = wallRepairCost(config, state);
    addResource(config, state, 'wood', -cost);
    state.wallWear = 0;
    addStat(state, 'wall_repairs');
    addLog(state, now, `🔨 栅栏修好了，花了🪵${cost}。`);
    return { ok: true, message: `栅栏修好了（🪵-${cost}）` };
}
