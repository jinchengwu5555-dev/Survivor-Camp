import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { realSeconds } from '../assets/scripts/core/clock';
import { offlineRewardPreview } from '../assets/scripts/core/offline';
import { currentDay } from '../assets/scripts/core/state';
import { loadConfig, MIN, HOUR, T0 } from './helpers';

const config = loadConfig();
const { onlineTimeScale: SCALE, onlineGapSeconds: GAP } = config.balance.clock;
const SEC = 1000;

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    return game;
}

/** 在线玩 realMs 毫秒，每秒一次心跳 */
function playOnline(game: CampGame, from: number, realMs: number): number {
    let t = from;
    for (; t < from + realMs; ) {
        t += SEC;
        game.online(t);
    }
    return t;
}

describe('在线时钟', () => {
    it('在线时游戏时间按倍速前进', () => {
        const game = newGame();
        playOnline(game, T0, 60 * SEC);
        expect(game.now).toBe(T0 + 60 * SEC * SCALE);
        expect(game.state.lastTickAt).toBe(game.now);
        expect(game.state.clock.onlineMs).toBe(60 * SEC);
    });

    it('一天的长度 = dayLengthMinutes / 倍速 分钟的在线时间', () => {
        const game = newGame();
        const onlineMinutesPerDay = config.balance.dayLengthMinutes / SCALE;
        playOnline(game, T0, onlineMinutesPerDay * MIN);
        expect(currentDay(game.config, game.state, game.now)).toBe(2);
    });

    it('离线期间游戏时间停住：不吃饭、不守夜', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        const food = game.state.resources.food;
        const { now } = game.online(T0 + 8 * HOUR);
        expect(now).toBe(T0);
        expect(game.state.reports).toHaveLength(0);
        expect(game.state.resources.food).toBeGreaterThanOrEqual(food);
    });

    it('超过 onlineGapSeconds 的间隔算离线，不算在线时间', () => {
        const game = newGame();
        game.online(T0 + (GAP + 1) * SEC);
        expect(game.now).toBe(T0);
        game.online(T0 + (GAP + 2) * SEC);
        expect(game.now).toBe(T0 + SEC * SCALE);
    });

    it('把手机时间往回拨不会让游戏时间倒退，也拿不到重复的离线收益', () => {
        const game = newGame();
        game.assign('martha', 'kitchen', T0);
        game.state.resources.food = 0;
        game.online(T0 + 2 * HOUR);
        const food = game.state.resources.food;
        game.online(T0); // 往回拨
        expect(game.now).toBe(T0);
        game.online(T0 + 2 * HOUR); // 再拨回来
        expect(game.state.resources.food).toBe(food);
        game.online(T0 + 3 * HOUR); // 超过之前的最大时间，只算多出来的 1 小时
        expect(game.state.resources.food).toBeGreaterThan(food);
    });

    it('倒计时按在线的真实秒数显示', () => {
        expect(realSeconds(config, SCALE * 60 * SEC)).toBe(60);
    });
});

describe('离线挂机收益', () => {
    it('按工人的产量发一小笔，只发配置里的资源', () => {
        const game = newGame();
        game.assign('martha', 'kitchen', T0);
        game.state.resources.food = 0;
        const bag = offlineRewardPreview(game.config, game.state, 4 * HOUR);
        expect(bag.food).toBeGreaterThan(0);
        for (const id of Object.keys(bag)) expect(game.config.balance.offline.resources).toContain(id);
        const { offlineReward } = game.online(T0 + 4 * HOUR);
        expect(offlineReward?.food).toBe(bag.food);
        expect(game.state.stats.offline_rewards).toBe(1);
        expect(game.state.log[game.state.log.length - 1].text).toContain('离线');
    });

    it('最多算 capHours 小时，太短不发', () => {
        const game = newGame();
        game.assign('martha', 'kitchen', T0);
        const cap = game.config.balance.offline.capHours;
        expect(offlineRewardPreview(game.config, game.state, cap * HOUR)).toEqual(offlineRewardPreview(game.config, game.state, 3 * cap * HOUR));
        expect(offlineRewardPreview(game.config, game.state, (game.config.balance.offline.minMinutes - 1) * MIN)).toEqual({});
    });

    it('营地覆灭后没有离线收益', () => {
        const game = newGame();
        game.assign('martha', 'kitchen', T0);
        game.state.gameOver = { at: T0, day: 1, cause: '测试' };
        expect(game.online(T0 + 4 * HOUR).offlineReward).toBeNull();
    });
});

describe('暂停', () => {
    it('暂停时游戏时间不走，也不发离线收益；继续后正常走', () => {
        const game = CampGame.newGame(loadConfig(), T0, 1);
        game.setPaused(true, T0);
        const t = game.now;
        expect(game.online(T0 + 5_000).now).toBe(t);
        expect(game.online(T0 + 3 * 3600_000).offlineReward).toBeNull();
        game.setPaused(false, T0 + 3 * 3600_000);
        expect(game.online(T0 + 3 * 3600_000 + 1000).now).toBeGreaterThan(t);
    });
});
