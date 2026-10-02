import { describe, expect, it } from 'vitest';
import { Battle } from '../assets/scripts/core/battle/Battle';
import { CampGame } from '../assets/scripts/core/CampGame';
import { battleRegistry, expeditionSetup, getLocation, squadOf } from '../assets/scripts/core/combat';
import { bondOf, BOND_TIERS, recordSharedBattle, sharedBattles } from '../assets/scripts/core/bonds';
import { rowOf, squadBonus, squadSynergies } from '../assets/scripts/core/formation';
import { killSurvivor } from '../assets/scripts/core/roster';
import { dayStart, loadConfig, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 9);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('站位', () => {
    it('默认拿枪的站后排，其他人站前排；可以自己改', () => {
        const game = newGame();
        const { config, state } = game;
        expect(rowOf(config, state, 'toby')).toBe('front');
        state.props = { pistol: 1 };
        game.equip('toby', 'pistol', T0);
        expect(rowOf(config, state, 'toby')).toBe('back');
        expect(game.setRow('toby', 'front', T0).ok).toBe(true);
        expect(rowOf(config, state, 'toby')).toBe('front');
    });

    it('后排站得靠后，拿着枪的射程变远', () => {
        const game = newGame();
        const { config, state } = game;
        state.props = { pistol: 1 };
        game.equip('toby', 'pistol', T0);
        const setup = expeditionSetup(config, getLocation(config, 'gas_station')!, squadOf(config, state, ['derek', 'toby']), 1, 1, 0);
        const b = new Battle(battleRegistry(config), setup);
        const derek = b.units.find((u) => u.tag === 'derek')!;
        const toby = b.units.find((u) => u.tag === 'toby')!;
        expect(toby.x).toBeLessThan(derek.x);
        expect(toby.stats.attackRange).toBeGreaterThanOrEqual(4);
    });
});

describe('人物搭配', () => {
    it('有医生、有领袖、全是后排都会列出来', () => {
        const game = newGame();
        const { config, state } = game;
        const names = squadSynergies(config, state, ['ethan', 'sophie'], T0).map((s) => s.name);
        expect(names).toContain('有人领头');
        expect(names).toContain('有医生跟着');
        game.setRow('ethan', 'back', T0);
        game.setRow('sophie', 'back', T0);
        expect(squadSynergies(config, state, ['ethan', 'sophie'], T0).map((s) => s.name)).toContain('没人顶前排');
    });

    it('一起打过 3 场以上的老搭档攻击更高', () => {
        const game = newGame();
        const { config, state } = game;
        const before = squadBonus(config, state, ['derek', 'toby'], 'derek', T0).atk;
        for (let i = 0; i < 3; i++) recordSharedBattle(state, ['derek', 'toby']);
        expect(sharedBattles(state, 'derek', 'toby')).toBe(3);
        expect(squadBonus(config, state, ['derek', 'toby'], 'derek', T0).atk).toBeCloseTo(before * 1.03);
    });
});

describe('和伊森的羁绊', () => {
    it('跟着伊森越久、一起打仗越多，羁绊越深，颜色不同', () => {
        const game = newGame();
        const { config, state } = game;
        const toby = state.survivors.find((s) => s.id === 'toby')!;
        toby.joinedAt = T0;
        expect(bondOf(config, state, toby, T0).name).toBe('陌生');
        expect(bondOf(config, state, toby, dayStart(12)).name).toBe('信赖');
        for (let i = 0; i < 80; i++) recordSharedBattle(state, ['ethan', 'toby']);
        expect(bondOf(config, state, toby, dayStart(12)).name).toBe('老战友');
        expect(new Set(BOND_TIERS.map((t) => t.color)).size).toBe(BOND_TIERS.length);
    });
});

describe('墓地', () => {
    it('有人死了写进墓地，记下跟着伊森的天数和羁绊；每座墓每天能祷告一次，大家心情变好', () => {
        const game = newGame();
        const { config, state } = game;
        const later = dayStart(10);
        state.lastTickAt = later - 1;
        killSurvivor(config, state, 'toby', later, '在测试里牺牲了');
        const grave = state.graveyard![0];
        expect(grave).toMatchObject({ id: 'toby', name: '托比', cause: '在测试里牺牲了', founder: true });
        expect(grave.days).toBeGreaterThanOrEqual(9);
        state.survivors.forEach((s) => (s.mood = 50));
        expect(game.pray('toby', later).ok).toBe(true);
        expect(state.survivors[0].mood).toBeGreaterThan(50);
        expect(game.pray('toby', later)).toEqual({ ok: false, reason: '今天已经来过了' });
    });
});
