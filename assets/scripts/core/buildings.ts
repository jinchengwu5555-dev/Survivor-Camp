// 建造 / 升级，以及幸存者的工作分配。

import { ActionResult, BuildingDef, BuildingStage, GameConfig, GameState } from './types';
import { canAfford, getBuildingDef, hqLevel, pay, workerSlots } from './economy';
import { addLog, addStat } from './state';

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
    addStat(state, 'upgrades');
    return { ok: true };
}

/** 看一次广告能减少多少毫秒：剩余时间的一定比例，但至少 minMinutes 分钟 */
export function adSpeedUpMs(config: GameConfig, remainingMs: number): number {
    const { minMinutes, fraction } = config.balance.adSpeedUp;
    return Math.max(minMinutes * 60_000, remainingMs * fraction);
}

/** 看完广告后加速升级；剩余时间不够减就直接完成 */
export function speedUpUpgrade(config: GameConfig, state: GameState, buildingId: string, now: number): ActionResult {
    const b = state.buildings[buildingId];
    if (!b || b.upgradeEndsAt === null) return { ok: false, reason: '没有进行中的升级' };
    const remaining = Math.max(0, b.upgradeEndsAt - now);
    b.upgradeEndsAt = now + Math.max(0, remaining - adSpeedUpMs(config, remaining));
    completeUpgrades(config, state, now);
    return { ok: true, message: b.upgradeEndsAt === null ? '升级完成！' : '升级时间缩短了' };
}

export function completeUpgrades(config: GameConfig, state: GameState, now: number): void {
    for (const b of Object.values(state.buildings)) {
        if (b.upgradeEndsAt === null || b.upgradeEndsAt > now) continue;
        b.level += 1;
        b.upgradeEndsAt = null;
        const def = getBuildingDef(config, b.id);
        const name = def?.name ?? b.id;
        const stage = def?.stages?.find((st) => st.level === b.level);
        if (stage && b.level > 1) addLog(state, now, `✨ ${name}升级成了${stage.icon}${stage.name}！${stage.description ?? ''}`);
        else addLog(state, now, b.level === 1 ? `${def ? buildingLabel(def, 1) : name}建好了。` : `${def ? buildingLabel(def, b.level) : name}升到了 ${b.level} 级。`);
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
    if (state.expeditions.some((e) => e.squad.includes(survivorId))) return { ok: false, reason: '正在外面探索' };
    if ((state.scouts ?? []).some((s) => s.survivor === survivorId)) return { ok: false, reason: '正在外面侦察' };
    if ((state.surveys ?? []).some((s) => s.squad.includes(survivorId))) return { ok: false, reason: '正在外面勘察' };
    const slots = workerSlots(config, state, buildingId);
    if (slots <= 0) return { ok: false, reason: '这个建筑不需要工人' };
    const used = state.survivors.filter((x) => x.assignment === buildingId && x.id !== survivorId).length;
    if (used >= slots) return { ok: false, reason: '岗位已满' };
    s.assignment = buildingId;
    return { ok: true };
}

/** 这个等级是哪个阶段（篝火 / 烤架 / 厨房……）；没写 stages 的建筑用自己的名字和图标 */
export function buildingStage(def: BuildingDef, level: number): BuildingStage {
    const stages = def.stages ?? [];
    let stage: BuildingStage = { level: 0, name: def.name, icon: def.icon ?? '🏠', description: def.description };
    for (const s of stages) if (level >= s.level) stage = s;
    if (level <= 0 && stages.length > 0) stage = stages[0];
    return stage;
}

/** 下一个阶段（升到几级会变样）；已经是最后一个阶段时返回 undefined */
export function nextBuildingStage(def: BuildingDef, level: number): BuildingStage | undefined {
    return (def.stages ?? []).find((s) => s.level > level);
}

/** 界面上显示的名字，比如“🔥篝火 Lv2” */
export function buildingLabel(def: BuildingDef, level: number): string {
    const st = buildingStage(def, level);
    return `${st.icon}${st.name}`;
}
