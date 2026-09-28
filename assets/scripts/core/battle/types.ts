// 战斗系统的类型定义。战斗是一维横版：我方在左、敌方在右，x 为位置（单位：格）。
// 所有时间单位都是秒。

import type { RngHolder } from '../rng';
import type { BattleRegistry } from './registry';
import type { DamagePipeline } from './damage';

export type Side = 'ally' | 'enemy';

/** physical 受防御减免；fire 只受一半防御减免；poison / true 无视防御 */
export type DamageType = 'physical' | 'fire' | 'poison' | 'true';

// ---------- 1. 角色配置（units.json） ----------

export interface UnitStats {
    maxHp: number;
    atk: number;
    def: number;
    /** 每秒移动多少格 */
    moveSpeed: number;
    /** 普攻距离（格） */
    attackRange: number;
    /** 普攻间隔（秒） */
    attackInterval: number;
    /** 暴击率 0～1 */
    critRate: number;
    /** 暴击伤害倍率，1.5 = 150% */
    critDamage: number;
}

export type StatKey = keyof UnitStats;

export interface UnitAppearance {
    /** 美术资源名（之后放在 resources/sprites 下） */
    sprite: string;
    /** 没有美术时用来画色块的颜色 */
    color: string;
    scale: number;
}

export interface UnitDef {
    id: string;
    name: string;
    faction: 'survivor' | 'zombie';
    appearance: UnitAppearance;
    stats: UnitStats;
    /** 每升一级增加的数值 */
    growth?: Partial<UnitStats>;
    attackDamageType?: DamageType;
    skills: string[];
}

// ---------- 2 / 3. 技能（skills.json） ----------

export type SkillTrigger =
    | { type: 'active' }
    | { type: 'auto' }
    | { type: 'onAttack'; chance: number }
    | { type: 'battleStart' }
    | { type: 'hpBelow'; ratio: number }
    | { type: 'onDeath' };

export type TargetRule =
    | 'self'
    | 'currentTarget'
    | 'nearestEnemy'
    | 'randomEnemy'
    | 'lowestHpAlly'
    | 'allAllies'
    | 'allEnemies';

export interface SkillTargeting {
    rule: TargetRule;
    /** 范围效果：选中主目标后，把主目标周围 radius 格内的同阵营单位也算进去 */
    radius?: number;
}

export type SkillEffect =
    /** 伤害 = ratio × 施法者攻击力 */
    | { type: 'damage'; ratio: number; damageType?: DamageType; canCrit?: boolean }
    /** 治疗 = ratio × 施法者攻击力 */
    | { type: 'heal'; ratio: number }
    /** 施加状态；power × 施法者攻击力 = 持续伤害每跳的伤害 / 护盾量 */
    | { type: 'status'; status: string; duration: number; power?: number };

export interface SkillDef {
    id: string;
    name: string;
    description: string;
    icon?: string;
    trigger: SkillTrigger;
    /** 冷却（秒）；0 = 没有冷却 */
    cooldown: number;
    /** 开战后多久才能第一次释放 */
    initialCooldown?: number;
    /** 自动释放时，当前目标要在多少格以内；不写则等于普攻距离 */
    range?: number;
    targeting: SkillTargeting;
    effects: SkillEffect[];
    tags?: string[];
}

// ---------- 5. 状态（statuses.json） ----------

/** 百分比修正：0.3 = +30%，-0.4 = -40% */
export type ModifierKey = 'atk' | 'def' | 'moveSpeed' | 'attackSpeed' | 'damageDealt' | 'damageTaken';

export interface StatusDef {
    id: string;
    name: string;
    /** 是否算作负面状态（UI 显示和以后的驱散用） */
    debuff: boolean;
    /** refresh = 重复施加时刷新时间；stack = 叠层 */
    stacking: 'refresh' | 'stack';
    maxStacks?: number;
    /** 控制效果 */
    control?: { stun?: boolean; root?: boolean; silence?: boolean };
    /** 每层的属性修正 */
    modifiers?: Partial<Record<ModifierKey, number>>;
    /** 持续伤害：每 interval 秒造成 power × 施法者攻击 × 层数 的伤害 */
    dot?: { damageType: DamageType; interval: number };
    /** 护盾：吸收 power × 施法者攻击 的伤害 */
    shield?: boolean;
}

export interface BattleDefs {
    units: UnitDef[];
    skills: SkillDef[];
    statuses: StatusDef[];
}

// ---------- 运行时 ----------

export interface SkillState {
    def: SkillDef;
    cooldown: number;
    /** hpBelow / battleStart 这类只触发一次的技能是否已触发 */
    fired: boolean;
}

export interface StatusInstance {
    def: StatusDef;
    remaining: number;
    stacks: number;
    /** 持续伤害每跳的伤害，或护盾剩余量 */
    value: number;
    tickTimer: number;
    sourceUid: number | null;
}

export interface BattleUnit {
    uid: number;
    def: UnitDef;
    side: Side;
    level: number;
    stats: UnitStats;
    hp: number;
    x: number;
    alive: boolean;
    attackCooldown: number;
    targetUid: number | null;
    skills: SkillState[];
    statuses: StatusInstance[];
}

export type BattleResult = 'ongoing' | 'win' | 'lose';

export type BattleEvent =
    | { t: number; type: 'spawn'; unit: number }
    | { t: number; type: 'attack'; source: number; target: number }
    | { t: number; type: 'skill'; source: number; skill: string; targets: number[] }
    | {
          t: number;
          type: 'damage';
          source: number | null;
          target: number;
          amount: number;
          absorbed: number;
          crit: boolean;
          damageType: DamageType;
          skill?: string;
      }
    | { t: number; type: 'heal'; source: number; target: number; amount: number }
    | { t: number; type: 'statusOn'; target: number; status: string; stacks: number }
    | { t: number; type: 'statusOff'; target: number; status: string }
    | { t: number; type: 'death'; unit: number; killer: number | null }
    | { t: number; type: 'end'; result: BattleResult };

/** 各模块共用的战斗上下文，由 Battle 实现 */
export interface BattleContext extends RngHolder {
    time: number;
    units: BattleUnit[];
    registry: BattleRegistry;
    damage: DamagePipeline;
    emit(event: BattleEvent): void;
    getUnit(uid: number | null): BattleUnit | undefined;
    /** 单位受到伤害后调用：处理死亡、低血量触发 */
    afterDamaged(target: BattleUnit, source: BattleUnit | null): void;
}
