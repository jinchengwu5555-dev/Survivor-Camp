import { describe, expect, it } from 'vitest';
import { Battle, BattleSetup, UnitSetup } from '../assets/scripts/core/battle/Battle';
import { BattleRegistry } from '../assets/scripts/core/battle/registry';
import { applyStatus, canAct, canCast, canMove, effectiveMoveSpeed } from '../assets/scripts/core/battle/status';
import { BattleUnit } from '../assets/scripts/core/battle/types';
import { createBattleUnit, statsAtLevel } from '../assets/scripts/core/battle/units';
import { loadConfig } from './helpers';

/** 战斗引擎的测试：给伊森装回技能，测技能系统本身（游戏里幸存者已经没有技能了，敌人和工坊物品还在用） */
function registry() {
    const config = loadConfig();
    config.units.find((u) => u.id === 'ethan')!.skills = ['cover_fire', 'leader_call', 'last_stand'];
    return new BattleRegistry(config);
}

function battle(allies: UnitSetup[], enemies: UnitSetup[], extra: Partial<BattleSetup> = {}, reg = registry()) {
    return new Battle(reg, { allies, enemies, timeLimit: 120, timeoutResult: 'lose', seed: 1, ...extra });
}

/** 两个单位离得很远、不会自己打起来，方便单独测试某个模块 */
function duel(allyId: string, enemyId: string) {
    const b = battle([{ unit: allyId, x: 0 }], [{ unit: enemyId, x: 1000 }]);
    return { b, ally: b.units[0], enemy: b.units[1] };
}

function neverCrit(u: BattleUnit) {
    u.stats.critRate = 0;
}

describe('模块 1：角色配置', () => {
    it('等级成长：属性 = 基础 + 成长 × (等级 - 1)', () => {
        const def = registry().unit('ethan');
        const lv5 = statsAtLevel(def, 5);
        expect(lv5.maxHp).toBe(420 + 40 * 4);
        expect(lv5.atk).toBe(38 + 4 * 4);
        expect(lv5.attackRange).toBe(4);
    });

    it('生成的角色满血，技能带上初始冷却', () => {
        const u = createBattleUnit(registry(), 1, 'brute', 'enemy', 1, 10);
        expect(u.hp).toBe(registry().unit('brute').stats.maxHp);
        expect(u.skills.map((s) => [s.def.id, s.cooldown])).toEqual([
            ['pounce', 3],
            ['frenzy', 0],
        ]);
    });
});

describe('模块 3：技能编排登记表', () => {
    it('当前配置没有错误', () => {
        expect(registry().validate()).toEqual([]);
    });

    it('能发现重复 id、未登记的技能和状态', () => {
        const config = loadConfig();
        config.units[0].skills.push('no_such_skill');
        config.skills.push({ ...config.skills[0] });
        config.skills[1].effects.push({ type: 'status', status: 'no_such_status', duration: 1 });
        const errors = new BattleRegistry(config).validate();
        expect(errors).toContain('技能 id 重复：cover_fire');
        expect(errors.some((e) => e.includes('no_such_skill'))).toBe(true);
        expect(errors.some((e) => e.includes('no_such_status'))).toBe(true);
    });

    it('自动生成技能说明', () => {
        expect(registry().describeSkill('molotov')).toBe(
            '【燃烧瓶】手动释放，冷却 15 秒。对最近的敌人及周围 2 格：造成 120% 攻击力的火焰伤害，施加燃烧 4 秒（强度 30% 攻击力）。',
        );
    });

    it('按触发方式筛选，按技能反查角色', () => {
        const reg = registry();
        expect(reg.listSkills({ trigger: 'active' }).map((s) => s.id)).toEqual(['cover_fire', 'hot_soup', 'molotov', 'tripwire']);
        expect(reg.unitsWithSkill('zombie_bite').map((u) => u.id)).toEqual(['walker', 'runner', 'armored', 'frenzied', 'vaulter', 'door_bearer', 'burrower']);
    });

    it('调试覆盖只影响之后创建的战斗', () => {
        const reg = registry();
        reg.override('cover_fire', { cooldown: 1 });
        const b = battle([{ unit: 'ethan' }], [{ unit: 'walker', x: 3 }], {}, reg);
        b.step();
        expect(b.useSkill(1)).toBeNull();
        expect(b.units[0].skills[0].cooldown).toBe(1);
    });
});

