import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { productionPerMinute } from '../assets/scripts/core/economy';
import { gearInBag, gearStatsText } from '../assets/scripts/core/gear';
import { propCount, propDef } from '../assets/scripts/core/props';
import { killSurvivor } from '../assets/scripts/core/roster';
import { combatMultiplier, scoutMultiplier } from '../assets/scripts/core/talents';
import { dayStart, loadConfig, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('装备', () => {
    it('开局背包里有一根棒球棍，穿上后攻击变高，从背包里拿走', () => {
        const game = newGame();
        const { config, state } = game;
        expect(gearInBag(config, state, 'weapon').map((d) => d.id)).toContain('bat');
        const before = combatMultiplier(config, state, 'toby').atk;
        expect(game.equip('toby', 'bat', T0).ok).toBe(true);
        expect(propCount(state, 'bat')).toBe(0);
        expect(combatMultiplier(config, state, 'toby').atk).toBeCloseTo(before * propDef(config, 'bat')!.gear!.atk!);
        expect(game.useProp('bat', T0).ok).toBe(false);
    });

    it('同一位置换装备，旧的放回背包；脱下也放回背包', () => {
        const game = newGame();
        const { state } = game;
        state.props = { bat: 1, fire_axe: 1 };
        game.equip('derek', 'bat', T0);
        game.equip('derek', 'fire_axe', T0);
        expect(state.props).toMatchObject({ bat: 1, fire_axe: 0 });
        expect(game.unequip('derek', 'weapon', T0).ok).toBe(true);
        expect(state.props.fire_axe).toBe(1);
        expect(game.unequip('derek', 'weapon', T0).ok).toBe(false);
    });

    it('工具加岗位产量，登山靴让侦察更快', () => {
        const game = newGame();
        const { config, state } = game;
        for (const s of state.survivors) game.assign(s.id, null, T0);
        state.survivors.forEach((s) => (s.mood = 50));
        game.assign('martha', 'kitchen', T0);
        const food = productionPerMinute(config, state).food;
        state.props = { chef_knife: 1, hiking_boots: 1 };
        game.equip('martha', 'chef_knife', T0);
        expect(productionPerMinute(config, state).food).toBeCloseTo(food * 1.2);
        const scout = scoutMultiplier(config, state, 'toby');
        game.equip('toby', 'hiking_boots', T0);
        expect(scoutMultiplier(config, state, 'toby')).toBeCloseTo(scout * 0.7);
        expect(gearStatsText(config, propDef(config, 'chef_knife')!)).toBe('厨房产量 +20%');
    });

    it('工坊打造装备要工坊等级和资源', () => {
        const game = newGame();
        const { state } = game;
        state.buildings.workshop.level = 0;
        expect(game.forge('bat', T0)).toEqual({ ok: false, reason: '需要先建造工坊' });
        state.buildings.workshop.level = 1;
        state.resources.wood = 500;
        state.resources.parts = 100;
        const n = propCount(state, 'bat');
        expect(game.forge('bat', T0).ok).toBe(true);
        expect(propCount(state, 'bat')).toBe(n + 1);
        expect(game.forge('pistol', T0).ok).toBe(false);
    });

    it('人死了，装备留在营地', () => {
        const game = newGame();
        const { config, state } = game;
        game.equip('toby', 'bat', T0);
        killSurvivor(config, state, 'toby', dayStart(10), '牺牲了');
        expect(propCount(state, 'bat')).toBe(1);
    });
});
