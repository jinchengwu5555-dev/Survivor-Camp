// 【模块 5b】对战流程：出生 / 分波刷怪、索敌、移动、普攻、胜负判定。
//
// 每一帧按固定顺序执行：
//   刷怪 → 开战触发 → 状态结算（眩晕、持续伤害）→ 每个单位：技能 → 索敌 → 移动或普攻 → 胜负判定
// 战斗逻辑以固定步长（STEP 秒）推进，结果只由种子决定，同一个种子可以完整重放。

import { DamagePipeline } from './damage';
import { BattleRegistry } from './registry';
import { castActive, enemiesOf, fireBattleStart, fireOnAttack, fireOnDeath, nearest, updateSkills } from './skills';
import { canAct, canMove, effectiveAtk, effectiveAttackInterval, effectiveMoveSpeed, updateStatuses } from './status';
import { BattleContext, BattleEvent, BattleResult, BattleUnit, Side } from './types';
import { createBattleUnit } from './units';

export const STEP = 0.1;

export interface UnitSetup {
    unit: string;
    level?: number;
    /** 出生位置；不写则自动排队 */
    x?: number;
    /** 第几秒出场（用于尸潮分波） */
    spawnAt?: number;
    /** 覆盖最大生命（比如栅栏的生命由营地安全值决定） */
    maxHp?: number;
    /** 调用方自定义标记，会原样放到 BattleUnit.tag 上（营地用它记录幸存者 id） */
    tag?: string;
    /** 额外携带的技能（比如工坊做的燃烧瓶、急救包） */
    extraSkills?: string[];
}

export interface BattleSetup {
    allies: UnitSetup[];
    enemies: UnitSetup[];
    /** 时间上限（秒） */
    timeLimit: number;
    /** 时间到了算赢还是输：探索战斗一般算输，守夜（撑过尸潮）算赢 */
    timeoutResult: 'win' | 'lose';
    seed: number;
    /** 手动技能也自动释放（营地里自动结算的战斗没人点按钮） */
    autoCastActive?: boolean;
    /** 这些 tag 的我方单位倒下就算输（守夜时栅栏被拆 = 尸群冲进营地） */
    mustSurvive?: string[];
    /** 我方最远只能走到这个位置（守夜时大家守在栅栏后面） */
    allyHoldLine?: number;
    /** 玩家的操作记录：重放战报时按时间点原样执行（手动守夜的战报靠它完整重放） */
    inputs?: BattleInput[];
}

/**
 * 玩家在战斗中的一次操作，t 是操作时的战斗时间（在下一帧开始前执行）。
 *   cast：让 uid 这个单位放手动技能
 *   auto：切换“手动技能自动释放”
 *   heal：给 tag 这个单位回 amount 点血（比如花木材修补栅栏）
 */
export type BattleInput = { t: number; cast: number } | { t: number; auto: boolean } | { t: number; heal: string; amount: number };

/** 我方从 x=0 往左排，敌方从 x=ENEMY_START 往右排 */
const ENEMY_START = 10;
const SPACING = 0.8;

export class Battle implements BattleContext {
    time = 0;
    rngState: number;
    units: BattleUnit[] = [];
    result: BattleResult = 'ongoing';
    readonly events: BattleEvent[] = [];
    autoCastActive: boolean;
    /** 这场战斗里玩家的操作（成功的才记录），存进战报后可以完整重放 */
    readonly inputs: BattleInput[] = [];
    readonly damage: DamagePipeline;

    private nextUid = 1;
    private started = false;
    private accumulator = 0;
    private readonly pending: { setup: UnitSetup; side: Side; x: number }[] = [];
    /** 重放用：还没执行的操作 */
    private readonly scripted: BattleInput[];

    constructor(readonly registry: BattleRegistry, readonly setup: BattleSetup, damage = new DamagePipeline()) {
        this.rngState = setup.seed | 0;
        this.autoCastActive = setup.autoCastActive ?? false;
        this.damage = damage;
        this.scripted = [...(setup.inputs ?? [])].sort((a, b) => a.t - b.t);
        setup.allies.forEach((s, i) => this.pending.push({ setup: s, side: 'ally', x: s.x ?? -i * SPACING }));
        setup.enemies.forEach((s, i) => this.pending.push({ setup: s, side: 'enemy', x: s.x ?? ENEMY_START + i * SPACING }));
        this.spawnDue();
    }

    // ---------- BattleContext ----------

    emit(event: BattleEvent): void {
        this.events.push(event);
    }

    getUnit(uid: number | null): BattleUnit | undefined {
        return uid === null ? undefined : this.units.find((u) => u.uid === uid);
    }

    afterDamaged(target: BattleUnit, source: BattleUnit | null): void {
        if (target.hp > 0 || !target.alive) return;
        target.alive = false;
        target.statuses = [];
        this.emit({ t: this.time, type: 'death', unit: target.uid, killer: source?.uid ?? null });
        fireOnDeath(this, target);
    }

    // ---------- 对外接口 ----------

    /** 界面每帧调用，传入真实经过的秒数；内部按固定步长推进 */
    advance(dt: number): void {
        this.accumulator += dt;
        while (this.accumulator >= STEP - 1e-9 && this.result === 'ongoing') {
            this.accumulator -= STEP;
            this.step();
        }
    }

    /** 自动战斗直接出结果（探索时不看过程用） */
    runToEnd(): BattleResult {
        while (this.result === 'ongoing') this.step();
        return this.result;
    }

    /** 玩家点击技能按钮；返回 null 表示成功，否则是失败原因 */
    useSkill(uid: number): string | null {
        if (this.result !== 'ongoing') return '战斗已结束';
        const unit = this.getUnit(uid);
        if (!unit || unit.side !== 'ally') return '找不到这个角色';
        const error = castActive(this, unit);
        if (error === null) this.inputs.push({ t: this.time, cast: uid });
        return error;
    }

