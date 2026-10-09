// 资料库第三批采用的点子：R73 波次提示、R74 最后防线（陷阱）、R75 丧尸花样
import { describe, expect, it } from 'vitest';
import { Battle, BattleSetup, UnitSetup, waveTimes } from '../assets/scripts/core/battle/Battle';
import { BattleRegistry } from '../assets/scripts/core/battle/registry';
import { CampGame } from '../assets/scripts/core/CampGame';
import { attackedGates, expeditionSetup, raidSetup, squadOf, trapAtk } from '../assets/scripts/core/combat';
import { consumeUsedItems, equipItems } from '../assets/scripts/core/crafting';
import { loadConfig, T0 } from './helpers';

const WALL: UnitSetup = { unit: 'barricade', x: 1.5, maxHp: 5000, tag: 'barricade', atk: 40 };

function battle(allies: UnitSetup[], enemies: UnitSetup[], extra: Partial<BattleSetup> = {}) {
    return new Battle(new BattleRegistry(loadConfig()), {
        allies,
        enemies,
        timeLimit: 60,
        timeoutResult: 'win',
        seed: 3,
        mustSurvive: ['barricade'],
        allyHoldLine: 1.5,
        ...extra,
    });
}

function runUntil(b: Battle, done: () => boolean, maxSeconds = 60) {
    for (let i = 0; i < maxSeconds * 10 && !done() && b.result === 'ongoing'; i++) b.step();
}

describe('R75 丧尸花样', () => {
    it('撑杆跳丧尸碰到栅栏就跳过去，之后只打人', () => {
        const b = battle([WALL, { unit: 'militia', x: -3, tag: 'a' }], [{ unit: 'vaulter', x: 6 }]);
        const vaulter = b.units.find((u) => u.def.id === 'vaulter')!;
        runUntil(b, () => b.events.some((e) => e.type === 'leap'));
        expect(b.events.some((e) => e.type === 'leap' && e.unit === vaulter.uid)).toBe(true);
        expect(vaulter.x).toBeLessThan(1.5);
        runUntil(b, () => b.events.some((e) => e.type === 'attack' && e.source === vaulter.uid), 20);
        const wall = b.units.find((u) => u.tag === 'barricade')!;
        const hitWall = b.events.some((e) => e.type === 'attack' && e.source === vaulter.uid && e.target === wall.uid);
        expect(hitWall).toBe(false);
    });

    it('钻地丧尸从栅栏后面的地下钻出来；没有栅栏就正常出场', () => {
        const b = battle([WALL, { unit: 'militia', x: -3, tag: 'a' }], [{ unit: 'burrower', spawnAt: 1 }]);
        runUntil(b, () => b.units.some((u) => u.def.id === 'burrower'));
        const burrower = b.units.find((u) => u.def.id === 'burrower')!;
        expect(Math.abs(burrower.x - (1.5 - 1.5))).toBeLessThan(0.3);
        expect(b.events.some((e) => e.type === 'burrow')).toBe(true);
        const open = battle([{ unit: 'militia', x: 0, tag: 'a' }], [{ unit: 'burrower' }], { mustSurvive: [] });
        expect(open.units.find((u) => u.def.id === 'burrower')!.x).toBeGreaterThan(5);
    });

    it('举门丧尸的车门先挡伤害，打掉之后暴怒', () => {
        const b = battle([WALL, { unit: 'militia', x: 0, tag: 'a', atkMult: 3 }], [{ unit: 'door_bearer', x: 2.4 }]);
        const door = b.units.find((u) => u.def.id === 'door_bearer')!;
        b.step();
        expect(door.statuses.some((s) => s.def.shield)).toBe(true);
        expect(door.statuses.some((s) => s.def.id === 'enraged')).toBe(false);
        runUntil(b, () => !door.statuses.some((s) => s.def.shield), 40);
        expect(door.statuses.some((s) => s.def.id === 'enraged') || !door.alive).toBe(true);
    });
});

describe('R74 最后防线：陷阱', () => {
    it('丧尸走近栅栏时触发一次，只触发一次', () => {
        const b = battle([{ ...WALL, extraSkills: ['trap_bear'] }], [{ unit: 'walker', x: 5 }, { unit: 'walker', x: 8 }]);
        runUntil(b, () => false, 30);
        const fired = b.events.filter((e) => e.type === 'skill' && e.skill === 'trap_bear');
        expect(fired).toHaveLength(1);
        const hit = b.events.find((e) => e.type === 'damage' && e.skill === 'trap_bear');
        expect(hit && hit.type === 'damage' && hit.amount).toBeGreaterThan(50);
    });

    it('陷阱只装在栅栏上，探索不带；没触发就不扣库存', () => {
        const game = CampGame.newGame(loadConfig(), T0, 4);
        const { config, state } = game;
        state.items = { bear_trap: 2, landmine: 1, molotov: 1 };
        const squad = squadOf(config, state, state.survivors.slice(0, 3).map((s) => s.id));
        const raid = raidSetup(config, config.raids[0], squad, 800, 1, 1);
        const carried = equipItems(config, state, raid.allies);
        // 陷阱依次装在门上，今晚被攻打的门排在最前面
        const walls = raid.allies.filter((a) => a.unit === 'barricade');
        expect(walls[0].gate).toBe(attackedGates(config.raids[0], 1)[0]);
        expect(walls[0].extraSkills).toEqual(['trap_bear']);
        expect(walls[1].extraSkills).toEqual(['trap_mine']);
        expect(walls[0].atk).toBe(trapAtk(config, 1));
        expect(carried.filter((c) => c.item.trap).map((c) => c.item.id)).toEqual(['bear_trap', 'landmine']);
        expect(raid.allies.some((a) => a.unit !== 'barricade' && a.extraSkills?.includes('item_molotov'))).toBe(true);

        const exp = expeditionSetup(config, config.locations[0], squad, 1, 1);
        const expCarried = equipItems(config, state, exp.allies);
        expect(expCarried.some((c) => c.item.trap)).toBe(false);

        // 敌人永远走不到栅栏：陷阱没触发，库存不变
        const quiet = new Battle(new BattleRegistry(config), { ...raid, enemies: [{ unit: 'walker', x: 1000 }], timeLimit: 3 });
        quiet.runToEnd();
        consumeUsedItems(state, quiet, carried);
        expect(state.items.bear_trap).toBe(2);
        expect(state.items.landmine).toBe(1);
    });
});

describe('R73 波次', () => {
    it('按出场时间分波', () => {
        const config = loadConfig();
        const raid = config.raids.find((r) => r.id === 'horde')!;
        const setup = raidSetup(config, raid, [], 500, 1, 1);
        expect(waveTimes(setup)).toEqual([0, 4, 8, 10, 12, 16]);
    });

    it('有一种尸潮专门出怪异的丧尸', () => {
        const config = loadConfig();
        const ids = new Set(config.raids.flatMap((r) => r.enemies.map((e) => e.unit)));
        for (const id of ['vaulter', 'door_bearer', 'burrower']) expect(ids).toContain(id);
    });
});
