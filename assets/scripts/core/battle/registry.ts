// 【模块 3】技能编排登记表：统一登记所有角色、技能、状态数据。
// - 其他模块只通过这里查数据，不直接读配置文件
// - validate() 检查引用错误；describeSkill() 生成中文说明，方便调试和做技能介绍
// - override() 可以在调试时临时改某个技能的数值，不用改配置表

import { BattleDefs, SkillDef, SkillEffect, SkillTrigger, StatusDef, TargetRule, UnitDef } from './types';

const TARGET_RULES: TargetRule[] = [
    'self',
    'currentTarget',
    'nearestEnemy',
    'randomEnemy',
    'lowestHpAlly',
    'allAllies',
    'allEnemies',
];
const TRIGGERS: SkillTrigger['type'][] = ['active', 'auto', 'onAttack', 'battleStart', 'hpBelow', 'onDeath', 'enemyNear', 'shieldBroken'];
const EFFECTS: SkillEffect['type'][] = ['damage', 'heal', 'status'];

export class BattleRegistry {
    private readonly units = new Map<string, UnitDef>();
    private readonly skills = new Map<string, SkillDef>();
    private readonly statuses = new Map<string, StatusDef>();
    private readonly duplicates: string[] = [];

    constructor(defs: BattleDefs) {
        for (const u of defs.units) this.put(this.units, u, '角色');
        for (const s of defs.skills) this.put(this.skills, s, '技能');
        for (const s of defs.statuses) this.put(this.statuses, s, '状态');
    }

    private put<T extends { id: string }>(map: Map<string, T>, item: T, kind: string): void {
        if (map.has(item.id)) this.duplicates.push(`${kind} id 重复：${item.id}`);
        map.set(item.id, item);
    }

    // ---------- 查询 ----------

    unit(id: string): UnitDef {
        const def = this.units.get(id);
        if (!def) throw new Error(`未登记的角色：${id}`);
        return def;
    }

    skill(id: string): SkillDef {
        const def = this.skills.get(id);
        if (!def) throw new Error(`未登记的技能：${id}`);
        return def;
    }

    status(id: string): StatusDef {
        const def = this.statuses.get(id);
        if (!def) throw new Error(`未登记的状态：${id}`);
        return def;
    }

    hasUnit(id: string): boolean {
        return this.units.has(id);
    }

    hasSkill(id: string): boolean {
        return this.skills.has(id);
    }

    allUnits(): UnitDef[] {
        return [...this.units.values()];
    }

    /** 按标签或触发方式筛选技能，例如 listSkills({ trigger: 'active' }) 列出所有手动技能 */
    listSkills(filter: { tag?: string; trigger?: SkillTrigger['type'] } = {}): SkillDef[] {
        return [...this.skills.values()].filter(
            (s) => (!filter.tag || s.tags?.includes(filter.tag)) && (!filter.trigger || s.trigger.type === filter.trigger),
        );
    }

    /** 哪些角色带了这个技能 */
    unitsWithSkill(skillId: string): UnitDef[] {
        return this.allUnits().filter((u) => u.skills.includes(skillId));
    }

    // ---------- 调试 ----------

    /** 临时覆盖技能数值（只影响之后开始的战斗），比如 override('molotov', { cooldown: 5 }) */
    override(skillId: string, patch: Partial<Omit<SkillDef, 'id'>>): void {
        this.skills.set(skillId, { ...this.skill(skillId), ...patch });
    }

    /** 生成技能的中文说明，例如“【燃烧瓶】手动释放，冷却 15 秒。对最近的敌人及周围 2 格：造成 120% 攻击力的火焰伤害……” */
    describeSkill(id: string): string {
        const s = this.skill(id);
        const trigger = describeTrigger(s.trigger);
        const cd = s.cooldown > 0 ? `，冷却 ${s.cooldown} 秒` : '';
        const target = TARGET_TEXT[s.targeting.rule] + (s.targeting.radius ? `及周围 ${s.targeting.radius} 格` : '');
        const effects = s.effects.map((e) => this.describeEffect(e)).join('，');
        return `【${s.name}】${trigger}${cd}。对${target}：${effects}。`;
    }

