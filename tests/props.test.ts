import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { addProp, propCount, propReward, propDef, rollDrops } from '../assets/scripts/core/props';
import { applyEffect } from '../assets/scripts/core/events';
import { collectPickup } from '../assets/scripts/core/pickups';
import { loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('背包道具', () => {
    it('开局送 startingProps', () => {
        const game = newGame();
        for (const [id, n] of Object.entries(game.config.balance.startingProps ?? {})) expect(propCount(game.state, id)).toBe(n);
    });

    it('资源箱：打开得到资源，随指挥部等级成长', () => {
        const game = newGame();
        game.state.resources.food = 0;
        const def = propDef(game.config, 'ration_s')!;
        const small = propReward(game.config, game.state, def).food!;
        expect(game.useProp('ration_s', T0).ok).toBe(true);
        expect(game.state.resources.food).toBe(small);
        game.state.buildings.hq.level = 5;
        expect(propReward(game.config, game.state, def).food!).toBeGreaterThan(small);
    });

    it('加速道具：没有升级时不能用，有升级时减少剩余时间', () => {
        const game = newGame();
        expect(game.useProp('wrench', T0)).toEqual({ ok: false, reason: '没有正在升级的建筑' });
        game.state.resources.wood = 200;
        game.upgrade('hq', T0);
        const before = game.state.buildings.hq.upgradeEndsAt!;
        addProp(game.state, 'wrench', 1);
        game.useProp('wrench', T0);
        const after = game.state.buildings.hq.upgradeEndsAt;
        expect(after === null || after < before).toBe(true);
    });

    it('工具箱能直接让短的升级完成', () => {
        const game = newGame();
        game.upgrade('wall', T0);
        addProp(game.state, 'toolbox', 1);
        expect(game.useProp('toolbox', T0)).toMatchObject({ ok: true, message: '升级完成了！' });
        expect(game.state.buildings.wall.level).toBe(2);
    });

    it('对讲机让小队立即回来；医疗包治好所有伤员；咖啡提升心情', () => {
        const game = newGame();
        addProp(game.state, 'walkie', 1);
        addProp(game.state, 'field_kit', 1);
        game.explore('gas_station', T0);
        expect(game.useProp('walkie', T0).ok).toBe(true);
        expect(game.state.expeditions).toHaveLength(0);
        game.state.survivors.forEach((s) => (s.injured = true));
        expect(game.useProp('field_kit', T0).ok).toBe(true);
        expect(game.state.survivors.every((s) => !s.injured)).toBe(true);
        const mood = game.state.survivors[0].mood;
        game.useProp('coffee', T0);
        expect(game.state.survivors[0].mood).toBeGreaterThan(mood);
    });

    it('招募传单：有空床位才能用，没用掉就不扣', () => {
        const game = newGame();
        addProp(game.state, 'flyer', 1);
        const n = game.state.survivors.length;
        expect(game.useProp('flyer', T0).ok).toBe(true);
        expect(game.state.survivors.length).toBe(n + 1);
        game.state.buildings.dorm.level = 0;
        addProp(game.state, 'flyer', 1);
        expect(game.useProp('flyer', T0)).toEqual({ ok: false, reason: '没有空床位了' });
        expect(propCount(game.state, 'flyer')).toBe(1);
    });

    it('神秘补给箱开出道具或资源', () => {
        const game = newGame();
        const before = { ...game.state.props };
        const res = game.useProp('mystery_box', T0);
        expect(res.ok).toBe(true);
        expect(res.ok && res.message).toMatch(/开出了/);
        expect(propCount(game.state, 'mystery_box')).toBe((before.mystery_box ?? 0) - 1);
    });

    it('用完了就不能再用', () => {
        const game = newGame();
        game.state.props = {};
        expect(game.useProp('coffee', T0)).toEqual({ ok: false, reason: '背包里没有了' });
    });
});

describe('道具来源', () => {
    it('掉落表按概率掉落', () => {
        const game = newGame();
        const got = rollDrops(game.state, [{ prop: 'coffee' }, { prop: 'wrench', chance: 0 }]);
        expect(got).toEqual({ coffee: 1 });
    });

    it('探索打赢可能找到道具，写进战报', () => {
        const game = newGame();
        game.config.locations.find((l) => l.id === 'gas_station')!.drops = [{ prop: 'toolbox' }];
        const before = propCount(game.state, 'toolbox');
        game.explore('gas_station', T0);
        game.tick(T0 + 10 * MIN);
        expect(propCount(game.state, 'toolbox')).toBe(before + 1);
        expect(game.state.reports[0].summary).toContain('工具箱');
    });

    it('事件可以给道具（prop 效果）', () => {
        const game = newGame();
        applyEffect(game.config, game.state, { type: 'prop', prop: 'flyer', amount: 2 }, T0);
        expect(propCount(game.state, 'flyer')).toBe(2);
    });

    it('拾荒物可能顺便带道具', () => {
        const game = newGame();
        game.config.pickups.kinds.find((k) => k.id === 'crate')!.drops = [{ prop: 'coffee' }];
        game.state.pickups = [{ id: 999, kind: 'crate', expiresAt: T0 + MIN }];
        const before = propCount(game.state, 'coffee');
        expect(collectPickup(game.config, game.state, 999, T0).found).toContain('咖啡');
        expect(propCount(game.state, 'coffee')).toBe(before + 1);
    });

    it('新得到道具时背包亮红点', () => {
        const game = newGame();
        game.badges();
        addProp(game.state, 'coffee', 1);
        expect(game.badges().props).toBeGreaterThan(0);
        game.markSeen('props');
        expect(game.badges().props).toBe(0);
    });
});
