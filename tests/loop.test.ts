import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { activePickups, pickupKind, pickupReward } from '../assets/scripts/core/pickups';
import { dailyClaimable, dailyProgress, refreshDaily } from '../assets/scripts/core/daily';
import { idleSurvivors, workersIn } from '../assets/scripts/core/workers';
import { economyRates } from '../assets/scripts/core/economy';
import { DAY, dayStart, loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('路边拾荒', () => {
    it('按间隔刷出来，最多同时 maxActive 个，过期消失', () => {
        const game = newGame();
        const cfg = game.config.pickups;
        game.tick(T0 + cfg.intervalMinutes * 3 * MIN);
        const active = activePickups(game.state, game.now);
        expect(active.length).toBeGreaterThan(0);
        expect(active.length).toBeLessThanOrEqual(cfg.maxActive);
        game.tick(T0 + 20 * cfg.intervalMinutes * MIN);
        expect(activePickups(game.state, game.now).length).toBeLessThanOrEqual(cfg.maxActive);
        // 停在原地不动（不再 tick），时间到了就过期
        expect(activePickups(game.state, game.now + cfg.lifetimeMinutes * MIN + 1)).toHaveLength(0);
    });

    it('点一下捡走：发奖励、记统计，捡过的不能再捡', () => {
        const game = newGame();
        game.state.pickups = [{ id: 999, kind: 'walker', expiresAt: T0 + 60 * MIN }];
        game.state.resources.parts = 0;
        const res = game.collectPickup(999, T0);
        expect(res.ok).toBe(true);
        expect(game.state.resources.parts).toBe(pickupReward(game.config, game.state, pickupKind(game.config, 'walker')!).parts);
        expect(game.state.stats.pickups_collected).toBe(1);
        expect(game.state.stats.zombies_killed).toBe(1);
        expect(game.collectPickup(999, T0).ok).toBe(false);
    });

    it('奖励随指挥部等级成长，罐头不成长', () => {
        const game = newGame();
        const kind = pickupKind(game.config, 'walker')!;
        const low = pickupReward(game.config, game.state, kind);
        game.state.buildings.hq.level = 5;
        const high = pickupReward(game.config, game.state, kind);
        expect(high.parts!).toBeGreaterThan(low.parts!);
        expect(high.cans).toBe(low.cans);
    });
});

describe('每日目标', () => {
    it('每个游戏日抽 tasksPerDay 个，同一天不变，换天重抽', () => {
        const game = newGame();
        const daily = refreshDaily(game.config, game.state, T0);
        expect(daily.tasks).toHaveLength(game.config.daily.tasksPerDay);
        expect(new Set(daily.tasks.map((t) => game.config.daily.tasks.find((d) => d.id === t.id)!.stat)).size).toBe(daily.tasks.length);
        expect(refreshDaily(game.config, game.state, T0 + MIN)).toBe(daily);
        expect(refreshDaily(game.config, game.state, T0 + DAY).day).toBe(2);
    });

    it('条件不满足的目标不会抽到', () => {
        const game = newGame();
        for (let d = 1; d <= 30; d++) {
            const daily = refreshDaily(game.config, game.state, dayStart(d));
            for (const t of daily.tasks) expect(['raid_1', 'repair_1', 'craft_1', 'treat_1']).not.toContain(t.id);
        }
    });

    it('完成后领奖，全部领完开宝箱', () => {
        const game = newGame();
        game.tick(T0 + MIN);
        const daily = game.state.daily!;
        expect(dailyClaimable(game.config, game.state)).toBe(false);
        expect(game.claimDailyChest(T0 + MIN).ok).toBe(false);
        for (const t of daily.tasks) {
            const def = game.config.daily.tasks.find((d) => d.id === t.id)!;
            expect(game.claimDaily(t.id, T0 + MIN).ok).toBe(false);
            game.state.stats[def.stat] = (game.state.stats[def.stat] ?? 0) + def.amount;
            expect(dailyProgress(game.config, game.state, t.id).current).toBe(def.amount);
            expect(dailyClaimable(game.config, game.state)).toBe(true);
            expect(game.claimDaily(t.id, T0 + MIN).ok).toBe(true);
        }
        expect(dailyClaimable(game.config, game.state)).toBe(true);
        const cans = game.state.resources.cans;
        expect(game.claimDailyChest(T0 + MIN).ok).toBe(true);
        expect(game.state.resources.cans).toBe(cans + game.config.daily.chest.cans!);
        expect(game.claimDailyChest(T0 + MIN).ok).toBe(false);
        expect(dailyClaimable(game.config, game.state)).toBe(false);
    });
});

describe('安排工作', () => {
    it('加人优先专长对口的，减人优先不对口的', () => {
        const game = newGame();
        expect(game.addWorker('kitchen', T0)).toMatchObject({ ok: true, message: '玛莎' });
        game.assign('ethan', 'kitchen', T0);
        expect(game.removeWorker('kitchen', T0)).toMatchObject({ ok: true, message: '伊森' });
        expect(workersIn(game.state, 'kitchen').map((s) => s.id)).toEqual(['martha']);
        expect(game.addWorker('hq', T0).ok).toBe(false);
    });

    it('一键安排：岗位排满，食物不会在减少', () => {
        const game = newGame();
        expect(game.autoAssign(T0).ok).toBe(true);
        // 开局只有厨房 2 个、废料场 2 个岗位，5 个人里剩 1 个
        expect(idleSurvivors(game.state)).toHaveLength(1);
        expect(economyRates(game.config, game.state, T0).net.food).toBeGreaterThan(0);
        expect(game.autoAssign(T0)).toEqual({ ok: false, reason: '岗位都满了' });
    });

    it('开始升级会记统计（每日目标用）', () => {
        const game = newGame();
        game.upgrade('wall', T0);
        expect(game.state.stats.upgrades).toBe(1);
    });
});
