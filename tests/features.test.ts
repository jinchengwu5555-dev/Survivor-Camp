import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { availableBounties, bountyProgress, hunterRank } from '../assets/scripts/core/bounties';
import { currentRaid, expeditionEnemyBonus, expeditionLoot, nextRaidIsBloodMoon, raidEnemyBonus, runRaid } from '../assets/scripts/core/combat';
import { economyRates } from '../assets/scripts/core/economy';
import { eligibleRandomEvents } from '../assets/scripts/core/events';
import { seasonAt } from '../assets/scripts/core/seasons';
import { dayStart, loadConfig, MIN, T0 } from './helpers';


function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('季节与过冬（R03）', () => {
    it('夏 3 天 → 秋 3 天 → 冬 3 天 → 春 3 天，循环', () => {
        const game = newGame();
        const at = (day: number) => seasonAt(game.config, game.state, dayStart(day)).season.id;
        expect([1, 3, 4, 7, 9, 10, 13].map(at)).toEqual(['summer', 'summer', 'autumn', 'winter', 'winter', 'spring', 'summer']);
    });

    it('冬天：食物产量减半，每人每分钟烧 0.08 木材', () => {
        const game = newGame();
        game.assign('martha', 'kitchen', T0);
        game.state.survivors.forEach((s) => (s.mood = 50));
        const summer = economyRates(game.config, game.state, dayStart(1));
        const winter = economyRates(game.config, game.state, dayStart(7));
        expect(winter.heating).toBeCloseTo(5 * 0.08);
        expect(summer.heating).toBe(0);
        const production = (r: typeof summer) => r.net.food + 5 * game.config.balance.foodPerSurvivorPerMinute + r.spoil;
        expect(production(winter)).toBeCloseTo(production(summer) * 0.5);
    });

    it('冬天没柴取暖，大家会挨冻', () => {
        const game = newGame();
        game.state.lastTickAt = dayStart(7);
        game.state.seasonId = 'winter';
        game.state.resources.wood = 0;
        game.state.resources.food = 200;
        game.state.survivors.forEach((s) => (s.mood = 50));
        game.tick(dayStart(7) + 10 * MIN);
        expect(game.state.survivors[0].mood).toBeCloseTo(50 + 0.2 * 10 - 0.3 * 10);
    });

    it('换季写日志，入冬触发“第一场雪”，熬过冬天记一次', () => {
        const game = newGame();
        game.tick(dayStart(7));
        expect(game.state.seasonId).toBe('winter');
        expect(game.state.eventQueue).toContain('winter_arrives');
        game.state.eventQueue = [];
        game.tick(dayStart(10));
        expect(game.state.stats.winters_survived).toBe(1);
        expect(game.state.achievements.map((a) => a.id)).toContain('winter');
    });
});

describe('食物腐烂（R01）', () => {
    it('库存越多坏得越多；夏天更快，冬天更慢；地窖能减缓', () => {
        const game = newGame();
        game.state.resources.food = 100;
        const spoil = (day: number) => economyRates(game.config, game.state, dayStart(day)).spoil;
        expect(spoil(1)).toBeCloseTo(100 * 0.001 * 1.5);
        expect(spoil(7)).toBeCloseTo(100 * 0.001 * 0.3);
        game.state.buildings.cellar.level = 2;
        expect(spoil(4)).toBeCloseTo(100 * 0.001 * (1 - 0.5));
    });

    it('罐头不会坏', () => {
        const game = newGame();
        game.state.resources.cans = 50;
        expect(economyRates(game.config, game.state, dayStart(1)).net.cans).toBe(0);
    });
});

describe('工坊合成（R25）', () => {
    it('需要工坊；做燃烧瓶扣资源；钉子炸弹要 2 级工坊', () => {
        const game = newGame();
        game.state.resources.medicine = 20;
        expect(game.craft('molotov', T0)).toEqual({ ok: false, reason: '需要先建造工坊' });
        game.state.buildings.workshop.level = 1;
        expect(game.craft('molotov', T0).ok).toBe(true);
        expect(game.state.items.molotov).toBe(1);
        expect(game.state.resources.medicine).toBe(18);
        expect(game.craft('nail_bomb', T0)).toEqual({ ok: false, reason: '需要工坊 2 级' });
    });

    it('探索时自动带上物品，用掉了才扣库存', () => {
        const game = newGame();
        game.state.items = { molotov: 2, medkit: 1 };
        game.explore('gas_station', T0);
        game.tick(T0 + 3 * MIN);
        expect(game.state.items.molotov).toBe(1);
        expect(game.state.items.medkit).toBe(1); // 加油站太轻松，没人需要急救包
        expect(game.state.reports[0].summary).toContain('用掉了燃烧瓶');
        expect(game.state.reports[0].setup.allies.flatMap((a) => a.extraSkills ?? [])).toEqual(['item_molotov', 'item_medkit']);
    });
});

