import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { traderPresent } from '../assets/scripts/core/trader';
import { DAY, dayStart, loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('流浪商人（R07）', () => {
    it('第 firstDay 天来，待一阵子就走，然后隔一段时间再来', () => {
        const game = newGame();
        const cfg = game.config.trader;
        game.tick(T0 + MIN);
        expect(traderPresent(game.state, game.now)).toBe(false);
        const arrive = dayStart(cfg.firstDay);
        game.tick(arrive + MIN);
        expect(traderPresent(game.state, game.now)).toBe(true);
        expect(game.state.trader!.offers).toHaveLength(cfg.offersPerVisit);
        game.tick(arrive + (cfg.stayMinutes + 1) * MIN);
        expect(traderPresent(game.state, game.now)).toBe(false);
        game.tick(arrive + (cfg.stayMinutes + cfg.intervalMinutes + 2) * MIN);
        expect(traderPresent(game.state, game.now)).toBe(true);
        expect(game.state.trader!.visit).toBe(2);
    });

    it('以物易物：付出 give 换来 get，每笔只能换一次', () => {
        const game = newGame();
        const at = dayStart(game.config.trader.firstDay) + MIN;
        game.tick(at);
        game.state.resources = { food: 199, water: 199, wood: 199, parts: 99, medicine: 20, cans: 30 };
        const offer = game.state.trader!.offers[0];
        const before = { ...game.state.resources };
        expect(game.trade(0, at).ok).toBe(true);
        for (const [id, n] of Object.entries(offer.give)) expect(game.state.resources[id as 'food']).toBeLessThanOrEqual(before[id as 'food'] - n! + (offer.get[id as 'food'] ?? 0));
        expect(game.trade(0, at)).toEqual({ ok: false, reason: '已经换过了' });
        expect(game.state.stats.trades).toBe(1);
    });

    it('东西不够不能换；看广告能刷新一次货架', () => {
        const game = newGame();
        const at = dayStart(game.config.trader.firstDay) + MIN;
        game.tick(at);
        game.state.resources = { food: 0, water: 0, wood: 0, parts: 0, medicine: 0, cans: 0 };
        expect(game.trade(0, at)).toEqual({ ok: false, reason: '东西不够换' });
        expect(game.refreshTrader(at).ok).toBe(true);
        expect(game.refreshTrader(at)).toEqual({ ok: false, reason: '这次已经刷新过了' });
    });
});

describe('红点', () => {
    it('开局没有“新内容”红点，只有“可以做”的提示', () => {
        const game = newGame();
        const b = game.badges();
        expect(b.achievements).toBe(0);
        expect(b.reports).toBe(0);
        expect(b.survivors).toBe(1); // 有人闲着、岗位有空
        expect(b.explore).toBe(1); // 小队可以出发
    });

    it('新内容出现时亮红点，打开页面后消失', () => {
        const game = newGame();
        game.badges();
        game.state.survivors.push({ id: 'leo', mood: 50, injured: false, recoverAt: null, assignment: 'kitchen' });
        game.state.buildings.kitchen.level = 5; // 保证有空位之外的计数不受影响
        game.autoAssign(T0);
        expect(game.badges().survivors).toBeGreaterThanOrEqual(1);
        game.markSeen('survivors');
        expect(game.badges().survivors).toBe(0);
    });

    it('新战报亮红点，打开战报页后消失', () => {
        const game = newGame();
        game.badges();
        game.explore('gas_station', T0);
        game.tick(T0 + 10 * MIN);
        expect(game.badges().reports).toBe(1);
        game.markSeen('reports');
        expect(game.badges().reports).toBe(0);
    });

    it('商人来了亮红点', () => {
        const game = newGame();
        game.badges();
        game.tick(dayStart(game.config.trader.firstDay) + MIN);
        expect(game.badges().trader).toBe(1);
        game.markSeen('trader');
        expect(game.badges().trader).toBe(0);
    });

    it('新解锁的地点亮红点', () => {
        const game = newGame();
        game.badges();
        game.markSeen('explore');
        game.state.flags.push('cleared_gas_station');
        expect(game.badges().explore).toBeGreaterThanOrEqual(2); // 五金店、公园
    });
});

describe('新内容', () => {
    it('枫谷公园在打下加油站后解锁，敌人是野狗（不算丧尸击杀）', () => {
        const game = newGame();
        game.state.flags.push('cleared_gas_station');
        expect(game.explore('park', T0).ok).toBe(true);
        game.tick(T0 + DAY / 2);
        expect(game.state.stats.kill_wild_dog ?? 0).toBeGreaterThan(0);
        expect(game.state.stats.zombies_killed ?? 0).toBe(0);
    });
});
