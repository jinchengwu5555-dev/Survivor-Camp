// 【模块 2】技能系统：触发条件、目标选择、冷却、效果执行。
//
// 触发方式：
//   active      玩家手动点击释放（只看冷却，不看距离）；autoCastActive 打开时按 auto 处理
//   auto        冷却好了、条件满足时自动释放
//   onAttack    普攻命中时按概率触发
//   battleStart 开战时触发一次
//   hpBelow     生命低于比例时触发一次
//   onDeath     死亡时触发
//   enemyNear   敌人走到 distance 格以内时触发一次（栅栏上的陷阱）
//   shieldBroken 自己的护盾被打光时触发一次

import { nextRandom, pickOne } from '../rng';
import { heal } from './damage';
import { applyStatus, canCast, effectiveAtk } from './status';
import { BattleContext, BattleUnit, SkillDef, SkillEffect, SkillState, SkillTargeting, TargetRule } from './types';

const ENEMY_RULES: TargetRule[] = ['currentTarget', 'nearestEnemy', 'randomEnemy', 'allEnemies'];

export function enemiesOf(ctx: BattleContext, unit: BattleUnit): BattleUnit[] {
    return ctx.units.filter((u) => u.alive && u.side !== unit.side);
}

/** 队友（不含栅栏这类建筑） */
export function alliesOf(ctx: BattleContext, unit: BattleUnit): BattleUnit[] {
    return ctx.units.filter((u) => u.alive && u.side === unit.side && u.def.faction !== 'structure');
}

export function nearest(from: BattleUnit, candidates: BattleUnit[]): BattleUnit | undefined {
    let best: BattleUnit | undefined;
    for (const c of candidates) {
        if (!best || Math.abs(c.x - from.x) < Math.abs(best.x - from.x)) best = c;
    }
    return best;
}

export function resolveTargets(ctx: BattleContext, caster: BattleUnit, targeting: SkillTargeting): BattleUnit[] {
    const enemies = enemiesOf(ctx, caster);
    const allies = alliesOf(ctx, caster);
    let primary: BattleUnit[];
    switch (targeting.rule) {
        case 'self':
            primary = [caster];
            break;
        case 'currentTarget': {
            const t = ctx.getUnit(caster.targetUid);
            primary = t?.alive ? [t] : [nearest(caster, enemies)].filter(isUnit);
            break;
        }
        case 'nearestEnemy':
            primary = [nearest(caster, enemies)].filter(isUnit);
            break;
        case 'randomEnemy':
            primary = [pickOne(ctx, enemies)].filter(isUnit);
            break;
        case 'lowestHpAlly': {
            const sorted = [...allies].sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
            primary = sorted.slice(0, 1);
            break;
        }
        case 'allAllies':
            primary = allies;
            break;
        case 'allEnemies':
            primary = enemies;
            break;
    }
    if (!targeting.radius || primary.length === 0) return primary;

    const center = primary[0];
    const result = [...primary];
    for (const u of ctx.units) {
        if (u.alive && u.side === center.side && !result.includes(u) && Math.abs(u.x - center.x) <= targeting.radius) {
            result.push(u);
        }
    }
    return result;
}

function isUnit(u: BattleUnit | null | undefined): u is BattleUnit {
    return !!u;
}

/** 执行一个技能：选目标 → 进入冷却 → 对每个目标执行所有效果 */
export function castSkill(ctx: BattleContext, caster: BattleUnit, state: SkillState): boolean {
    const targets = resolveTargets(ctx, caster, state.def.targeting);
    if (targets.length === 0) return false;
    state.cooldown = state.def.cooldown;
    ctx.emit({ t: ctx.time, type: 'skill', source: caster.uid, skill: state.def.id, targets: targets.map((t) => t.uid) });
    for (const effect of state.def.effects) {
        for (const target of targets) applyEffect(ctx, caster, target, effect, state.def);
    }
    return true;
}

