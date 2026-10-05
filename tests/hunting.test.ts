import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { groundDef, huntableGame, hunterSkill } from '../assets/scripts/core/hunting';
import { loadConfig, MIN, T0 } from './helpers';

function newGame(seed = 4) {
    const game = CampGame.newGame(loadConfig(), T0, seed);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('打猎', () => {
    it('不同的猎场能打到的东西不一样：河滩能钓鱼，水库有野猪', () => {
        const config = loadConfig();
        const game = newGame();
        const ids = (d: string) => huntableGame(config, game.state, groundDef(config, d)!, T0).map((g) => g.id);
        expect(ids('riverbank')).toContain('fish');
        expect(ids('reservoir')).toContain('boar');
        expect(ids('backyards')).not.toContain('deer');
    });

    it('派人去打猎：人在外面不能干活，回来带回食物', () => {
        let got = false;
        for (const seed of [1, 2, 3, 4, 5]) {
            const game = newGame(seed);
            const { config, state } = game;
            state.resources.food = 0;
            expect(game.hunt('park_woods', T0, ['derek', 'toby']).ok).toBe(true);
            expect(game.assign('derek', 'kitchen', T0).ok).toBe(false);
            game.tick(T0 + (config.hunting!.minutes + 1) * MIN);
            expect(state.hunts).toHaveLength(0);
            expect(state.stats.hunts_done).toBe(1);
            if (state.resources.food > 0) got = true;
        }
        expect(got).toBe(true);
    });

    it('拿猎弓的人更会打猎；农夫更会钓鱼', () => {
        const game = newGame();
        const { config, state } = game;
        const before = hunterSkill(config, state, 'toby', 'hunt');
        state.props = { hunting_bow: 1 };
        game.equip('toby', 'hunting_bow', T0);
        expect(hunterSkill(config, state, 'toby', 'hunt')).toBeGreaterThan(before);
        expect(hunterSkill(config, state, 'toby', 'fish')).toBe(1);
    });

    it('远的猎场要交通工具；同一个猎场不能同时去两拨人', () => {
        const game = newGame();
        expect(game.hunt('reservoir', T0, ['derek']).ok).toBe(false);
        game.hunt('park_woods', T0, ['derek']);
        expect(game.hunt('park_woods', T0, ['toby'])).toEqual({ ok: false, reason: '已经有人在这里打猎了' });
    });
});
