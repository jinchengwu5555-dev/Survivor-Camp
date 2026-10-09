// 【模块 5b】对战流程：出生 / 分波刷怪、索敌、移动、普攻、胜负判定。
//
// 战场是俯视的二维平面。守夜时有营地布局（setup.camp）：方形围墙上开几个门，
//   · 墙外的丧尸先打离自己最近的门；门被打破了，就从破口涌进营地，找人和营地核心
//   · 守门的人分到某个门（post），只在围墙里面活动；墙外的敌人只在门附近打，墙里进了丧尸就去追
// 没有营地布局时（探索）就是空旷的战场；老的横版战斗所有人 y = 0，结果和以前一样。
//
// 每一帧按固定顺序执行：
//   刷怪 → 开战触发 → 状态结算（眩晕、持续伤害）→ 每个单位：技能 → 索敌 → 移动或普攻 → 胜负判定
// 战斗逻辑以固定步长（STEP 秒）推进，结果只由种子决定，同一个种子可以完整重放。

import { DamagePipeline } from './damage';
import { campBounds, CampLayout, clampInside, distance, gateNormal, insideCamp, Point, pushOutside, stepToward } from './geometry';
import { BattleRegistry } from './registry';
import { castActive, enemiesOf, fireBattleStart, fireOnAttack, fireOnDeath, fireShieldBroken, nearest, updateSkills } from './skills';
import { canAct, canMove, effectiveAtk, effectiveAttackInterval, effectiveMoveSpeed, updateStatuses } from './status';
import { BattleContext, BattleEvent, BattleResult, BattleUnit, Side } from './types';
import { createBattleUnit } from './units';

export const STEP = 0.1;

export interface UnitSetup {
    unit: string;
    level?: number;
    /** 出生位置；不写则自动排队 */
    x?: number;
    y?: number;
    /** 这是营地的第几个门（栅栏单位） */
    gate?: number;
    /** 守门的人：分到第几个门 */
    post?: number;
    /** 第几秒出场（用于尸潮分波） */
    spawnAt?: number;
    /** 覆盖最大生命（比如栅栏的生命由营地安全值决定） */
    maxHp?: number;
    /** 出场时的生命比例（0～1，比如栅栏上次没修好的损伤）；不写 = 满血 */
    hpRatio?: number;
    /** 调用方自定义标记，会原样放到 BattleUnit.tag 上（营地用它记录幸存者 id） */
    tag?: string;
    /** 额外携带的技能（比如工坊做的燃烧瓶、急救包） */
    extraSkills?: string[];
    /** 攻击 / 生命倍率（营地里的天赋） */
    atkMult?: number;
    hpMult?: number;
    /** 拿着远程武器：射程至少这么远 */
    range?: number;
    /** 覆盖攻击力（栅栏本身不打人，上面的陷阱按这个算伤害） */
    atk?: number;
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
    /** 我方最远只能走到这个位置（老的横版守夜：大家守在栅栏后面） */
    allyHoldLine?: number;
    /** 营地布局（俯视守夜）：方形围墙和门 */
    camp?: CampLayout;
    /** 玩家的操作记录：重放战报时按时间点原样执行（手动守夜的战报靠它完整重放） */
    inputs?: BattleInput[];
}

/**
 * 玩家在战斗中的一次操作，t 是操作时的战斗时间（在下一帧开始前执行）。
 *   cast：让 uid 这个单位放手动技能
 *   auto：切换“手动技能自动释放”
 *   heal：给 tag 这个单位回 amount 点血（比如花木材修补栅栏）
 *   post：把 uid 这个人调去守第 gate 个门
 */
export type BattleInput =
    | { t: number; cast: number }
    | { t: number; auto: boolean }
    | { t: number; heal: string; amount: number }
    | { t: number; post: number; gate: number };

