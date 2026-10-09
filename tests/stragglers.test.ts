// 白天的游荡丧尸：白天时不时刷一小群，及时清理有奖励；没人管就自己撞上门，门受额外损伤
import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { activeStragglers, isDaytime, spawnStragglers, updateStragglers } from '../assets/scripts/core/stragglers';
import { dayStart, loadConfig, MIN } from './helpers';

function newGame(live = true) {
    const config = loadConfig();
    config.balance.stragglers = { ...config.balance.stragglers!, chance: 1 };
    const t = dayStart(3);
    const game = CampGame.newGame(config, t, 5);
    game.liveRaids = live;
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    game.state.createdAt = dayStart(1);
    game.state.flags.push('raids_started');
    return { game, config, t };
}

/** 找一个白天的时刻 */
function daytime(game: CampGame, from: number): number {
    for (let t = from; t < from + 200 * MIN; t += MIN) if (isDaytime(game.config, game.state, t)) return t;
    throw new Error('找不到白天');
}

describe('白天的游荡丧尸', () => {
    it('白天到时间会刷出一群，摸到门口之前可以派人清理，打赢有奖励', () => {
        const { game, config, t } = newGame();
        const now = daytime(game, t);
        game.state.nextStragglerAt = now;
        updateStragglers(config, game.state, now, true);
        const group = activeStragglers(game.state)[0];
        expect(group).toBeDefined();
        expect(group.enemies.length).toBeGreaterThanOrEqual(config.balance.stragglers!.size[0]);
        const parts = game.state.resources.parts;
        const res = game.clearStragglers(group.id, now + MIN);
        expect(res.ok).toBe(true);
        expect(res.report?.setup.camp).toBeDefined();
        expect(activeStragglers(game.state)).toHaveLength(0);
        if (res.report!.result === 'win') {
            expect(game.state.resources.parts).toBeGreaterThan(parts);
            expect(game.state.stats.stragglers_cleared).toBe(1);
        }
        expect(game.clearStragglers(group.id, now + 2 * MIN).ok).toBe(false);
    });

    it('没人管：到时间自己打起来，没有奖励，门额外受损', () => {
        const { game, config, t } = newGame();
        const now = daytime(game, t);
        const group = spawnStragglers(config, game.state, now);
        game.state.wallWear = 0;
        updateStragglers(config, game.state, group.arriveAt, true);
        expect(activeStragglers(game.state)).toHaveLength(0);
        expect(game.state.reports[game.state.reports.length - 1].title).toBe('游荡的丧尸');
        expect(game.state.wallWear).toBeGreaterThanOrEqual(config.balance.stragglers!.wallDamage);
    });

    it('晚上不刷；尸潮还没开始也不刷；模拟模式一出现就清理掉', () => {
        const { game, config, t } = newGame(false);
        let night = t;
        while (isDaytime(config, game.state, night)) night += MIN;
        game.state.nextStragglerAt = night;
        updateStragglers(config, game.state, night, false);
        expect(game.state.stats.stragglers_cleared ?? 0).toBe(0);
        const now = daytime(game, night);
        game.state.flags = game.state.flags.filter((f) => f !== 'raids_started');
        game.state.nextStragglerAt = now;
        updateStragglers(config, game.state, now, false);
        expect(game.state.reports.filter((r) => r.title === '游荡的丧尸')).toHaveLength(0);
        game.state.flags.push('raids_started');
        game.state.nextStragglerAt = now;
        updateStragglers(config, game.state, now, false);
        expect(activeStragglers(game.state)).toHaveLength(0);
        expect(game.state.reports.filter((r) => r.title === '游荡的丧尸')).toHaveLength(1);
    });
});
