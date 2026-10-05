// 试玩反馈的一批修改：时钟 / 跳到晚上 / 倍速、牲口按等级解锁和鱼塘、搜刮过的地点打折、上门的人先看表面信息
import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { advanceClock, timeOfDay } from '../assets/scripts/core/clock';
import { expeditionLoot } from '../assets/scripts/core/combat';
import { addAnimals, animalBlocker } from '../assets/scripts/core/farming';
import { loadConfig, MIN, RAID, T0 } from './helpers';

function newGame(config = loadConfig(), seed = 4) {
    const game = CampGame.newGame(config, T0, seed);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('时钟和跳到晚上', () => {
    it('尸潮那一刻是 22:00，入夜倒计时就是离尸潮的时间', () => {
        const game = newGame();
        const { config, state } = game;
        state.nextRaidAt = T0 + RAID / 2;
        const t = timeOfDay(config, state, T0);
        expect(t.nightInMs).toBe(RAID / 2);
        expect(t.hour).toBe(10);
        expect(timeOfDay(config, state, T0 + RAID / 2).hour).toBe(22);
    });

    it('跳到晚上：游戏时间快进到尸潮，界面模式下尸潮等着亲手打', () => {
        const game = newGame();
        game.liveRaids = true;
        const { state } = game;
        state.flags.push('raids_started', 'first_raid_scheduled');
        state.raidCount = 0;
        state.nextRaidAt = T0 + 30 * MIN;
        const res = game.skipToNight(T0 + MIN);
        expect(res.ok).toBe(true);
        expect(game.now).toBeGreaterThanOrEqual(T0 + 30 * MIN);
        expect(state.pendingRaid).toBeTruthy();
        expect(game.skipToNight(game.now).ok).toBe(false);
    });

    it('尸潮还没开始时跳到第二天', () => {
        const game = newGame();
        expect(game.skipToNight(T0 + MIN).ok).toBe(true);
        expect(game.now).toBeGreaterThanOrEqual(T0 + game.config.balance.dayLengthMinutes * MIN);
    });

    it('倍速让游戏时间走得更快', () => {
        const game = newGame();
        const { config, state } = game;
        state.clock = { gameTime: T0, lastRealAt: T0, maxRealAt: T0, onlineMs: 0 };
        game.setSpeed(2);
        const step = advanceClock(config, state, T0 + 1000);
        expect(step.gameNow - T0).toBe(1000 * config.balance.clock.onlineTimeScale * 2);
        game.setSpeed(9);
        expect(game.speed).toBe(4);
    });
});

describe('牲口按等级解锁、鱼塘', () => {
    it('畜栏 1 级只能养小动物，升级后才能养羊和猪', () => {
        const game = newGame();
        const { config, state } = game;
        state.buildings.pen.level = 1;
        expect(animalBlocker(config, state, 'chicken')).toBeNull();
        expect(animalBlocker(config, state, 'goat')).toContain('3 级');
        expect(addAnimals(config, state, 'pig', 1, T0)).toBe(0);
        state.buildings.pen.level = 6;
        expect(addAnimals(config, state, 'pig', 1, T0)).toBe(1);
    });

    it('鱼养在鱼塘里，和畜栏分开算位置', () => {
        const game = newGame();
        const { config, state } = game;
        state.buildings.pen.level = 1;
        expect(animalBlocker(config, state, 'crucian')).toBe('还没有鱼塘');
        state.buildings.pond.level = 1;
        const cap = config.buildings.find((b) => b.id === 'pond')!.levels[0].pens!;
        expect(addAnimals(config, state, 'crucian', 99, T0)).toBe(cap);
        expect(addAnimals(config, state, 'chicken', 1, T0)).toBe(1);
        expect(animalBlocker(config, state, 'catfish')).toContain('5 级');
    });
});

describe('搜刮过的地点', () => {
    it('打下过的地方再去，战利品打折；恢复时间变长', () => {
        const game = newGame();
        const { config, state } = game;
        const loc = config.locations.find((l) => l.id === 'gas_station')!;
        const first = expeditionLoot(config, state, loc);
        state.stats.clear_gas_station = 1;
        const again = expeditionLoot(config, state, loc);
        expect(again.food!).toBeLessThan(first.food!);
        expect(config.balance.locationRestockMinutes).toBeGreaterThan(config.balance.dayLengthMinutes);
    });
});

describe('上门的人先看表面信息', () => {
    it('事件出现时就生成好来人，收留的就是卡上那个人', () => {
        const config = loadConfig({ soloStart: true });
        let checked = false;
        for (const seed of [1, 2, 3, 4, 5, 6]) {
            const game = newGame(config, seed);
            const { state } = game;
            state.eventQueue = ['wanderer_knock'];
            game.tick(T0 + MIN);
            expect(state.visitors?.event).toBe('wanderer_knock');
            const visitor = state.visitors!.people[0];
            expect(visitor).toBeTruthy();
            const before = state.survivors.length;
            game.choose(0, T0 + 2 * MIN);
            expect(state.visitors?.event).not.toBe('wanderer_knock');
            if (state.survivors.length > before) {
                expect(state.survivors.some((s) => s === visitor.survivor)).toBe(true);
                checked = true;
            }
        }
        expect(checked).toBe(true);
    });
});
