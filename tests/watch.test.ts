import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { productionPerMinute } from '../assets/scripts/core/economy';
import { sleepFactor } from '../assets/scripts/core/talents';
import { campStats } from '../assets/scripts/core/campStats';
import { planWatch, raidChanceTonight, watchersNeeded } from '../assets/scripts/core/watch';
import { dayStart, loadConfig, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('轮流守夜', () => {
    it('按人数排守夜的人：固定守夜的先上，不守夜的不排，其余精力高的先上', () => {
        const game = newGame();
        const { config, state } = game;
        const per = config.balance.nightWatch!.survivorsPerWatcher;
        expect(watchersNeeded(config, state)).toBe(Math.ceil(state.survivors.length / per));
        game.setWatch('martha', 'always', T0);
        game.setWatch('ethan', 'never', T0);
        state.survivors.find((s) => s.id === 'derek')!.sleep = 10;
        const plan = planWatch(config, state);
        expect(plan[0]).toBe('martha');
        expect(plan).not.toContain('ethan');
        expect(plan).not.toContain('derek');
    });

    it('每晚轮换：守夜的人累，其他人睡一觉恢复；轮班时谁都不会累垮', () => {
        const game = newGame();
        const { state } = game;
        let t = state.nextRaidAt;
        for (let night = 0; night < 12; night++) {
            state.resources.food = 10_000;
            game.tick(t);
            t = state.nextRaidAt;
        }
        expect(state.lastNight).toBeTruthy();
        expect(state.survivors).toHaveLength(5);
        const cfg = game.config.balance.nightWatch!;
        for (const s of state.survivors) expect(s.sleep ?? 100).toBeGreaterThanOrEqual(cfg.tiredBelow);
    });

    it('一直让同一个人守夜，他会累垮，干活变慢', () => {
        const game = newGame();
        const { config, state } = game;
        game.setWatch('martha', 'always', T0);
        let t = state.nextRaidAt;
        for (let night = 0; night < 4; night++) {
            game.tick(t);
            t = state.nextRaidAt;
        }
        const martha = state.survivors.find((s) => s.id === 'martha')!;
        expect(martha.sleep).toBe(0);
        expect(sleepFactor(config, martha)).toBeCloseTo(config.balance.nightWatch!.minFactor);
        for (const s of state.survivors) game.assign(s.id, null, t);
        state.survivors.forEach((s) => (s.mood = 50));
        game.assign('martha', 'kitchen', t);
        const tired = productionPerMinute(config, state).food;
        martha.sleep = 100;
        expect(tired).toBeCloseTo(productionPerMinute(config, state).food * config.balance.nightWatch!.minFactor);
    });
});

describe('安静的夜晚', () => {
    it('第一次尸潮必来，之后按概率，天数越多越可能来', () => {
        const game = newGame();
        const { config, state } = game;
        expect(raidChanceTonight(config, state, T0)).toBe(1);
        state.raidCount = 1;
        const early = raidChanceTonight(config, state, dayStart(2));
        const late = raidChanceTonight(config, state, dayStart(40));
        expect(early).toBeLessThan(1);
        expect(late).toBeGreaterThan(early);
        expect(late).toBeLessThanOrEqual(config.balance.raidChance!.max);
    });

    it('打过几次之后，有的晚上没有尸潮', () => {
        const game = newGame();
        const { state } = game;
        state.flags.push('raids_started');
        let t = state.nextRaidAt;
        for (let night = 0; night < 20; night++) {
            game.tick(t);
            t = state.nextRaidAt;
        }
        expect(state.stats.quiet_nights ?? 0).toBeGreaterThan(0);
        expect(state.raidCount).toBeGreaterThan(0);
    });
});

describe('营地数值总览', () => {
    it('每组都有数值，包含物资、精力、守夜、尸潮概率', () => {
        const game = newGame();
        const groups = campStats(game.config, game.state, T0);
        const labels = groups.flatMap((g) => g.rows.map((r) => r.label));
        for (const want of ['人口 / 床位', '平均精力', '今晚守夜', '今晚尸潮概率', '安全值', '小镇已探索']) expect(labels).toContain(want);
        expect(groups.find((g) => g.title.includes('物资'))!.rows).toHaveLength(game.config.resources.length);
    });
});
