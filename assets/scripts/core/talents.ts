// 天赋：每个人 1～2 个（有名有姓的角色写在 survivors.json，流浪者随机抽 1 个），会真实影响
//   work         干活产量（可以限定某个建筑）
//   combat       战斗时的攻击 / 生命倍率
//   recovery     受伤后养伤时间倍率（0.5 = 好得快一倍）
//   scout        侦察来回时间倍率
//   moodRecovery 心情恢复速度倍率
// 天赋定义在 talents.json。
// 这里的 work / combat / scout 倍率是“这个人”的总倍率：
//   天赋 × 装备（gear.ts）× 精力（守夜太累会打折扣，watch.ts）× 心情档位（mood.ts）。

import { gearCombat, gearScout, gearWork } from './gear';
import { moodTier } from './mood';
import { quirkCombat, quirkWork } from './recruits';
import { survivorInfo } from './roster';
import { GameConfig, GameState, SurvivorState, TalentDef } from './types';

/** 精力的影响：精力不低于 tiredBelow 时没影响，越低越差，精力 0 时只剩 minFactor */
export function sleepFactor(config: GameConfig, s: SurvivorState | undefined): number {
    const cfg = config.balance.nightWatch;
    const sleep = s?.sleep ?? 100;
    if (!cfg || sleep >= cfg.tiredBelow) return 1;
    return cfg.minFactor + ((1 - cfg.minFactor) * sleep) / cfg.tiredBelow;
}

export function talentDef(config: GameConfig, id: string): TalentDef | undefined {
    return config.talents.find((t) => t.id === id);
}

/** 这个人的天赋（流浪者的在存档 profile 里） */
export function talentsOf(config: GameConfig, state: GameState, survivorId: string): TalentDef[] {
    const s = state.survivors.find((x) => x.id === survivorId);
    const ids = s?.profile?.talents ?? config.survivors.find((d) => d.id === survivorId)?.talents ?? [];
    return ids.flatMap((id) => {
        const t = talentDef(config, id);
        return t ? [t] : [];
    });
}

/** 在 buildingId 干活时的产量倍率 */
export function workMultiplier(config: GameConfig, state: GameState, survivorId: string, buildingId: string): number {
    let mult = 1;
    for (const t of talentsOf(config, state, survivorId)) {
        const w = t.effects.work;
        if (w && (!w.building || w.building === buildingId)) mult *= w.mult;
    }
    const s = state.survivors.find((x) => x.id === survivorId);
    return mult * gearWork(config, state, survivorId, buildingId) * sleepFactor(config, s) * (s ? moodTier(s.mood).work : 1) * quirkWork(config, s);
}

export function combatMultiplier(config: GameConfig, state: GameState, survivorId: string): { atk: number; hp: number } {
    let atk = 1;
    let hp = 1;
    for (const t of talentsOf(config, state, survivorId)) {
        atk *= t.effects.combat?.atk ?? 1;
        hp *= t.effects.combat?.hp ?? 1;
    }
    const g = gearCombat(config, state, survivorId);
    const s = state.survivors.find((x) => x.id === survivorId);
    const tired = sleepFactor(config, s);
    const q = quirkCombat(config, s);
    // 浴火重生：每涅槃一次攻击永久 +5%
    if (talentsOf(config, state, survivorId).some((t) => t.id === 'phoenix')) atk *= 1 + 0.05 * (state.phoenix?.rebirths ?? 0);
    return { atk: atk * g.atk * tired * (s ? moodTier(s.mood).atk : 1) * q.atk, hp: hp * g.hp * q.hp };
}

function product(config: GameConfig, state: GameState, survivorId: string, key: 'recovery' | 'scout' | 'moodRecovery'): number {
    return talentsOf(config, state, survivorId).reduce((m, t) => m * (t.effects[key] ?? 1), 1);
}

export function recoveryMultiplier(config: GameConfig, state: GameState, survivorId: string): number {
    return product(config, state, survivorId, 'recovery');
}

export function scoutMultiplier(config: GameConfig, state: GameState, survivorId: string): number {
    // 斥候：侦察跑得快
    const scout = survivorInfo(config, state, survivorId)?.specialty === 'scout' ? 0.75 : 1;
    return product(config, state, survivorId, 'scout') * gearScout(config, state, survivorId) * scout;
}

export function moodRecoveryMultiplier(config: GameConfig, state: GameState, survivorId: string): number {
    return product(config, state, survivorId, 'moodRecovery');
}

/** 流浪者能抽到的天赋 */
export function wandererTalentPool(config: GameConfig): TalentDef[] {
    return config.talents.filter((t) => t.wanderer !== false);
}