    private describeEffect(e: SkillEffect): string {
        switch (e.type) {
            case 'damage':
                return `造成 ${pct(e.ratio)} 攻击力的${DAMAGE_TEXT[e.damageType ?? 'physical']}伤害`;
            case 'heal':
                return `治疗 ${pct(e.ratio)} 攻击力的生命`;
            case 'status': {
                const st = this.statuses.get(e.status);
                const name = st?.name ?? e.status;
                const power = e.power ? `（强度 ${pct(e.power)} 攻击力）` : '';
                return `施加${name} ${e.duration} 秒${power}`;
            }
        }
    }

    // ---------- 检查 ----------

    validate(): string[] {
        const errors = [...this.duplicates];
        for (const u of this.units.values()) {
            for (const id of u.skills) if (!this.skills.has(id)) errors.push(`角色 ${u.id}：未登记的技能 ${id}`);
            if (u.stats.maxHp <= 0) errors.push(`角色 ${u.id}：maxHp 必须大于 0`);
            if (u.stats.attackInterval <= 0) errors.push(`角色 ${u.id}：attackInterval 必须大于 0`);
            const actives = u.skills.filter((id) => this.skills.get(id)?.trigger.type === 'active');
            if (actives.length > 1) errors.push(`角色 ${u.id}：最多只能有 1 个手动技能`);
            if (u.burrow !== undefined && u.burrow <= 0) errors.push(`角色 ${u.id}：burrow 必须大于 0`);
            const breaks = u.skills.some((id) => this.skills.get(id)?.trigger.type === 'shieldBroken');
            const shields = u.skills.some((id) => this.skills.get(id)?.effects.some((e) => e.type === 'status' && this.statuses.get(e.status)?.shield));
            if (breaks && !shields) errors.push(`角色 ${u.id}：有 shieldBroken 技能但自己没有护盾技能`);
        }
        for (const s of this.skills.values()) {
            const where = `技能 ${s.id}`;
            if (!TRIGGERS.includes(s.trigger.type)) errors.push(`${where}：未知触发方式 ${s.trigger.type}`);
            if (!TARGET_RULES.includes(s.targeting.rule)) errors.push(`${where}：未知目标规则 ${s.targeting.rule}`);
            if (s.effects.length === 0) errors.push(`${where}：没有效果`);
            if (s.trigger.type === 'onAttack' && (s.trigger.chance <= 0 || s.trigger.chance > 1)) {
                errors.push(`${where}：chance 要在 0～1 之间`);
            }
            if (s.trigger.type === 'enemyNear' && !(s.trigger.distance > 0)) errors.push(`${where}：distance 必须大于 0`);
            for (const e of s.effects) {
                if (!EFFECTS.includes(e.type)) errors.push(`${where}：未知效果 ${(e as { type: string }).type}`);
                if (e.type === 'status' && !this.statuses.has(e.status)) errors.push(`${where}：未登记的状态 ${e.status}`);
            }
        }
        for (const st of this.statuses.values()) {
            if (st.dot && st.dot.interval <= 0) errors.push(`状态 ${st.id}：dot.interval 必须大于 0`);
        }
        return errors;
    }
}

const TARGET_TEXT: Record<TargetRule, string> = {
    self: '自己',
    currentTarget: '当前目标',
    nearestEnemy: '最近的敌人',
    randomEnemy: '随机一个敌人',
    lowestHpAlly: '血量最低的队友',
    allAllies: '所有队友',
    allEnemies: '所有敌人',
};

const DAMAGE_TEXT = { physical: '物理', fire: '火焰', poison: '毒素', true: '真实' };

function pct(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
}

function describeTrigger(t: SkillTrigger): string {
    switch (t.type) {
        case 'active':
            return '手动释放';
        case 'auto':
            return '自动释放';
        case 'onAttack':
            return `普攻时 ${pct(t.chance)} 概率触发`;
        case 'battleStart':
            return '开战时触发';
        case 'hpBelow':
            return `生命低于 ${pct(t.ratio)} 时触发一次`;
        case 'onDeath':
            return '死亡时触发';
        case 'enemyNear':
            return `敌人走到 ${t.distance} 格以内时触发一次`;
        case 'shieldBroken':
            return '护盾被打掉时触发一次';
    }
}