    /** 切换“手动技能自动释放” */
    setAutoCast(on: boolean): void {
        if (this.autoCastActive === on || this.result !== 'ongoing') return;
        this.autoCastActive = on;
        this.inputs.push({ t: this.time, auto: on });
    }

    /** 给 tag 这个我方单位回血（修补栅栏）；返回 null 表示成功 */
    healTagged(tag: string, amount: number): string | null {
        if (this.result !== 'ongoing') return '战斗已结束';
        const unit = this.units.find((u) => u.tag === tag && u.side === 'ally');
        if (!unit || !unit.alive) return '已经被摧毁了';
        const healed = Math.min(amount, unit.stats.maxHp - unit.hp);
        if (healed <= 0) return '不需要修补';
        unit.hp += healed;
        this.emit({ t: this.time, type: 'heal', source: unit.uid, target: unit.uid, amount: healed });
        this.inputs.push({ t: this.time, heal: tag, amount });
        return null;
    }

    side(side: Side): BattleUnit[] {
        return this.units.filter((u) => u.side === side);
    }

    // ---------- 每帧流程 ----------

    step(): void {
        if (this.result !== 'ongoing') return;
        while (this.scripted.length > 0 && this.scripted[0].t <= this.time + 1e-9) this.replayInput(this.scripted.shift()!);
        this.time = round(this.time + STEP);
        this.spawnDue();
        if (!this.started) {
            this.started = true;
            for (const u of this.units) fireBattleStart(this, u);
        }

        for (const u of this.aliveUnits()) updateStatuses(this, u, STEP);
        for (const u of this.aliveUnits()) {
            if (!u.alive) continue;
            updateSkills(this, u, STEP);
            this.act(u);
        }
        this.checkResult();
    }

    private replayInput(input: BattleInput): void {
        if ('cast' in input) this.useSkill(input.cast);
        else if ('auto' in input) this.setAutoCast(input.auto);
        else this.healTagged(input.heal, input.amount);
    }

    private act(u: BattleUnit): void {
        u.attackCooldown = Math.max(0, u.attackCooldown - STEP);
        if (!u.alive || !canAct(u)) return;

        const target = this.pickTarget(u);
        if (!target) return;
        const dist = Math.abs(target.x - u.x);
        const range = u.stats.attackRange;
        if (dist > range) {
            if (!canMove(u)) return;
            const dir = Math.sign(target.x - u.x);
            let x = u.x + dir * Math.min(effectiveMoveSpeed(u) * STEP, dist - range);
            const line = this.setup.allyHoldLine;
            if (u.side === 'ally' && line !== undefined) x = Math.min(x, Math.max(u.x, line));
            u.x = x;
            return;
        }
        if (u.attackCooldown > 0) return;

        u.attackCooldown = effectiveAttackInterval(u);
        this.emit({ t: this.time, type: 'attack', source: u.uid, target: target.uid });
        this.damage.deal(this, {
            source: u,
            target,
            base: effectiveAtk(u),
            damageType: u.def.attackDamageType ?? 'physical',
            canCrit: true,
        });
        if (u.alive) fireOnAttack(this, u);
    }

    /**
     * 索敌：当前目标还活着、并且在攻击距离内就继续打；否则换最近的敌人。
     * 不在攻击距离内也要重新找——守夜时大家不能越过栅栏，锁定远处的敌人会让近战的人站着发呆。
     */
    private pickTarget(u: BattleUnit): BattleUnit | undefined {
        const current = this.getUnit(u.targetUid);
        if (current?.alive && Math.abs(current.x - u.x) <= u.stats.attackRange) return current;
        const next = nearest(u, enemiesOf(this, u));
        u.targetUid = next?.uid ?? null;
        return next;
    }

    private spawnDue(): void {
        for (let i = 0; i < this.pending.length; ) {
            const p = this.pending[i];
            if ((p.setup.spawnAt ?? 0) > this.time + 1e-9) {
                i++;
                continue;
            }
            this.pending.splice(i, 1);
            const unit = createBattleUnit(this.registry, this.nextUid++, p.setup.unit, p.side, p.setup.level ?? 1, p.x);
            if (p.setup.maxHp !== undefined) unit.stats.maxHp = unit.hp = p.setup.maxHp;
            unit.tag = p.setup.tag;
            for (const id of p.setup.extraSkills ?? []) {
                const skill = this.registry.skill(id);
                unit.skills.push({ def: skill, cooldown: skill.initialCooldown ?? 0, fired: false });
            }
            this.units.push(unit);
            this.emit({ t: this.time, type: 'spawn', unit: unit.uid });
            if (this.started) fireBattleStart(this, unit);
        }
    }

    private aliveUnits(): BattleUnit[] {
        return this.units.filter((u) => u.alive);
    }

    private checkResult(): void {
        const alliesAlive = this.units.some((u) => u.alive && u.side === 'ally');
        const enemiesLeft = this.units.some((u) => u.alive && u.side === 'enemy') || this.pending.some((p) => p.side === 'enemy');
        const keyLost = (this.setup.mustSurvive ?? []).some((tag) => this.units.some((u) => u.tag === tag && !u.alive));
        let result: BattleResult = 'ongoing';
        if (!alliesAlive || keyLost) result = 'lose';
        else if (!enemiesLeft) result = 'win';
        else if (this.time >= this.setup.timeLimit - 1e-9) result = this.setup.timeoutResult;
        if (result !== 'ongoing') {
            this.result = result;
            this.emit({ t: this.time, type: 'end', result });
        }
    }
}

function round(t: number): number {
    return Math.round(t * 1000) / 1000;
}
