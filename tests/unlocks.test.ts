import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { isUnlocked } from '../assets/scripts/core/unlocks';
import { dayStart, loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig({ soloStart: true }), T0, 4);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('新手节奏：功能慢慢解锁', () => {
    it('开局只有基础页签，第二天、第三天陆续解锁，并且只提示一次', () => {
        const game = newGame();
        game.tick(T0 + MIN);
        for (const id of ['bounties', 'achievements', 'workshop', 'rank', 'hunting']) expect(game.unlocked(id)).toBe(false);
        // 配置里没写的功能一直开放
        expect(game.unlocked('camp')).toBe(true);
        expect(game.unlocked('explore')).toBe(true);

        game.tick(dayStart(2) + MIN);
        game.collectProduce(dayStart(2) + 2 * MIN);
        expect(game.unlocked('bounties')).toBe(true);
        expect(game.unlocked('hunting')).toBe(true);
        expect(game.unlocked('workshop')).toBe(false);
        const first = game.newUnlocks.map((f) => f.id);
        expect(first).toContain('bounties');
        game.newUnlocks.length = 0;

        game.collectProduce(dayStart(3) + MIN);
        expect(game.unlocked('workshop')).toBe(true);
        expect(game.unlocked('rank')).toBe(true);
        expect(game.newUnlocks.map((f) => f.id)).not.toContain('bounties');
    });

    it('建好工坊马上解锁工坊页', () => {
        const game = newGame();
        game.state.buildings.workshop.level = 1;
        game.collectProduce(T0 + MIN);
        expect(game.unlocked('workshop')).toBe(true);
    });

    it('老存档没有解锁记录：全部算已解锁', () => {
        const game = newGame();
        delete game.state.unlocked;
        expect(isUnlocked(game.config, game.state, 'rank')).toBe(true);
    });
});
