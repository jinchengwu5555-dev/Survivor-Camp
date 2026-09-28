// 建造 / 升级，以及幸存者的工作分配。

import { ActionResult, GameConfig, GameState } from './types';
import { canAfford, getBuildingDef, hqLevel, pay, workerSlots } from './economy';
import { addLog } from './state';

export function activeUpgrades(state: GameState): number {
    return Object.values(state.buildings).filter((b) => b.upgradeEndsAt !== null).length;
}

/** 检查能否升级；返回 null 表示可以 */
export function upgradeBlocker(config: GameConfig, state: GameState, buildingId: string): string | null {
    const def = getBuildingDef(config, buildingId);
    const b = state.buildings[buildingId];
    if (!def || !b) return '建筑不存在';
    if (b.upgradeEndsAt !== null) return '正在升级中';
    const next = def.levels[b.level];
    if (!next) return '已达到最高等级';
    if (next.requiresHq && hqLevel(state) < next.requiresHq) return `需要指挥部 ${next.requiresHq} 级`;
    if (activeUpgrades(state) >= config.balance.buildQueueSize) return '建造队列已满';
    if (!canAfford(state, next.cost)) return '资源不足';
    return null;
}

export function startUpgrade(config: GameConfig, state: GameState, buildingId: string, now: number): ActionResult {
    const blocker = upgradeBlocker(config, state, buildingId);
    if (blocker) return { ok: false, reason: blocker };
    const def = getBuildingDef(config, buildingId)!;
    const b = state.buildings[buildingId];
    const next = def.levels[b.level];
    pay(state, next.cost);
    b.upgradeEndsAt = now + next.buildSeconds * 1000;
    return { ok: true };
}

/** 立即完成升级（看广告加速时调用） */
export function finishUpgradeNow(config: GameConfig, state: GameState, buildingId: string, now: number): ActionResult {
    const b = state.buildings[buildingId];
    if (!b || b.upgradeEndsAt === null) return { ok: false, reason: '没有进行中的升级' };
    b.upgradeEndsAt = now;
    completeUpgrades(config, state, now);
    return { ok: true };
}

export function completeUpgrades(config: GameConfig, state: GameState, now: number): void {
    for (const b of Object.values(state.buildings)) {
        if (b.upgradeEndsAt === null || b.upgradeEndsAt > now) continue;
        b.level += 1;
        b.upgradeEndsAt = null;
        const name = getBuildingDef(config, b.id)?.name ?? b.id;
        addLog(state, now, b.level === 1 ? `${name}建好了。` : `${name}升到了 ${b.level} 级。`);
    }
}

export function assignSurvivor(config: GameConfig, state: GameState, survivorId: string, buildingId: string | null): ActionResult {
    const s = state.survivors.find((x) => x.id === survivorId);
    if (!s) return { ok: false, reason: '找不到这个幸存者' };
    if (buildingId === null) {
        s.assignment = null;
        return { ok: true };
    }
    if (s.injured) return { ok: false, reason: '受伤了，需要先治疗' };
    const slots = workerSlots(config, state, buildingId);
    if (slots <= 0) return { ok: false, reason: '这个建筑不需要工人' };
    const used = state.survivors.filter((x) => x.assignment === buildingId && x.id !== survivorId).length;
    if (used >= slots) return { ok: false, reason: '岗位已满' };
    s.assignment = buildingId;
    return { ok: true };
}