describe('模块 4：伤害结算管线', () => {
    it('物理伤害受防御减免：100 × 100 / (100 + 5)', () => {
        const { b, ally, enemy } = duel('ethan', 'walker');
        neverCrit(ally);
        const r = b.damage.compute(b, { source: ally, target: enemy, base: 100, damageType: 'physical', canCrit: true });
        expect(r.amount).toBe(95);
        expect(r.crit).toBe(false);
    });

    it('火焰只受一半防御，毒素和真实伤害无视防御', () => {
        const { b, ally, enemy } = duel('ethan', 'armored'); // 防御 60
        neverCrit(ally);
        const hit = (damageType: 'fire' | 'poison' | 'true') =>
            b.damage.compute(b, { source: ally, target: enemy, base: 100, damageType, canCrit: false }).amount;
        expect(hit('fire')).toBe(Math.round((100 * 100) / 130));
        expect(hit('poison')).toBe(100);
        expect(hit('true')).toBe(100);
    });

    it('暴击按暴击伤害倍率放大', () => {
        const { b, ally, enemy } = duel('ethan', 'walker');
        ally.stats.critRate = 1;
        const r = b.damage.compute(b, { source: ally, target: enemy, base: 100, damageType: 'true', canCrit: true });
        expect(r.crit).toBe(true);
        expect(r.amount).toBe(160);
    });

    it('破甲：防御减半，且受到伤害 +20%', () => {
        const { b, ally, enemy } = duel('ethan', 'armored');
        neverCrit(ally);
        applyStatus(b, enemy, 'armor_break', 5, 0, ally);
        const r = b.damage.compute(b, { source: ally, target: enemy, base: 100, damageType: 'physical', canCrit: false });
        expect(r.amount).toBe(Math.round(((100 * 100) / 130) * 1.2));
    });

    it('护盾先吸收伤害，打空后移除；伤害最少为 1', () => {
        const { b, ally, enemy } = duel('ethan', 'walker');
        applyStatus(b, enemy, 'shield', 5, 30, null);
        const r = b.damage.deal(b, { source: null, target: enemy, base: 50, damageType: 'true', canCrit: false });
        expect(r.absorbed).toBe(30);
        expect(enemy.hp).toBe(enemy.stats.maxHp - 20);
        expect(enemy.statuses).toHaveLength(0);
        expect(b.damage.compute(b, { source: ally, target: enemy, base: 0.2, damageType: 'true', canCrit: false }).amount).toBe(1);
    });

    it('可以插入新工序，例如闪避', () => {
        const { b, ally, enemy } = duel('ethan', 'walker');
        b.damage.insertBefore('crit', { name: 'dodge', run: (c) => (c.cancelled = true) });
        b.damage.deal(b, { source: ally, target: enemy, base: 100, damageType: 'true', canCrit: false });
        expect(enemy.hp).toBe(enemy.stats.maxHp);
        expect(b.damage.stages.map((s) => s.name)).toEqual(['outgoing', 'dodge', 'crit', 'defense', 'incoming', 'round']);
    });

    it('打死目标时触发死亡', () => {
        const { b, enemy } = duel('ethan', 'walker');
        b.damage.deal(b, { source: null, target: enemy, base: 999, damageType: 'true', canCrit: false });
        expect(enemy.alive).toBe(false);
        expect(b.events.some((e) => e.type === 'death' && e.unit === enemy.uid)).toBe(true);
    });
});

describe('模块 5：控制和状态', () => {
    it('眩晕：不能移动、普攻、放技能；定身：只是不能移动', () => {
        const { b, ally } = duel('ethan', 'walker');
        applyStatus(b, ally, 'stun', 1, 0, null);
        expect([canMove(ally), canAct(ally), canCast(ally)]).toEqual([false, false, false]);
        ally.statuses = [];
        applyStatus(b, ally, 'root', 1, 0, null);
        expect([canMove(ally), canAct(ally), canCast(ally)]).toEqual([false, true, true]);
    });

    it('被眩晕的单位原地不动，到期后恢复行动', () => {
        const b = battle([{ unit: 'ethan', x: 0 }], [{ unit: 'walker', x: 10 }]);
        const walker = b.units[1];
        applyStatus(b, walker, 'stun', 1, 0, null);
        for (let i = 0; i < 10; i++) b.step();
        expect(walker.x).toBe(10);
        b.step();
        expect(walker.statuses).toHaveLength(0);
        expect(walker.x).toBeLessThan(10);
    });

    it('减速降低移动速度', () => {
        const { b, enemy } = duel('ethan', 'runner');
        applyStatus(b, enemy, 'slow', 3, 0, null);
        expect(effectiveMoveSpeed(enemy)).toBeCloseTo(1.8 * 0.5);
    });

    it('中毒可以叠层（最多 5 层），每秒按层数掉血', () => {
        const { b, enemy } = duel('ethan', 'fatty');
        for (let i = 0; i < 7; i++) applyStatus(b, enemy, 'poison', 5, 10, null);
        expect(enemy.statuses[0].stacks).toBe(5);
        for (let i = 0; i < 10; i++) b.step();
        expect(enemy.hp).toBe(enemy.stats.maxHp - 50);
    });

    it('生命、存活状态：血量归零即倒下，倒下后状态清空', () => {
        const { b, enemy } = duel('ethan', 'walker');
        applyStatus(b, enemy, 'burn', 10, 500, null);
        b.step();
        for (let i = 0; i < 10; i++) b.step();
        expect(enemy.hp).toBe(0);
        expect(enemy.alive).toBe(false);
        expect(enemy.statuses).toHaveLength(0);
    });
});

