import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { foodConsumptionPerMinute, morale, moraleMultiplier, productionPerMinute } from '../assets/scripts/core/economy';
import { loadGame, saveGame } from '../assets/scripts/core/save';
import { EVENT, loadConfig, MemoryStorage, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    // 这些测试不关心剧情和随机事件，先清空
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('开局', () => {
    it('初始资源、幸存者和开场剧情', () => {
        const game = CampGame.newGame(loadConfig(), T0, 42);
        expect(game.state.survivors.map((s) => s.id)).toEqual(['ethan', 'martha', 'derek', 'sophie', 'toby']);
        expect(game.state.resources.food).toBe(game.config.balance.startingResources.food);
        expect(game.state.buildings.infirmary.level).toBe(0);
        expect(game.currentEvent?.id).toBe('s1e1_open');
    });
});

describe('生产和消耗', () => {
    it('对口专长产量更高，吃饭按人数扣食物', () => {
        const game = newGame();
        game.state.survivors.forEach((s) => (s.mood = 50)); // 士气倍率 = 1
        expect(game.assign('martha', 'kitchen', T0).ok).toBe(true); // 厨师，1.5 倍
        expect(game.assign('toby', 'kitchen', T0).ok).toBe(true);
        const rate = productionPerMinute(game.config, game.state).food;
        expect(rate).toBeCloseTo(1.2 * 1.5 + 1.2);
        expect(foodConsumptionPerMinute(game.config, game.state)).toBeCloseTo(5 * game.config.balance.foodPerSurvivorPerMinute);
    });

    it('岗位满了不能再分配，受伤的人不能干活', () => {
        const game = newGame();
        game.assign('martha', 'kitchen', T0);
        game.assign('toby', 'kitchen', T0);
        expect(game.assign('derek', 'kitchen', T0)).toEqual({ ok: false, reason: '岗位已满' });
        game.state.survivors.find((s) => s.id === 'sophie')!.injured = true;
        expect(game.assign('sophie', 'scrapyard', T0).ok).toBe(false);
    });

    it('离线收益最多算 8 小时', () => {
        const game = newGame();
        game.assign('derek', 'scrapyard', T0);
        const a = newGame();
        a.assign('derek', 'scrapyard', T0);
        game.tick(T0 + 8 * 60 * MIN);
        a.tick(T0 + 48 * 60 * MIN);
        expect(a.state.resources.parts).toBeCloseTo(game.state.resources.parts);
    });

    it('食物吃光后心情下降，吃饱时心情恢复', () => {
        const hungry = newGame();
        hungry.state.resources.food = 0;
        hungry.state.survivors.forEach((s) => (s.mood = 50));
        hungry.tick(T0 + 10 * MIN);
        expect(morale(hungry.state)).toBeCloseTo(50 - 0.5 * 10);

        const fed = newGame();
        fed.state.survivors.forEach((s) => (s.mood = 50));
        fed.tick(T0 + 10 * MIN);
        expect(morale(fed.state)).toBeCloseTo(50 + 0.2 * 10);
    });

    it('资源不会超过仓库上限', () => {
        const game = newGame();
        game.state.resources.wood = 199;
        game.assign('derek', 'scrapyard', T0);
        game.tick(T0 + 60 * MIN);
        expect(game.state.resources.wood).toBe(200);
    });
});

describe('建造', () => {
    it('扣资源，到时间后完成', () => {
        const game = newGame();
        const wood = game.state.resources.wood;
        expect(game.upgrade('wall', T0).ok).toBe(true);
        expect(game.state.resources.wood).toBe(wood - 40);
        game.tick(T0 + 59_000);
        expect(game.state.buildings.wall.level).toBe(1);
        game.tick(T0 + 60_000);
        expect(game.state.buildings.wall.level).toBe(2);
    });

    it('建造队列、指挥部等级、资源不足都会阻止升级', () => {
        const game = newGame();
        game.state.resources.wood = 1000;
        game.state.resources.parts = 1000;
        game.upgrade('wall', T0);
        expect(game.upgrade('kitchen', T0)).toEqual({ ok: false, reason: '建造队列已满' });
        game.speedUpUpgrade('wall', T0);
        expect(game.upgrade('wall', T0)).toEqual({ ok: false, reason: '需要指挥部 2 级' });
        game.state.resources.wood = 0;
        expect(game.upgrade('kitchen', T0)).toEqual({ ok: false, reason: '资源不足' });
    });

    it('离线期间升级完成，完成之后的时间按新等级产出', () => {
        const game = newGame();
        game.state.survivors.forEach((s) => (s.mood = 70));
        game.assign('derek', 'scrapyard', T0);
        game.state.resources.wood = 50;
        game.state.resources.parts = 10;
        game.upgrade('scrapyard', T0); // 90 秒后完成，2 级产量 parts 0.3
        game.state.survivors.forEach((s) => (s.mood = 70));
        game.tick(T0 + 11 * MIN);
        const mult = 1.5 * moraleMultiplier(game.state);
        expect(game.state.resources.parts).toBeCloseTo(10 + (0.2 * 1.5 + 0.3 * 9.5) * mult, 1);
    });
});

describe('事件', () => {
    it('开场抉择：不开门会让苏菲难过', () => {
        const game = CampGame.newGame(loadConfig(), T0, 42);
        const res = game.choose(1, T0);
        expect(res.ok).toBe(true);
        expect(game.state.flags).toContain('left_leo');
        const sophie = game.state.survivors.find((s) => s.id === 'sophie')!;
        expect(sophie.mood).toBe(50 - 15 - 5);
        expect(game.currentEvent).toBeUndefined();
    });

    it('开门一定会让里奥加入', () => {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
            const game = CampGame.newGame(loadConfig(), T0, seed);
            game.choose(0, T0);
            expect(game.state.survivors.some((s) => s.id === 'leo')).toBe(true);
        }
    });

    it('资源不够时不能选需要花费的选项', () => {
        const game = newGame();
        game.state.eventQueue = ['s1e3_start'];
        game.state.resources.parts = 0;
        expect(game.choose(0, T0)).toEqual({ ok: false, reason: '资源不足' });
        expect(game.currentEvent?.id).toBe('s1e3_start');
    });

    it('随机事件按间隔触发，队列里有事件时不叠加', () => {
        const game = CampGame.newGame(loadConfig(), T0, 7);
        game.tick(T0 + EVENT);
        expect(game.state.eventQueue).toEqual(['s1e1_open']);
        game.choose(0, T0 + EVENT);
        game.tick(T0 + 2 * EVENT);
        expect(game.state.eventQueue.length).toBe(1);
        expect(game.currentEvent?.weight).toBeGreaterThan(0);
    });

    it('没有床位时新人无法加入', () => {
        const game = newGame();
        game.state.buildings.dorm.level = 0;
        game.state.eventQueue = ['s1e1_open'];
        game.choose(0, T0);
        expect(game.state.survivors.some((s) => s.id === 'leo')).toBe(false);
    });
});

