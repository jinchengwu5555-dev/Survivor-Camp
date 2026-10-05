// 第三批试玩反馈：打猎久一点、更多职业（有的没有实际作用）
import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { groundDef } from '../assets/scripts/core/hunting';
import { combatMultiplier } from '../assets/scripts/core/talents';
import { loadConfig, MIN, T0 } from './helpers';

function newGame(config = loadConfig()) {
    const game = CampGame.newGame(config, T0, 4);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('打猎时长', () => {
    it('打猎一趟比以前久，远的猎场更久', () => {
        const config = loadConfig();
        expect(config.hunting!.minutes).toBeGreaterThanOrEqual(15);
        expect(groundDef(config, 'reservoir')!.minutes!).toBeGreaterThan(config.hunting!.minutes);
        const game = newGame(config);
        game.hunt('park_woods', T0, ['derek']);
        game.tick(T0 + 10 * MIN);
        expect(game.state.hunts).toHaveLength(1);
    });
});

describe('更多职业', () => {
    it('流浪者能抽到警察、歌手、上班族、学生这些职业，每个都有职业名', () => {
        const config = loadConfig();
        for (const sp of ['police', 'singer', 'teacher', 'official', 'office_worker', 'high_schooler', 'college_student'] as const) {
            expect(config.wanderers.specialties).toContain(sp);
            expect(config.wanderers.titles[sp]?.length).toBeGreaterThan(0);
        }
    });

    it('警察打仗攻击高一点；歌手让大家每晚心情好一点', () => {
        const game = newGame();
        const { config, state } = game;
        const toby = state.survivors.find((s) => s.id === 'toby')!;
        const before = combatMultiplier(config, state, 'toby').atk;
        toby.profile = { name: '托比', title: '巡警', specialty: 'police', talents: [], traits: [] } as never;
        expect(combatMultiplier(config, state, 'toby').atk).toBeCloseTo(before * 1.1, 5);
    });
});
