// 【模块 1】角色配置：根据 units.json 的基础属性和成长值，生成战斗中的角色实例。

import { BattleRegistry } from './registry';
import { BattleUnit, Side, StatKey, UnitDef, UnitStats } from './types';

const STAT_KEYS: StatKey[] = ['maxHp', 'atk', 'def', 'moveSpeed', 'attackRange', 'attackInterval', 'critRate', 'critDamage'];

/** 某个等级的属性 = 基础属性 + 成长值 × (等级 - 1) */
export function statsAtLevel(def: UnitDef, level: number): UnitStats {
    const stats = { ...def.stats };
    const lv = Math.max(1, level);
    for (const key of STAT_KEYS) stats[key] += (def.growth?.[key] ?? 0) * (lv - 1);
    return stats;
}

export function createBattleUnit(
    registry: BattleRegistry,
    uid: number,
    unitId: string,
    side: Side,
    level: number,
    x: number,
    y = 0,
): BattleUnit {
    const def = registry.unit(unitId);
    const stats = statsAtLevel(def, level);
    return {
        uid,
        def,
        side,
        level,
        stats,
        hp: stats.maxHp,
        x,
        y,
        alive: true,
        attackCooldown: 0,
        targetUid: null,
        skills: def.skills.map((id) => {
            const skill = registry.skill(id);
            return { def: skill, cooldown: skill.initialCooldown ?? 0, fired: false };
        }),
        statuses: [],
    };
}
