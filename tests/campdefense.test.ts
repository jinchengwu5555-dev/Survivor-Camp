// 俯视守夜：四面围墙、四个门、营地核心；尸群从几个方向来，守夜的人分到门上
import { describe, expect, it } from 'vitest';
import { Battle } from '../assets/scripts/core/battle/Battle';
import { insideCamp } from '../assets/scripts/core/battle/geometry';
import { CampGame } from '../assets/scripts/core/CampGame';
import { attackedGates, battleRegistry, raidSetup, squadOf } from '../assets/scripts/core/combat';
import { campGates } from '../assets/scripts/core/wall';
import { loadConfig, T0 } from './helpers';

function setup(raidId = 'horde', wallHp = 1500, seed = 2) {
    const config = loadConfig();
    const game = CampGame.newGame(config, T0, 1);
    const squad = squadOf(config, game.state, game.state.survivors.map((s) => s.id));
    const raid = config.raids.find((r) => r.id === raidId)!;
    return { config, raid, setup: raidSetup(config, raid, squad, wallHp, 1, seed) };
}

describe('俯视守夜', () => {
    it('四个门 + 营地核心；守夜的人分到今晚被攻打的门；丧尸都在墙外出生', () => {
        const { config, raid, setup: s } = setup();
        const camp = s.camp!;
        expect(s.allies.filter((a) => a.gate !== undefined)).toHaveLength(4);
        expect(s.allies.some((a) => a.tag === 'camp_core')).toBe(true);
        const sides = attackedGates(raid, s.seed);
        expect(sides).toHaveLength(raid.sides!);
        for (const p of s.allies.filter((a) => a.post !== undefined)) expect(sides).toContain(p.post);
        for (const e of s.enemies) expect(insideCamp(camp, { x: e.x!, y: e.y! })).toBe(false);
        // 小丧尸变成了一大群
        expect(s.enemies.length).toBeGreaterThan(raid.enemies.length * 2);
        expect(config.balance.camp!.swarm!.count).toBeGreaterThan(1);
    });

    it('门没破之前，墙外的丧尸只打门；门破了就有丧尸进到营地里', () => {
        const { config, setup: s } = setup('horde', 60);
        const b = new Battle(battleRegistry(config), s);
        let entered = false;
        let brokeAt = Infinity;
        while (b.result === 'ongoing') {
            const before = b.events.length;
            b.step();
            if (brokeAt === Infinity && b.units.some((u) => u.gate !== undefined && !u.alive)) brokeAt = b.time;
            for (const e of b.events.slice(before)) {
                if (e.type !== 'attack') continue;
                const src = b.getUnit(e.source)!;
                const tgt = b.getUnit(e.target)!;
                if (src.side === 'enemy' && b.time < brokeAt && !insideCamp(s.camp!, src)) expect(tgt.gate).toBeDefined();
            }
            if (b.units.some((u) => u.side === 'enemy' && u.alive && insideCamp(s.camp!, u) && !u.ignoreStructures)) entered = true;
        }
        expect(brokeAt).toBeLessThan(Infinity);
        expect(entered).toBe(true);
    });

    it('调人去守别的门：记进操作，重放结果一样', () => {
        const { config, setup: s } = setup('strange_horde');
        const b = new Battle(battleRegistry(config), s);
        b.step();
        const who = b.units.find((u) => u.post !== undefined)!;
        const target = (who.post! + 1) % 4;
        expect(b.assignPost(who.uid, target)).toBeNull();
        expect(b.assignPost(who.uid, target)).toBe('已经在守这个门了');
        expect(b.assignPost(who.uid, 9)).toBe('没有这个门');
        for (let i = 0; i < 60; i++) b.step();
        const gate = s.camp!.gates[target];
        expect(Math.hypot(who.x - gate.x, who.y - gate.y)).toBeLessThan(3.5);
        b.runToEnd();
        const replay = new Battle(battleRegistry(config), { ...s, inputs: [...b.inputs] });
        replay.runToEnd();
        expect(replay.result).toBe(b.result);
        expect(replay.time).toBe(b.time);
        expect(replay.units.map((u) => u.alive)).toEqual(b.units.map((u) => u.alive));
    });

    it('守夜的人全倒下就算失守', () => {
        const config = loadConfig();
        const s = raidSetup(config, config.raids[0], [], 5000, 1, 1);
        const b = new Battle(battleRegistry(config), s);
        b.runToEnd();
        expect(b.result).toBe('lose');
    });

    it('开局只有一个门，栅栏升级一个个开；没门的那面丧尸要绕到门口', () => {
        const config = loadConfig();
        const game = CampGame.newGame(config, T0, 1);
        game.state.buildings.wall.level = 1;
        expect(campGates(config, game.state)).toEqual([2]);
        game.state.buildings.wall.level = 3;
        expect(campGates(config, game.state)).toEqual([0, 2]);
        game.state.buildings.wall.level = 9;
        expect(campGates(config, game.state)).toEqual([0, 1, 2, 3]);
        // 只有南门，尸群从北边来：要绕过去打南门，门没破之前进不了营地
        const raid = { ...config.raids.find((r) => r.id === 'horde')!, sides: 1 };
        const squad = squadOf(config, game.state, game.state.survivors.map((s) => s.id));
        const s = raidSetup(config, raid, squad, 3000, 1, 4 * 7 + 0, { gates: [2] });
        expect(s.allies.filter((a) => a.gate !== undefined).map((a) => a.gate)).toEqual([2]);
        const b = new Battle(battleRegistry(config), s);
        let hitSouth = false;
        while (b.result === 'ongoing') {
            const before = b.events.length;
            b.step();
            for (const e of b.events.slice(before)) if (e.type === 'attack' && b.getUnit(e.target)?.gate === 2) hitSouth = true;
            const gate = b.gateUnit(2);
            if (gate?.alive) for (const u of b.units) if (u.side === 'enemy' && u.alive && !u.ignoreStructures) expect(insideCamp(s.camp!, u)).toBe(false);
        }
        expect(hitSouth).toBe(true);
    });
});