describe('血月夜（R26）和营地的狗（R10）', () => {
    it('每第 4 次尸潮是血月夜：尸群翻倍，守住后奖励翻倍', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        game.state.buildings.wall.level = 3;
        game.state.buildings.training.level = 3;
        const raid = currentRaid(game.config, game.state, T0)!;
        const reports = [1, 2, 3, 4].map(() => runRaid(game.config, game.state, raid, T0));
        expect(reports.map((r) => r.title)).toEqual(['小股尸群', '小股尸群', '小股尸群', '血月·小股尸群']);
        expect(reports[3].setup.enemies).toHaveLength(raid.enemies.length + Math.ceil(raid.enemies.length / 2));
        expect(reports[3].result).toBe('win');
        expect(reports[3].loot.parts).toBe(raid.reward.parts! * 2);
        expect(game.state.stats.blood_moons_won).toBe(1);
        expect(nextRaidIsBloodMoon(game.config, game.state)).toBe(false);
    });

    it('收养了狗，守夜时狗一起上阵；狗倒下不算伤员', () => {
        const game = newGame();
        game.state.flags.push('raids_started', 'has_dog');
        const raid = currentRaid(game.config, game.state, T0)!;
        const report = runRaid(game.config, game.state, raid, T0);
        expect(report.setup.allies.map((a) => a.tag)).toContain('dog');
        expect(report.injured).not.toContain('dog');
    });

    it('狗不会带物品', () => {
        const game = newGame();
        game.state.flags.push('raids_started', 'has_dog');
        game.state.survivors.forEach((s) => (s.injured = true));
        game.state.items = { molotov: 1 };
        const report = runRaid(game.config, game.state, currentRaid(game.config, game.state, T0)!, T0);
        expect(report.setup.allies.flatMap((a) => a.extraSkills ?? [])).toEqual([]);
    });
});

describe('悬赏板（R15）', () => {
    it('接取后按击杀统计算进度，完成后领奖励和猎人经验', () => {
        const game = newGame();
        game.state.stats.kill_walker = 100; // 接取之前的击杀不算
        expect(game.acceptBounty('b_walkers', T0).ok).toBe(true);
        expect(bountyProgress(game.config, game.state, 'b_walkers')).toEqual({ current: 0, target: 15 });
        expect(game.claimBounty('b_walkers', T0)).toEqual({ ok: false, reason: '还没完成（0/15）' });
        game.state.stats.kill_walker = 120;
        const food = game.state.resources.food;
        expect(game.claimBounty('b_walkers', T0).ok).toBe(true);
        expect(game.state.hunterXp).toBe(20);
        expect(game.state.resources.food).toBeCloseTo(food + 40);
        expect(availableBounties(game.config, game.state, T0).map((b) => b.id)).not.toContain('b_walkers');
    });

    it('高级悬赏需要猎人等级；最多同时接 3 个', () => {
        const game = newGame();
        game.state.flags.push('cleared_gas_station');
        expect(game.acceptBounty('b_fatty', T0).ok).toBe(false);
        game.state.hunterXp = 60;
        expect(hunterRank(game.config, game.state)).toBe(1);
        for (const id of ['b_walkers', 'b_runners', 'b_gas_station']) expect(game.acceptBounty(id, T0).ok).toBe(true);
        expect(game.acceptBounty('b_fatty', T0)).toEqual({ ok: false, reason: '最多同时接 3 个悬赏' });
        game.abandonBounty('b_runners', T0);
        expect(game.acceptBounty('b_fatty', T0).ok).toBe(true);
    });

    it('探索会累计击杀和清理次数', () => {
        const game = newGame();
        game.acceptBounty('b_walkers', T0);
        game.explore('gas_station', T0);
        game.tick(T0 + 3 * MIN);
        expect(game.state.stats.kill_walker).toBe(2);
        expect(game.state.stats.clear_gas_station).toBe(1);
        expect(bountyProgress(game.config, game.state, 'b_walkers').current).toBe(2);
    });
});

