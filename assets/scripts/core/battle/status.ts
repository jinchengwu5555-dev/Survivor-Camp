// 【模块 5a】状态系统：眩晕 / 定身 / 沉默等控制、增减益、持续伤害、护盾。

import { BattleContext, BattleUnit, ModifierKey, StatusInstance } from './types';

export function applyStatus(
    ctx: BattleContext,
    target: BattleUnit,
    statusId: string,
    duration: number,
    value: number,
    source: BattleUnit | null,
): void {
    if (!target.alive) return;
    const def = ctx.registry.status(statusId);
    const existing = target.statuses.find((s) => s.def.id === statusId);
    if (existing) {
        existing.remaining = Math.max(existing.remaining, duration);
        existing.value = Math.max(existing.value, value);
        existing.sourceUid = source?.uid ?? existing.sourceUid;
        if (def.stacking === 'stack') existing.stacks = Math.min(def.maxStacks ?? Infinity, existing.stacks + 1);
        ctx.emit({ t: ctx.time, type: 'statusOn', target: target.uid, status: statusId, stacks: existing.stacks });
        return;
    }
    const inst: StatusInstance = {
        def,
        remaining: duration,
        stacks: 1,
        value,
        tickTimer: def.dot?.interval ?? 0,
        sourceUid: source?.uid ?? null,
    };
    target.statuses.push(inst);
    ctx.emit({ t: ctx.time, type: 'statusOn', target: target.uid, status: statusId, stacks: 1 });
}

/**
 * 每帧调用：移除上一帧到期的状态、倒计时、结算持续伤害。
 * 到期的状态在下一帧开头才移除，保证持续 1 秒的眩晕完整覆盖 1 秒内的所有帧。
 */
export function updateStatuses(ctx: BattleContext, unit: BattleUnit, dt: number): void {
    for (const st of [...unit.statuses]) {
        if (!unit.alive) return;
        if (st.remaining <= 1e-9) {
            removeStatus(ctx, unit, st);
            continue;
        }
        st.remaining -= dt;
        if (st.def.dot) {
            st.tickTimer -= dt;
            while (st.tickTimer <= 1e-9 && unit.alive) {
                st.tickTimer += st.def.dot.interval;
                ctx.damage.deal(ctx, {
                    source: ctx.getUnit(st.sourceUid) ?? null,
                    target: unit,
                    base: st.value * st.stacks,
                    damageType: st.def.dot.damageType,
                    canCrit: false,
                    skill: st.def.id,
                });
            }
        }
    }
}

export function removeStatus(ctx: BattleContext, unit: BattleUnit, st: StatusInstance): void {
    const i = unit.statuses.indexOf(st);
    if (i < 0) return;
    unit.statuses.splice(i, 1);
    ctx.emit({ t: ctx.time, type: 'statusOff', target: unit.uid, status: st.def.id });
}

// ---------- 控制判定 ----------

function hasControl(unit: BattleUnit, key: 'stun' | 'root' | 'silence'): boolean {
    return unit.statuses.some((s) => s.def.control?.[key]);
}

/** 能否移动：没被眩晕、没被定身 */
export function canMove(unit: BattleUnit): boolean {
    return unit.alive && !hasControl(unit, 'stun') && !hasControl(unit, 'root');
}

/** 能否普攻：没被眩晕 */
export function canAct(unit: BattleUnit): boolean {
    return unit.alive && !hasControl(unit, 'stun');
}

/** 能否放技能：没被眩晕、没被沉默 */
export function canCast(unit: BattleUnit): boolean {
    return canAct(unit) && !hasControl(unit, 'silence');
}

// ---------- 属性修正 ----------

export function modifierSum(unit: BattleUnit, key: ModifierKey): number {
    return unit.statuses.reduce((sum, s) => sum + (s.def.modifiers?.[key] ?? 0) * s.stacks, 0);
}

/** 带增减益的实际属性，最低降到原值的 10% */
export function effectiveAtk(unit: BattleUnit): number {
    return unit.stats.atk * Math.max(0.1, 1 + modifierSum(unit, 'atk'));
}

export function effectiveDef(unit: BattleUnit): number {
    return Math.max(0, unit.stats.def * (1 + modifierSum(unit, 'def')));
}

export function effectiveMoveSpeed(unit: BattleUnit): number {
    return unit.stats.moveSpeed * Math.max(0.1, 1 + modifierSum(unit, 'moveSpeed'));
}

export function effectiveAttackInterval(unit: BattleUnit): number {
    return unit.stats.attackInterval / Math.max(0.1, 1 + modifierSum(unit, 'attackSpeed'));
}

/** 用护盾吸收伤害，返回吸收掉的量 */
export function absorbWithShields(ctx: BattleContext, unit: BattleUnit, amount: number): number {
    let absorbed = 0;
    for (const st of [...unit.statuses]) {
        if (!st.def.shield || amount - absorbed <= 0) continue;
        const take = Math.min(st.value, amount - absorbed);
        st.value -= take;
        absorbed += take;
        if (st.value <= 0) removeStatus(ctx, unit, st);
    }
    return absorbed;
}
