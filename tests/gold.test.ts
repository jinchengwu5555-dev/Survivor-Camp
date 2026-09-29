import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { goldOffer, goldValue } from '../assets/scripts/core/gold';
import { dayStart, loadConfig, T0 } from './helpers';

describe('黄金', () => {
    it('开局有一些黄金，前期全价，之后越来越不值钱，最后没人要', () => {
        const game = CampGame.newGame(loadConfig(), T0, 1);
        const { config, state } = game;
        const g = config.balance.gold!;
        expect(state.gold).toBe(g.start);
        expect(goldValue(config, state, dayStart(1))).toBe(1);
        const mid = goldValue(config, state, dayStart(Math.round((g.fullValueDays + g.worthlessDay) / 2)));
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(1);
        expect(goldValue(config, state, dayStart(g.worthlessDay))).toBe(0);
        expect(goldOffer(config, state, 'food', dayStart(g.worthlessDay + 5))).toBe(0);
    });

    it('花黄金换资源；没人要以后换不了', () => {
        const game = CampGame.newGame(loadConfig(), T0, 1);
        const { config, state } = game;
        state.resources.wood = 0;
        expect(game.spendGold('wood', T0).ok).toBe(true);
        expect(state.gold).toBe(config.balance.gold!.start - config.balance.gold!.lot);
        expect(state.resources.wood).toBe(config.balance.gold!.rates.wood);
        const late = dayStart(config.balance.gold!.worthlessDay + 1);
        state.lastTickAt = late - 1;
        state.nextRaidAt = Number.MAX_SAFE_INTEGER;
        expect(game.spendGold('wood', late)).toEqual({ ok: false, reason: '已经没人要黄金了' });
    });
});