function applyEffect(ctx: BattleContext, caster: BattleUnit, target: BattleUnit, effect: SkillEffect, skill: SkillDef): void {
    const atk = effectiveAtk(caster);
    switch (effect.type) {
        case 'damage':
            ctx.damage.deal(ctx, {
                source: caster,
                target,
                base: effect.ratio * atk,
                damageType: effect.damageType ?? 'physical',
                canCrit: effect.canCrit ?? true,
                skill: skill.id,
            });
            break;
        case 'heal':
            heal(ctx, caster, target, effect.ratio * atk);
            break;
        case 'status':
            applyStatus(ctx, target, effect.status, effect.duration, (effect.power ?? 0) * atk, caster);
            break;
    }
}

// ---------- 触发 ----------

function inRange(ctx: BattleContext, unit: BattleUnit, skill: SkillDef): boolean {
    const target = ctx.getUnit(unit.targetUid);
    if (!target?.alive) return false;
    return Math.abs(target.x - unit.x) <= (skill.range ?? unit.stats.attackRange);
}

/** 自动技能的释放条件：治疗技能要有人受伤；其他技能要在交战距离内 */
function autoCastReady(ctx: BattleContext, unit: BattleUnit, skill: SkillDef): boolean {
    const heals = skill.effects.some((e) => e.type === 'heal');
    if (heals && !ENEMY_RULES.includes(skill.targeting.rule)) {
        return alliesOf(ctx, unit).some((a) => a.hp < a.stats.maxHp);
    }
    return inRange(ctx, unit, skill);
}

/** 每帧调用：冷却倒计时、自动技能、低血量触发 */
export function updateSkills(ctx: BattleContext, unit: BattleUnit, dt: number): void {
    for (const s of unit.skills) s.cooldown = Math.max(0, s.cooldown - dt);
    if (!canCast(unit)) return;
    for (const s of unit.skills) {
        if (!unit.alive) return;
        const trig = s.def.trigger;
        const auto = trig.type === 'auto' || (trig.type === 'active' && ctx.autoCastActive);
        if (auto && s.cooldown <= 0 && autoCastReady(ctx, unit, s.def)) {
            castSkill(ctx, unit, s);
        } else if (trig.type === 'hpBelow' && !s.fired && unit.hp < unit.stats.maxHp * trig.ratio) {
            s.fired = true;
            castSkill(ctx, unit, s);
        } else if (trig.type === 'enemyNear' && !s.fired && enemiesOf(ctx, unit).some((e) => Math.abs(e.x - unit.x) <= trig.distance)) {
            s.fired = true;
            castSkill(ctx, unit, s);
        }
    }
}

export function fireBattleStart(ctx: BattleContext, unit: BattleUnit): void {
    for (const s of unit.skills) {
        if (s.def.trigger.type === 'battleStart' && !s.fired) {
            s.fired = true;
            castSkill(ctx, unit, s);
        }
    }
}

/** 死亡时触发（不受控制影响，比如胖子死后爆出毒气） */
export function fireOnDeath(ctx: BattleContext, unit: BattleUnit): void {
    for (const s of unit.skills) {
        if (s.def.trigger.type === 'onDeath') castSkill(ctx, unit, s);
    }
}

/** 护盾被打光时触发（只触发一次） */
export function fireShieldBroken(ctx: BattleContext, unit: BattleUnit): void {
    if (!unit.alive) return;
    for (const s of unit.skills) {
        if (s.def.trigger.type === 'shieldBroken' && !s.fired) {
            s.fired = true;
            castSkill(ctx, unit, s);
        }
    }
}

/** 普攻后调用：按概率触发 onAttack 技能 */
export function fireOnAttack(ctx: BattleContext, unit: BattleUnit): void {
    if (!canCast(unit)) return;
    for (const s of unit.skills) {
        const trig = s.def.trigger;
        if (trig.type === 'onAttack' && s.cooldown <= 0 && nextRandom(ctx) < trig.chance) castSkill(ctx, unit, s);
    }
}

/** 玩家手动释放；返回 null 表示成功，否则返回失败原因 */
export function castActive(ctx: BattleContext, unit: BattleUnit): string | null {
    const s = unit.skills.find((x) => x.def.trigger.type === 'active');
    if (!s) return '这个角色没有主动技能';
    if (!unit.alive) return '角色已倒下';
    if (!canCast(unit)) return '被控制中，无法释放';
    if (s.cooldown > 0) return `冷却中（${Math.ceil(s.cooldown)} 秒）`;
    return castSkill(ctx, unit, s) ? null : '没有可用的目标';
}