/** 我方从 x=0 往左排，敌方从 x=ENEMY_START 往右排 */
const ENEMY_START = 10;
const SPACING = 0.8;
/** 撑杆跳落在建筑后面多远 */
const VAULT_LANDING = 1.2;
/** 门被打破后，离门中心这么近的地方可以穿过围墙 */
const GATE_GAP = 1.0;
/** 守门的人站在门里面多深、并排时隔多远、为了打墙外的敌人最多离开岗位多远 */
const POST_INSET = 0.4;
const POST_SPACING = 0.7;
const POST_LEASH = 2.5;
const POST_FALLBACK = 2.5;
/** 冲进营地的丧尸：这么近的人会先被咬，远一点的不管，直奔营地核心 */
const INSIDE_AGGRO = 1;
/** 尸群里两只丧尸至少隔这么远（营地战斗） */
const CROWD_SPACING = 0.45;

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
    /** 每一步开始时算一次：门对应的栅栏、被打破的门、每个门守着哪些人（尸群一多，每次都现找太慢） */
    private gateUnits: (BattleUnit | undefined)[] = [];
    private openGateCache: Point[] = [];
    private postMates = new Map<number, BattleUnit[]>();
    private started = false;
    private accumulator = 0;
    private readonly pending: { setup: UnitSetup; side: Side; x: number; y: number }[] = [];
    /** 重放用：还没执行的操作 */
    private readonly scripted: BattleInput[];

    constructor(readonly registry: BattleRegistry, readonly setup: BattleSetup, damage = new DamagePipeline()) {
        this.rngState = setup.seed | 0;
        this.autoCastActive = setup.autoCastActive ?? false;
        this.damage = damage;
        this.scripted = [...(setup.inputs ?? [])].sort((a, b) => a.t - b.t);
        const camp = setup.camp;
        setup.allies.forEach((s, i) => this.pending.push({ setup: s, side: 'ally', x: s.x ?? (camp ? 0 : -i * SPACING), y: s.y ?? 0 }));
        setup.enemies.forEach((s, i) =>
            this.pending.push({
                setup: s,
                side: 'enemy',
                // 营地战斗里没写位置的敌人从东边来
                x: s.x ?? (camp ? campBounds(camp).x2 + ENEMY_START : ENEMY_START + i * SPACING),
                y: s.y ?? (camp ? ((i % 7) - 3) * SPACING : 0),
            }),
        );
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

    shieldBroken(target: BattleUnit): void {
        fireShieldBroken(this, target);
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

    /** 把 uid 这个人调去守第 gate 个门；返回 null 表示成功 */
    assignPost(uid: number, gate: number): string | null {
        if (this.result !== 'ongoing') return '战斗已结束';
        const camp = this.setup.camp;
        if (!camp || gate < 0 || gate >= camp.gates.length) return '没有这个门';
        const unit = this.getUnit(uid);
        if (!unit || unit.side !== 'ally' || !unit.alive || unit.def.faction === 'structure') return '找不到这个人';
        if (unit.post === gate) return '已经在守这个门了';
        unit.post = gate;
        unit.targetUid = null;
        this.inputs.push({ t: this.time, post: uid, gate });
        return null;
    }

    /** 第 gate 个门对应的栅栏单位 */
    gateUnit(gate: number): BattleUnit | undefined {
        return this.units.find((u) => u.gate === gate && u.side === 'ally');
    }

    /** 每一步开始时刷新门和岗位的缓存 */
    private refreshCamp(): void {
        const camp = this.setup.camp;
        if (!camp) return;
        this.gateUnits = camp.gates.map((_, i) => this.gateUnit(i));
        this.openGateCache = camp.gates.filter((_, i) => !this.gateUnits[i]?.alive);
        this.postMates.clear();
        for (const u of this.units) {
            if (!u.alive || u.side !== 'ally' || u.post === undefined || u.def.faction === 'structure') continue;
            const list = this.postMates.get(u.post) ?? [];
            list.push(u);
            this.postMates.set(u.post, list);
        }
    }

    /** 守门的人站在哪：门里面一点，同一个门的人沿着墙并排站 */
    postPoint(u: BattleUnit): Point | null {
        const camp = this.setup.camp;
        if (!camp || u.post === undefined) return null;
        const gate = camp.gates[u.post];
        const n = gateNormal(camp, gate);
        // 门被打破了：退到门后面一点，别堵在破口上被尸群淹没
        const inset = this.gateUnits[u.post]?.alive === false ? POST_FALLBACK : POST_INSET;
        const mates = this.postMates.get(u.post) ?? [u];
        const k = Math.max(0, mates.indexOf(u));
        const r = campBounds(camp);
        const max = (n.x !== 0 ? r.y2 - r.y1 : r.x2 - r.x1) / 2 - 0.5;
        const offset = Math.max(-max, Math.min(max, (k - (mates.length - 1) / 2) * POST_SPACING));
        return { x: gate.x - n.x * inset - n.y * offset, y: gate.y - n.y * inset + n.x * offset };
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

        this.refreshCamp();
        for (const u of this.aliveUnits()) updateStatuses(this, u, STEP);
        for (const u of this.aliveUnits()) {
            if (!u.alive) continue;
            updateSkills(this, u, STEP);
            this.act(u);
        }
        this.separateCrowd();
        this.checkResult();
    }

    private replayInput(input: BattleInput): void {
        if ('cast' in input) this.useSkill(input.cast);
        else if ('auto' in input) this.setAutoCast(input.auto);
        else if ('post' in input) this.assignPost(input.post, input.gate);
        else this.healTagged(input.heal, input.amount);
    }

    private act(u: BattleUnit): void {
        u.attackCooldown = Math.max(0, u.attackCooldown - STEP);
        if (!u.alive || !canAct(u)) return;

        const target = this.pickTarget(u);
        if (!target) {
            if (canMove(u)) this.returnToPost(u);
            return;
        }
        const dist = distance(u, target);
        const range = u.stats.attackRange;
        if (this.shouldFallBack(u, target)) {
            // 自己守的门破了：先退到门后，别堵在破口上和墙外的尸群硬拼
            if (canMove(u)) this.returnToPost(u);
            return;
        }
        if (dist > range) {
            if (canMove(u)) this.moveToward(u, target, range);
            return;
        }
        if (u.def.vault && !u.ignoreStructures && target.def.faction === 'structure') {
            // 撑杆跳：越过栅栏落到后面，之后只打人
            u.ignoreStructures = true;
            const d = dist || 1;
            const dx = (target.x - u.x) / d || -1;
            const dy = (target.y - u.y) / d;
            u.x = target.x + dx * VAULT_LANDING;
            u.y = target.y + dy * VAULT_LANDING;
            u.targetUid = null;
            this.emit({ t: this.time, type: 'leap', unit: u.uid, over: target.uid });
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

    /** 朝目标走（停在攻击距离上）；营地战斗里墙外的丧尸要从破口进来，守门的人不出围墙 */
    private moveToward(u: BattleUnit, target: BattleUnit, range: number): void {
        const camp = this.setup.camp;
        let dest: Point = target;
        let stop = range;
        if (camp && u.side === 'enemy' && !insideCamp(camp, u) && insideCamp(camp, target) && target.gate === undefined) {
            const gap = this.nearestOpenGate(u);
            if (gap) {
                dest = gap;
                stop = 0;
            }
        }
        const d = distance(u, dest);
        let next = stepToward(u, dest, Math.min(effectiveMoveSpeed(u) * STEP, Math.max(0, d - stop)));
        if (camp) {
            if (u.side === 'ally') {
                next = clampInside(camp, next);
                // 墙外的敌人：只在岗位附近打，不跑远；自己的门已经破了就守在门后，不去堵破口
                const post = this.postPoint(u);
                if (post && !insideCamp(camp, target)) {
                    const broken = u.post !== undefined && this.gateUnits[u.post]?.alive === false;
                    if (broken) next = stepToward(u, post, effectiveMoveSpeed(u) * STEP);
                    else if (distance(next, post) > POST_LEASH) next = stepToward(post, next, POST_LEASH);
                }
            } else if (!insideCamp(camp, u) && !this.nearOpenGate(next)) {
                next = pushOutside(camp, next);
            }
        } else {
            const line = this.setup.allyHoldLine;
            if (u.side === 'ally' && line !== undefined) next.x = Math.min(next.x, Math.max(u.x, line));
        }
        u.x = next.x;
        u.y = next.y;
    }

    private shouldFallBack(u: BattleUnit, target: BattleUnit): boolean {
        const camp = this.setup.camp;
        if (!camp || u.side !== 'ally' || u.post === undefined || insideCamp(camp, target)) return false;
        if (this.gateUnits[u.post]?.alive !== false) return false;
        const post = this.postPoint(u);
        return !!post && distance(u, post) > 0.3;
    }

    /**
     * 营地战斗：尸群互相挤开，不会全叠在门口一个点上，而是沿着围墙排开一大片。
     * 只推丧尸（不推人和建筑）；推完墙外的丧尸还在墙外。
     */
    private separateCrowd(): void {
        const camp = this.setup.camp;
        if (!camp) return;
        const crowd = this.units.filter((u) => u.alive && u.side === 'enemy' && u.def.faction !== 'structure');
        const min = CROWD_SPACING;
        const outside = crowd.map((u) => !insideCamp(camp, u) && !u.ignoreStructures);
        for (let i = 0; i < crowd.length; i++) {
            const a = crowd[i];
            for (let j = i + 1; j < crowd.length; j++) {
                const b = crowd[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= min * min) continue;
                const d = Math.sqrt(d2);
                // 完全重合时按 uid 定一个方向，保证结果可以重放
                const nx = d > 1e-6 ? dx / d : Math.cos(a.uid * 2.4);
                const ny = d > 1e-6 ? dy / d : Math.sin(a.uid * 2.4);
                const push = (min - d) / 2;
                a.x -= nx * push;
                a.y -= ny * push;
                b.x += nx * push;
                b.y += ny * push;
            }
        }
        crowd.forEach((u, i) => {
            if (!outside[i] || this.nearOpenGate(u)) return;
            const p = pushOutside(camp, u);
            u.x = p.x;
            u.y = p.y;
        });
    }

    /** 没有目标时回到岗位 */
    private returnToPost(u: BattleUnit): void {
        const post = this.postPoint(u);
        if (!post || distance(u, post) < 0.05) return;
        const next = stepToward(u, post, effectiveMoveSpeed(u) * STEP);
        u.x = next.x;
        u.y = next.y;
    }

    /** 被打破的门（门的位置） */
    private openGates(): Point[] {
        return this.openGateCache;
    }

    private nearestOpenGate(p: Point): Point | undefined {
        let best: Point | undefined;
        for (const g of this.openGates()) if (!best || distance(g, p) < distance(best, p)) best = g;
        return best;
    }

    private nearOpenGate(p: Point): boolean {
        return this.openGates().some((g) => distance(g, p) <= GATE_GAP);
    }

    /**
     * 索敌：当前目标还活着、并且在攻击距离内就继续打；否则重新找。
     * 不在攻击距离内也要重新找——守夜时大家不能越过栅栏，锁定远处的敌人会让近战的人站着发呆。
     */
    private pickTarget(u: BattleUnit): BattleUnit | undefined {
        const current = this.getUnit(u.targetUid);
        if (current?.alive && distance(current, u) <= u.stats.attackRange) return current;
        const next = this.chooseTarget(u);
        u.targetUid = next?.uid ?? null;
        return next;
    }

    private chooseTarget(u: BattleUnit): BattleUnit | undefined {
        const enemies = enemiesOf(this, u);
        const camp = this.setup.camp;
        if (!camp) {
            const people = u.ignoreStructures ? enemies.filter((e) => e.def.faction !== 'structure') : enemies;
            return nearest(u, people.length ? people : enemies);
        }
        if (u.side === 'ally') {
            // 营地里进了丧尸先去追；否则打离自己岗位最近的
            const inside = enemies.filter((e) => insideCamp(camp, e));
            if (inside.length) return nearest(u, inside);
            return nearest(this.postPoint(u) ?? u, enemies);
        }
        // 丧尸：墙外先打离自己最近的门；门破了就冲进去拆营地核心，路上有人挡着就先咬人
        const people = enemies.filter((e) => e.gate === undefined);
        if (!insideCamp(camp, u) && !u.ignoreStructures) {
            let gate = 0;
            camp.gates.forEach((g, i) => {
                if (distance(g, u) < distance(camp.gates[gate], u)) gate = i;
            });
            const unit = this.gateUnits[gate];
            if (unit?.alive) return unit;
        }
        const near = nearest(u, people.filter((e) => e.def.faction !== 'structure'));
        if (near && distance(near, u) <= INSIDE_AGGRO) return near;
        const core = nearest(u, people.filter((e) => e.def.faction === 'structure'));
        return core ?? nearest(u, people.length ? people : enemies);
    }

    private spawnDue(): void {
        for (let i = 0; i < this.pending.length; ) {
            const p = this.pending[i];
            if ((p.setup.spawnAt ?? 0) > this.time + 1e-9) {
                i++;
                continue;
            }
            this.pending.splice(i, 1);
            const unit = createBattleUnit(this.registry, this.nextUid++, p.setup.unit, p.side, p.setup.level ?? 1, p.x, p.y);
            unit.gate = p.setup.gate;
            unit.post = p.setup.post;
            const wall = unit.def.burrow ? this.nearestStructure(p.side === 'ally' ? 'enemy' : 'ally', unit) : undefined;
            if (wall) {
                // 从地下钻出来：从出生点朝栅栏的方向，落在栅栏后面
                const d = distance(unit, wall) || 1;
                unit.x = wall.x + ((wall.x - unit.x) / d) * unit.def.burrow!;
                unit.y = wall.y + ((wall.y - unit.y) / d) * unit.def.burrow!;
                unit.ignoreStructures = true;
            }
            if (p.setup.maxHp !== undefined) unit.stats.maxHp = unit.hp = p.setup.maxHp;
            if (p.setup.hpMult) unit.stats.maxHp = unit.hp = Math.round(unit.stats.maxHp * p.setup.hpMult);
            if (p.setup.hpRatio !== undefined) unit.hp = Math.max(1, Math.round(unit.stats.maxHp * Math.min(1, p.setup.hpRatio)));
            if (p.setup.atkMult) unit.stats.atk = unit.stats.atk * p.setup.atkMult;
            if (p.setup.range) unit.stats.attackRange = Math.max(unit.stats.attackRange, p.setup.range);
            if (p.setup.atk !== undefined) unit.stats.atk = p.setup.atk;
            unit.tag = p.setup.tag;
            for (const id of p.setup.extraSkills ?? []) {
                const skill = this.registry.skill(id);
                unit.skills.push({ def: skill, cooldown: skill.initialCooldown ?? 0, fired: false });
            }
            this.units.push(unit);
            this.emit({ t: this.time, type: 'spawn', unit: unit.uid });
            if (wall) this.emit({ t: this.time, type: 'burrow', unit: unit.uid });
            if (this.started) fireBattleStart(this, unit);
        }
    }

    /** 某一方还立着的、离 p 最近的建筑（门、栅栏） */
    private nearestStructure(side: Side, p: Point): BattleUnit | undefined {
        const walls = this.units.filter((u) => u.alive && u.side === side && u.def.faction === 'structure' && (u.gate !== undefined || !this.setup.camp));
        return nearest(p, walls);
    }

    private aliveUnits(): BattleUnit[] {
        return this.units.filter((u) => u.alive);
    }

    private checkResult(): void {
        // 营地战斗里只剩门和核心、没人守了，也算失守
        const alliesAlive = this.units.some((u) => u.alive && u.side === 'ally' && (!this.setup.camp || u.def.faction !== 'structure'));
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

/** 敌人分几波出场：每一波的出场时间（秒，从小到大）；1.5 秒以内陆续出来的算同一波 */
export function waveTimes(setup: BattleSetup): number[] {
    const times = [...new Set(setup.enemies.map((e) => e.spawnAt ?? 0))].sort((a, b) => a - b);
    const waves: number[] = [];
    for (const t of times) if (!waves.length || t - waves[waves.length - 1] > 1.5) waves.push(t);
    return waves;
}

function round(t: number): number {
    return Math.round(t * 1000) / 1000;
}