describe('剧情', () => {
    it('完成第 1 集目标后发奖励，并依次排入结尾和下一集开场', () => {
        const game = CampGame.newGame(loadConfig(), T0, 42);
        game.choose(1, T0);
        game.upgrade('wall', T0);
        game.tick(T0 + MIN);
        expect(game.state.episodeIndex).toBe(1);
        expect(game.state.eventQueue).toEqual(['s1e1_end', 's1e2_start']);
    });

    it('第 3 集：修好无线电 + 指挥部 2 级后触发悬念结尾', () => {
        const game = newGame();
        game.state.episodeIndex = 2;
        game.state.eventQueue = ['s1e3_start'];
        game.state.resources.parts = 50;
        game.state.resources.wood = 200;
        game.choose(0, T0);
        game.upgrade('hq', T0);
        game.speedUpUpgrade('hq', T0);
        expect(game.state.episodeIndex).toBe(3);
        expect(game.currentEvent?.id).toBe('s1e3_end');
    });
});

describe('存档', () => {
    it('存档读档后状态一致', () => {
        const game = newGame();
        game.upgrade('wall', T0);
        const storage = new MemoryStorage();
        saveGame(storage, game.state);
        const loaded = loadGame(storage, game.config);
        expect(loaded).toEqual(game.state);
    });

    it('损坏的存档返回 null，配置新增的建筑会补进老存档', () => {
        const config = loadConfig();
        const storage = new MemoryStorage();
        storage.setItem('doomsday-camp-save', '{broken');
        expect(loadGame(storage, config)).toBeNull();

        const game = CampGame.newGame(config, T0, 1);
        delete (game.state.buildings as Record<string, unknown>).infirmary;
        saveGame(storage, game.state);
        expect(loadGame(storage, config)?.buildings.infirmary.level).toBe(0);
    });
});