describe('成就', () => {
    it('第一次消灭丧尸解锁“第一滴血”，发奖励、通知界面，不会重复解锁', () => {
        const game = newGame();
        const cans = game.state.resources.cans;
        game.explore('gas_station', T0);
        game.tick(T0 + 3 * MIN);
        expect(game.state.achievements.map((a) => a.id)).toContain('first_blood');
        expect(game.state.resources.cans).toBe(cans + 2);
        expect(game.newAchievements.map((a) => a.id)).toContain('first_blood');
        game.tick(T0 + 4 * MIN);
        expect(game.state.achievements.filter((a) => a.id === 'first_blood')).toHaveLength(1);
    });

    it('存活天数成就', () => {
        const game = newGame();
        game.state.resources.food = 200;
        game.tick(dayStart(7));
        expect(game.state.achievements.map((a) => a.id)).toContain('day_7');
    });
});

describe('日记残页（R18）、宁静时刻（R19）、幽默调剂（R38）', () => {
    it('日记必须按顺序出现，集齐 5 页解锁成就', () => {
        const game = newGame();
        const eligible = () => eligibleRandomEvents(game.config, game.state, dayStart(6)).map((e) => e.id);
        game.state.flags.push('cleared_hardware_store', 'cleared_clinic', 'cleared_sheriff_office');
        expect(eligible()).toContain('diary_page_1');
        expect(eligible()).not.toContain('diary_page_2');
        for (let page = 1; page <= 5; page++) {
            game.state.eventQueue = [`diary_page_${page}`];
            game.choose(0, dayStart(6));
            if (page < 5) expect(eligible()).toContain(`diary_page_${page + 1}`);
        }
        expect(game.state.stats.diary_pages).toBe(5);
        expect(game.state.achievements.map((a) => a.id)).toContain('the_truth');
    });

    it('宁静时刻和笑声会被统计', () => {
        const game = newGame();
        game.state.eventQueue = ['quiet_stars', 'toby_jokes'];
        game.choose(0, T0);
        game.choose(0, T0);
        expect(game.state.stats.quiet_moments).toBe(1);
        expect(game.state.stats.laughs).toBe(1);
    });
});

describe('无限流经济', () => {
    it('看一次广告：剩余时间减少 25%（至少 30 分钟），短的升级直接完成', () => {
        const game = newGame();
        game.state.resources.wood = 1000;
        game.upgrade('wall', T0); // 60 秒
        game.speedUpUpgrade('wall', T0);
        expect(game.state.buildings.wall.level).toBe(2);

        game.state.buildings.hq.upgradeEndsAt = T0 + 10 * 60 * MIN; // 模拟一个 10 小时的升级
        game.speedUpUpgrade('hq', T0);
        expect(game.state.buildings.hq.upgradeEndsAt).toBe(T0 + 7.5 * 60 * MIN);
        game.state.buildings.hq.upgradeEndsAt = T0 + 60 * MIN;
        game.speedUpUpgrade('hq', T0);
        expect(game.state.buildings.hq.upgradeEndsAt).toBe(T0 + 30 * MIN);
    });

    it('无尽尸潮：第 24 天开始每 6 天 +1 级，输了喘息 -2，赢了恢复 1', () => {
        const game = newGame();
        const { config, state } = game;
        expect(raidEnemyBonus(config, state, dayStart(23))).toBe(0);
        expect(raidEnemyBonus(config, state, dayStart(24))).toBe(1);
        expect(raidEnemyBonus(config, state, dayStart(36))).toBe(3);
        state.raidRelief = 2;
        expect(raidEnemyBonus(config, state, dayStart(36))).toBe(1);
    });

    it('守住高等级尸潮：奖励按等级指数增长，记录最高等级，喘息值恢复', () => {
        const game = newGame();
        const { config, state } = game;
        state.flags.push('raids_started');
        state.buildings.wall.level = 25;
        state.buildings.training.level = 25;
        state.raidRelief = 1;
        const at = dayStart(36);
        const raid = currentRaid(config, state, at)!;
        const report = runRaid(config, state, raid, at);
        expect(report.result).toBe('win');
        expect(report.title).toBe(`${raid.name} +2`);
        expect(state.stats.best_raid_level).toBe(2);
        expect(state.raidRelief).toBe(0);
        expect(report.loot.parts).toBe(Math.round(raid.reward.parts! * Math.pow(1.15, 2)));
    });

    it('探索随指挥部成长：敌人更强，战利品按指数增长', () => {
        const game = newGame();
        const { config, state } = game;
        const loc = config.locations.find((l) => l.id === 'gas_station')!;
        expect(expeditionLoot(config, state, loc)).toEqual(loc.loot);
        state.buildings.hq.level = 5;
        expect(expeditionEnemyBonus(config, state)).toBe(2);
        expect(expeditionLoot(config, state, loc).food).toBe(Math.round(loc.loot.food! * Math.pow(1.25, 4)));
    });
});