describe('模块 2：技能系统', () => {
    it('手动技能：冷却中、被控制时不能放', () => {
        const b = battle([{ unit: 'ethan' }], [{ unit: 'walker', x: 3 }]);
        b.step();
        expect(b.useSkill(1)).toBeNull();
        expect(b.useSkill(1)).toBe('冷却中（12 秒）');
        const derek = battle([{ unit: 'derek' }], [{ unit: 'walker', x: 3 }]);
        applyStatus(derek, derek.units[0], 'stun', 5, 0, null);
        expect(derek.useSkill(1)).toBe('被控制中，无法释放');
    });

    it('范围技能：燃烧瓶命中目标周围 2 格内的所有敌人', () => {
        const b = battle([{ unit: 'derek' }], [{ unit: 'walker', x: 5 }, { unit: 'walker', x: 6.5 }, { unit: 'walker', x: 9 }]);
        b.useSkill(1);
        const burned = b.units.filter((u) => u.statuses.some((s) => s.def.id === 'burn')).map((u) => u.x);
        expect(burned).toEqual([5, 6.5]);
    });

    it('开战触发：伊森的领袖号令鼓舞全队', () => {
        const b = battle([{ unit: 'ethan' }, { unit: 'martha' }], [{ unit: 'walker' }]);
        b.step();
        for (const u of b.side('ally')) expect(u.statuses.map((s) => s.def.id)).toContain('inspired');
    });

    it('自动治疗：没人受伤时不放，有人受伤才放', () => {
        const b = battle([{ unit: 'sophie' }, { unit: 'martha', x: 1 }], [{ unit: 'walker', x: 50 }]);
        b.step();
        expect(b.events.some((e) => e.type === 'skill')).toBe(false);
        b.units[1].hp -= 100;
        b.step();
        expect(b.events.some((e) => e.type === 'heal' && e.target === 2)).toBe(true);
    });

    it('低血量触发只触发一次', () => {
        const { b, ally } = duel('sophie', 'walker');
        ally.skills[0].cooldown = 99; // 先让急救包扎进入冷却，否则她会先把自己奶回 30% 以上
        ally.hp = 50;
        b.step();
        b.step();
        const shields = b.events.filter((e) => e.type === 'skill' && e.skill === 'adrenaline');
        expect(shields).toHaveLength(1);
        expect(ally.statuses.some((s) => s.def.id === 'shield' && s.value === 4 * 30)).toBe(true);
    });

    it('死亡触发：胖子死后让周围的敌人中毒', () => {
        const b = battle([{ unit: 'ethan', x: 0 }, { unit: 'martha', x: 1.5 }], [{ unit: 'fatty', x: 2 }]);
        const fatty = b.units[2];
        b.damage.deal(b, { source: null, target: fatty, base: 9999, damageType: 'true', canCrit: false });
        const poisoned = b.side('ally').filter((u) => u.statuses.some((s) => s.def.id === 'poison'));
        expect(poisoned.map((u) => u.def.id)).toEqual(['ethan', 'martha']);
    });
});

describe('对战流程和胜负', () => {
    const squad: UnitSetup[] = [{ unit: 'martha' }, { unit: 'derek' }, { unit: 'ethan' }, { unit: 'toby' }, { unit: 'sophie' }];
    const horde: UnitSetup[] = [{ unit: 'walker' }, { unit: 'walker' }, { unit: 'runner' }, { unit: 'walker' }, { unit: 'fatty' }];

    it('五人小队能打赢一小波行尸', () => {
        expect(battle(squad, horde).runToEnd()).toBe('win');
    });

    it('一个人打不过尸群首领', () => {
        expect(battle([{ unit: 'sophie' }], [{ unit: 'brute' }]).runToEnd()).toBe('lose');
    });

    it('守夜模式：撑到时间结束算赢', () => {
        const b = battle([{ unit: 'martha' }], [{ unit: 'armored' }], { timeLimit: 5, timeoutResult: 'win' });
        expect(b.runToEnd()).toBe('win');
        expect(b.time).toBeCloseTo(5);
    });

    it('分波刷怪：后面的波次没出完之前不算赢', () => {
        const b = battle(squad, [{ unit: 'runner' }, { unit: 'walker', spawnAt: 30 }]);
        while (b.time < 29 && b.result === 'ongoing') b.step();
        expect(b.result).toBe('ongoing');
        expect(b.units).toHaveLength(6);
        expect(b.runToEnd()).toBe('win');
        expect(b.units).toHaveLength(7);
    });

    it('同一个种子结果完全一样，可以重放', () => {
        const a = battle(squad, horde, { seed: 99 });
        const c = battle(squad, horde, { seed: 99 });
        a.runToEnd();
        c.runToEnd();
        expect(c.events).toEqual(a.events);
    });

    it('advance 按真实时间推进，不足一步的时间会累积', () => {
        const b = battle(squad, horde);
        b.advance(0.05);
        expect(b.time).toBe(0);
        b.advance(0.05);
        expect(b.time).toBeCloseTo(0.1);
    });
});
