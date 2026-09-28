import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { currentRaid, runRaid } from '../assets/scripts/core/combat';
import { bedCount, productionPerMinute, safety } from '../assets/scripts/core/economy';
import { applyEffect } from '../assets/scripts/core/events';
import { carryOverAchievements, emptyRecords, recordRun } from '../assets/scripts/core/records';
import { addWanderer, applyHardship, deathChance, killSurvivor, resolveFallen, survivorInfo } from '../assets/scripts/core/roster';
import { relocationBlocker } from '../assets/scripts/core/sites';
import { DAY, dayStart, loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

/** 新手保护期之后的某个时刻 */
const LATER = dayStart(8);

describe('流浪者', () => {
    it('随机生成名字、职业、专长，用民兵角色战斗，专长对口照样加成', () => {
        const game = newGame();
        const { config, state } = game;
        const w = addWanderer(config, state, T0, 'cook')!;
        const info = survivorInfo(config, state, w.id)!;
        expect(config.wanderers.names).toContain(info.name);
        expect(config.wanderers.titles.cook).toContain(info.title);
        expect(info.battleUnit).toBe('militia');
        expect(info.isHero).toBe(false);
        for (const s of state.survivors) game.assign(s.id, null, T0);
        state.survivors.forEach((s) => (s.mood = 50));
        game.assign(w.id, 'kitchen', T0);
        expect(productionPerMinute(config, state).food).toBeCloseTo(1.2 * config.balance.specialtyBonus);
    });

    it('名字不重复；没有床位时加入失败', () => {
        const game = newGame();
        const { config, state } = game;
        const names = new Set<string>();
        while (state.survivors.length < bedCount(config, state)) names.add(survivorInfo(config, state, addWanderer(config, state, T0)!.id)!.name);
        expect(names.size).toBe(state.survivors.length - 5);
        expect(addWanderer(config, state, T0)).toBeNull();
    });
});

describe('死亡', () => {
    it('新手保护期内不会死；之后按概率，医务室和卫生所能降低', () => {
        const game = newGame();
        const { config, state } = game;
        expect(deathChance(config, state, T0)).toBe(0);
        expect(deathChance(config, state, LATER)).toBeCloseTo(0.3);
        state.buildings.infirmary.level = 5;
        expect(deathChance(config, state, LATER)).toBeCloseTo(0.3 * (1 - 0.15));
        state.siteId = 'clinic';
        expect(deathChance(config, state, LATER)).toBeCloseTo(0.3 * 0.5 * (1 - 0.15));
    });

    it('战斗中倒下：要么牺牲，要么重伤', () => {
        const game = newGame();
        const { config, state } = game;
        config.balance.deathChanceOnFall = 1;
        expect(resolveFallen(config, state, ['toby'], LATER, '牺牲了')).toEqual({ dead: ['托比'], injured: [] });
        expect(state.flags).toContain('dead_toby');
        expect(state.stats.deaths).toBe(1);
        config.balance.deathChanceOnFall = 0;
        expect(resolveFallen(config, state, ['derek'], LATER, '牺牲了')).toEqual({ dead: [], injured: ['derek'] });
    });

    it('守夜失败：尸群冲进营地，有人被咬死', () => {
        const game = newGame();
        const { config, state } = game;
        state.flags.push('raids_started');
        state.survivors.forEach((s) => (s.injured = true));
        const report = runRaid(config, state, currentRaid(config, state, LATER)!, LATER);
        expect(report.result).toBe('lose');
        expect(report.dead).toHaveLength(1);
        expect(state.survivors).toHaveLength(4);
    });

    it('连续挨饿 hardshipDeathMinutes 分钟死一个人，吃饱就重新计时', () => {
        const game = newGame();
        const { config, state } = game;
        const limit = config.balance.hardshipDeathMinutes;
        applyHardship(config, state, limit - 10, LATER);
        applyHardship(config, state, 0, LATER);
        applyHardship(config, state, limit - 10, LATER);
        expect(state.survivors).toHaveLength(5);
        applyHardship(config, state, 30, LATER);
        expect(state.survivors).toHaveLength(4);
        expect(state.hardshipMinutes).toBe(20);
    });

    it('没有粮食时真的会饿死人', () => {
        const game = newGame();
        const { config, state } = game;
        state.createdAt = T0 - (config.balance.deathGraceDays + 2) * DAY; // 已经过了新手保护期
        state.resources.food = 0;
        game.tick(T0 + (config.balance.hardshipDeathMinutes + 60) * MIN);
        expect(state.survivors.length).toBeLessThan(5);
    });
});

describe('营地覆灭', () => {
    it('最后一个人死了就覆灭，之后时间停止、不能再操作', () => {
        const game = newGame();
        const { config, state } = game;
        for (const s of [...state.survivors]) killSurvivor(config, state, s.id, LATER, '牺牲了');
        expect(state.gameOver).toMatchObject({ day: 8 });
        const food = state.resources.food;
        game.tick(LATER + 60 * MIN);
        expect(state.resources.food).toBe(food);
        expect(game.upgrade('wall', LATER + 60 * MIN)).toEqual({ ok: false, reason: '营地已经覆灭了' });
    });

    it('跨局记录：最长存活天数、局数、成就带到下一局', () => {
        const game = newGame();
        const { config, state } = game;
        state.achievements.push({ id: 'first_blood', at: T0 });
        for (const s of [...state.survivors]) killSurvivor(config, state, s.id, LATER, '牺牲了');
        const records = emptyRecords();
        expect(recordRun(config, records, state)).toBe(true);
        expect(records).toMatchObject({ bestDays: 8, runs: 1, totalDays: 8, achievements: ['first_blood'] });
        expect(records.history[0]).toMatchObject({ days: 8, site: '枫谷超市' });

        const next = newGame();
        carryOverAchievements(records, next.state, T0);
        const cans = next.state.resources.cans;
        next.explore('gas_station', T0);
        next.tick(T0 + 3 * MIN);
        expect(next.state.achievements.filter((a) => a.id === 'first_blood')).toHaveLength(1);
        expect(next.state.resources.cans).toBe(cans);
    });
});

describe('换营地', () => {
    it('打下加油站发现新营地；日记第 4 页揭示水坝', () => {
        const game = newGame();
        const { config, state } = game;
        game.explore('gas_station', T0);
        game.tick(T0 + 3 * MIN);
        expect(state.discoveredSites).toContain('garage');
        applyEffect(config, state, { type: 'discoverSite', site: 'dam' }, T0);
        expect(state.discoveredSites).toContain('dam');
    });

    it('搬迁条件：已发现、没人在外探索、口粮够、不在冷却期', () => {
        const game = newGame();
        const { config, state } = game;
        expect(relocationBlocker(config, state, 'farm', T0)).toBe('还没发现这个地点');
        state.discoveredSites.push('farm');
        state.resources.food = 10;
        expect(relocationBlocker(config, state, 'farm', T0)).toBe('路上的口粮不够（需要 100 食物）');
        state.resources.food = 500;
        game.explore('gas_station', T0);
        expect(relocationBlocker(config, state, 'farm', T0)).toBe('还有小队在外面，等他们回来');
        game.tick(T0 + 3 * MIN);
        expect(relocationBlocker(config, state, 'farm', T0 + 3 * MIN)).toBeNull();
    });

    it('搬到农场：路上打一仗，物资只能带一半，路障重建，农场的效果生效，3 天内不能再搬', () => {
        const game = newGame();
        const { config, state } = game;
        state.discoveredSites.push('farm', 'police');
        state.resources = { food: 400, wood: 300, parts: 100, medicine: 20, cans: 10 };
        state.buildings.wall.level = 6;
        state.buildings.training.level = 3;
        state.episodeIndex = config.episodes.length; // 避免搬家顺带完成剧情目标、发奖励干扰计算
        const before = safety(config, state);
        expect(game.relocate('farm', T0).ok).toBe(true);
        expect(state.siteId).toBe('farm');
        expect(state.resources).toMatchObject({ food: 150, wood: 150, parts: 50, medicine: 10, cans: 10 });
        expect(state.buildings.wall.level).toBe(3);
        expect(safety(config, state)).toBeLessThan(before);
        expect(state.reports[state.reports.length - 1].kind).toBe('journey');
        expect(state.stats.relocations).toBe(1);
        for (const s of state.survivors) game.assign(s.id, null, T0);
        state.survivors.forEach((s) => (s.mood = 50));
        game.assign('martha', 'kitchen', T0);
        expect(productionPerMinute(config, state).food).toBeCloseTo(1.2 * 1.5 * 1.6 + 0.5);
        expect(relocationBlocker(config, state, 'police', T0)).toBe('刚搬过家，3 天内不能再搬');
    });

    it('搬到水坝：伊森还活着就会和莉莉重逢；伊森不在了就不会触发', () => {
        const withEthan = newGame();
        withEthan.state.discoveredSites.push('dam');
        withEthan.state.buildings.training.level = 10;
        withEthan.state.resources.food = 500;
        withEthan.relocate('dam', T0);
        expect(withEthan.state.eventQueue).toContain('dam_arrival');
        withEthan.choose(0, T0);
        expect(withEthan.state.survivors.map((s) => s.id)).toContain('lily');

        const withoutEthan = newGame();
        withoutEthan.state.discoveredSites.push('dam');
        withoutEthan.state.resources.food = 500;
        killSurvivor(withoutEthan.config, withoutEthan.state, 'ethan', LATER, '牺牲了');
        withoutEthan.relocate('dam', LATER);
        expect(withoutEthan.state.eventQueue).not.toContain('dam_arrival');
    });
});
