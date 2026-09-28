// 【模块 4】伤害结算管线：一次伤害按顺序经过多个“工序”，每道工序只做一件事。
//
//   基础伤害 → 增伤 → 暴击 → 防御减免 → 易伤 → 取整保底 →（结算）护盾吸收 → 扣血
//
// 想加新机制（比如“对丧尸额外伤害”、“闪避”），写一个新工序插到合适的位置即可，
// 不用改其他代码：pipeline.insertBefore('defense', { name: 'dodge', run: ... })

import { nextRandom } from '../rng';
import { absorbWithShields, effectiveDef, modifierSum } from './status';
import { BattleContext, BattleUnit, DamageType } from './types';

export interface DamageRequest {
    source: BattleUnit | null;
    target: BattleUnit;
    /** 基础伤害（通常 = 倍率 × 攻击力） */
    base: number;
    damageType: DamageType;
    canCrit: boolean;
    /** 来源技能或状态 id，普攻为空 */
    skill?: string;
}

export interface DamageContext extends DamageRequest {
    battle: BattleContext;
    amount: number;
    crit: boolean;
    absorbed: number;
    /** 某道工序把它设为 true 时，伤害被完全取消（比如闪避） */
    cancelled: boolean;
}

export interface DamageStage {
    name: string;
    run(ctx: DamageContext): void;
}

/** 防御公式：减伤比例 = 防御 / (防御 + DEFENSE_K)。防御 100 时减伤 50% */
export const DEFENSE_K = 100;

export const DEFAULT_STAGES: DamageStage[] = [
    {
        name: 'outgoing',
        run: (c) => {
            if (c.source) c.amount *= Math.max(0, 1 + modifierSum(c.source, 'damageDealt'));
        },
    },
    {
        name: 'crit',
        run: (c) => {
            if (!c.canCrit || !c.source) return;
            if (nextRandom(c.battle) < c.source.stats.critRate) {
                c.crit = true;
                c.amount *= c.source.stats.critDamage;
            }
        },
    },
    {
        name: 'defense',
        run: (c) => {
            const def = effectiveDef(c.target);
            const factor = c.damageType === 'physical' ? 1 : c.damageType === 'fire' ? 0.5 : 0;
            const d = def * factor;
            c.amount *= DEFENSE_K / (DEFENSE_K + d);
        },
    },
    {
        name: 'incoming',
        run: (c) => {
            c.amount *= Math.max(0, 1 + modifierSum(c.target, 'damageTaken'));
        },
    },
    {
        name: 'round',
        run: (c) => {
            c.amount = Math.max(1, Math.round(c.amount));
        },
    },
];

export class DamagePipeline {
    readonly stages: DamageStage[];

    constructor(stages: DamageStage[] = DEFAULT_STAGES) {
        this.stages = [...stages];
    }

    insertBefore(name: string, stage: DamageStage): void {
        this.stages.splice(this.indexOf(name), 0, stage);
    }

    insertAfter(name: string, stage: DamageStage): void {
        this.stages.splice(this.indexOf(name) + 1, 0, stage);
    }

    remove(name: string): void {
        this.stages.splice(this.indexOf(name), 1);
    }

    private indexOf(name: string): number {
        const i = this.stages.findIndex((s) => s.name === name);
        if (i < 0) throw new Error(`伤害管线里没有工序：${name}`);
        return i;
    }

    /** 按工序计算最终伤害，不改动任何单位（注意：暴击判定会消耗一次随机数） */
    compute(battle: BattleContext, req: DamageRequest): DamageContext {
        const ctx: DamageContext = { ...req, battle, amount: req.base, crit: false, absorbed: 0, cancelled: false };
        for (const stage of this.stages) {
            stage.run(ctx);
            if (ctx.cancelled) break;
        }
        return ctx;
    }

    /** 计算并结算伤害：扣血、发事件、处理死亡和低血量触发 */
    deal(battle: BattleContext, req: DamageRequest): DamageContext {
        const ctx = this.compute(battle, req);
        if (ctx.cancelled || !req.target.alive) return ctx;
        ctx.absorbed = absorbWithShields(battle, req.target, ctx.amount);
        ctx.amount -= ctx.absorbed;
        req.target.hp = Math.max(0, req.target.hp - ctx.amount);
        battle.emit({
            t: battle.time,
            type: 'damage',
            source: req.source?.uid ?? null,
            target: req.target.uid,
            amount: ctx.amount,
            absorbed: ctx.absorbed,
            crit: ctx.crit,
            damageType: req.damageType,
            skill: req.skill,
        });
        battle.afterDamaged(req.target, req.source);
        return ctx;
    }
}

export function heal(battle: BattleContext, source: BattleUnit, target: BattleUnit, base: number): number {
    if (!target.alive) return 0;
    const amount = Math.min(Math.round(base), target.stats.maxHp - target.hp);
    if (amount <= 0) return 0;
    target.hp += amount;
    battle.emit({ t: battle.time, type: 'heal', source: source.uid, target: target.uid, amount });
    return amount;
}
