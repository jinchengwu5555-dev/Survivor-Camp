import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { conditionMet, applyEffect } from '../assets/scripts/core/events';
import { cropDef, dailyFeed, farmOf, growMinutes, penCapacity, plotCount } from '../assets/scripts/core/farming';
import { newSurvivorState } from '../assets/scripts/core/state';
import { dayStart, DAY, loadConfig, MIN, T0 } from './helpers';

/** 界面模式（liveRaids = true）：菜要自己种、自己收，不会自动打理 */
function newGame(seed = 4, live = true) {
    const game = CampGame.newGame(loadConfig(), T0, seed);
    game.liveRaids = live;
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

function withGarden(game: CampGame, level = 1) {
    game.state.buildings.garden.level = level;
    game.tick(game.state.lastTickAt + 1);
    return game;
}

function withPen(game: CampGame, level = 1) {
    game.state.buildings.pen.level = level;
    farmOf(game.config, game.state, game.state.lastTickAt);
    return game;
}

/** 第一个冬天的第一天 */
function winterStart(config: ReturnType<typeof loadConfig>): number {
    let day = 1;
    for (const s of config.seasons) {
        if (s.id === 'winter') return dayStart(day);
        day += s.days;
    }
    throw new Error('没有冬天');
}

describe('种菜', () => {
    it('菜园建好送一次开局种子；菜地数量跟着等级涨', () => {
        const game = withGarden(newGame());
        const { config, state } = game;
        for (const [id, n] of Object.entries(config.farming!.starterSeeds)) expect(state.props![id]).toBe(n);
        game.tick(T0 + 10 * MIN);
        for (const [id, n] of Object.entries(config.farming!.starterSeeds)) expect(state.props![id]).toBe(n);
        expect(state.farm!.plots).toHaveLength(plotCount(config, state));
        state.buildings.garden.level = config.buildings.find((b) => b.id === 'garden')!.levels.length;
        expect(plotCount(config, state)).toBeGreaterThan(config.buildings.find((b) => b.id === 'garden')!.levels[0].plots!);
    });

    it('种下 → 熟了 → 收获：得到食物和种子，种子会扣掉', () => {
        const game = withGarden(newGame());
        const { config, state } = game;
        const now = state.lastTickAt;
        const crop = cropDef(config, 'potato')!;
        const seeds = state.props![crop.seed];
        expect(game.plant('potato', now).ok).toBe(true);
        expect(state.props![crop.seed]).toBe(seeds - 1);
        expect(game.harvest(now + MIN).ok).toBe(false);
        state.resources.food = 0;
        const ready = state.farm!.plots[0]!.readyAt;
        const r = game.harvest(ready);
        expect(r.ok).toBe(true);
        expect(state.resources.food).toBeGreaterThanOrEqual(crop.yield.food!);
        expect(state.props![crop.seed]).toBeGreaterThanOrEqual(seeds - 1 + crop.seedsBack[0]);
        expect(state.farm!.plots[0]).toBeNull();
        expect(state.stats.harvests).toBe(1);
    });

    it('没有种子、地种满了都不能种', () => {
        const game = withGarden(newGame());
        const { state } = game;
        const now = state.lastTickAt;
        expect(game.plant('corn', now)).toEqual({ ok: false, reason: '没有玉米种子' });
        state.props!.seed_lettuce = 10;
        for (let i = 0; i < state.farm!.plots.length; i++) expect(game.plant('lettuce', now).ok).toBe(true);
        expect(game.plant('lettuce', now)).toEqual({ ok: false, reason: '菜地都种满了' });
    });

    it('冬天露天种不了，温室大棚可以；玉米只能夏秋露天种', () => {
        const config = loadConfig();
        const game = withGarden(newGame());
        const { state } = game;
        const winter = winterStart(config);
        game.tick(winter);
        state.props!.seed_potato = 5;
        expect(game.plant('potato', winter).ok).toBe(false);
        state.buildings.garden.level = config.farming!.greenhouseLevel;
        farmOf(config, state, winter);
        expect(game.plant('potato', winter).ok).toBe(true);
        // 大棚里冬天长得慢一些
        expect(growMinutes(config, state, cropDef(config, 'potato')!, winter)).toBeGreaterThan(cropDef(config, 'potato')!.minutes);
    });

    it('熟了太久不收会烂在地里', () => {
        const game = withGarden(newGame());
        const { config, state } = game;
        game.plant('lettuce', state.lastTickAt);
        const ready = state.farm!.plots[0]!.readyAt;
        game.tick(ready + (config.farming!.witherMinutes + 1) * MIN);
        expect(state.farm!.plots[0]).toBeNull();
        expect(state.stats.harvests ?? 0).toBe(0);
    });

    it('农夫在营地时菜长得更快', () => {
        const game = withGarden(newGame());
        const { config, state } = game;
        const crop = cropDef(config, 'potato')!;
        const without = growMinutes(config, state, crop, state.lastTickAt);
        state.survivors.push(newSurvivorState(config, 'rosa'));
        expect(growMinutes(config, state, crop, state.lastTickAt)).toBeLessThan(without);
    });

    it('模拟模式（没有界面）会自动种、自动收', () => {
        const game = newGame(4, false);
        game.state.buildings.garden.level = 1;
        // 土豆这类要长一天多，跑两天
        for (let t = T0; t <= T0 + 2 * DAY; t += 5 * MIN) game.tick(t);
        expect(game.state.stats.harvests ?? 0).toBeGreaterThan(0);
    });
});

describe('养殖', () => {
    it('牲口道具放进畜栏，放不下的不放', () => {
        const game = withPen(newGame());
        const { config, state } = game;
        expect(game.useProp('chicks', state.lastTickAt).ok).toBe(false);
        state.props = { chicks: 10 };
        const cap = penCapacity(config, state);
        for (let i = 0; i < 10; i++) game.useProp('chicks', state.lastTickAt);
        expect(state.farm!.animals.chicken).toBe(cap);
        expect(game.useProp('chicks', state.lastTickAt)).toEqual({ ok: false, reason: '畜栏满了' });
    });

    it('每天喂食：扣食物、下蛋，收蛋得到食物', () => {
        const game = withPen(newGame());
        const { config, state } = game;
        state.farm!.animals = { chicken: 2 };
        state.survivors = state.survivors.slice(0, 1);
        game.tick(dayStart(2) - MIN);
        state.resources.food = 100;
        const feed = dailyFeed(config, state);
        game.tick(dayStart(2) + MIN);
        expect(state.resources.food).toBeLessThanOrEqual(100 - feed + 2);
        expect(state.farm!.produce.chicken).toBe(2);
        const before = state.resources.food;
        expect(game.collectProduce(dayStart(2) + 2 * MIN).ok).toBe(true);
        expect(state.resources.food).toBeGreaterThan(before);
        expect(game.collectProduce(dayStart(2) + 3 * MIN).ok).toBe(false);
    });

    it('没吃的会饿，饿太久会饿死一只', () => {
        const game = withPen(newGame());
        const { config, state } = game;
        state.farm!.animals = { pig: 1, chicken: 2 };
        state.survivors = state.survivors.slice(0, 1);
        for (let d = 2; d <= 1 + config.farming!.starveDays; d++) {
            state.resources.food = 0;
            game.tick(dayStart(d) + MIN);
        }
        // 吃得最多的猪先饿死
        expect(state.farm!.animals.pig ?? 0).toBe(0);
        expect(state.farm!.animals.chicken).toBe(2);
    });

    it('宰了吃肉；每天照看一次，大家心情变好', () => {
        const game = withPen(newGame());
        const { state } = game;
        state.farm!.animals = { goat: 1 };
        state.resources.food = 0;
        const now = state.lastTickAt;
        expect(game.slaughter('goat', now).ok).toBe(true);
        expect(state.resources.food).toBeGreaterThan(0);
        expect(game.slaughter('goat', now).ok).toBe(false);
        state.farm!.animals = { rabbit: 2 };
        const mood = state.survivors[0].mood;
        expect(game.petAnimals(now).ok).toBe(true);
        expect(state.survivors[0].mood).toBeGreaterThan(mood);
        expect(game.petAnimals(now).ok).toBe(false);
    });

    it('打猎时能活捉牲口（畜栏有空位才行）', () => {
        const config = loadConfig();
        config.hunting!.baseChance = 10;
        for (const g of config.hunting!.grounds.find((d) => d.id === 'backyards')!.game) {
            if (g.capture) g.capture.chance = 1;
        }
        const game = CampGame.newGame(config, T0, 3);
        game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
        game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
        game.state.buildings.pen.level = 1;
        expect(game.hunt('backyards', T0, ['derek', 'toby']).ok).toBe(true);
        game.tick(T0 + (config.hunting!.minutes + 1) * MIN);
        const caught = Object.values(game.state.farm?.animals ?? {}).reduce((a, b) => a + b, 0);
        expect(caught).toBeGreaterThan(0);
        expect(game.state.stats.animals_captured).toBe(caught);
    });

    it('事件条件 minBuilding / hasAnimals 和 livestock 效果', () => {
        const game = withPen(newGame());
        const { config, state } = game;
        const now = state.lastTickAt;
        expect(conditionMet(config, state, { hasAnimals: ['chicken'] }, now)).toBe(false);
        applyEffect(config, state, { type: 'livestock', animal: 'chicken', amount: 2 }, now);
        expect(conditionMet(config, state, { hasAnimals: ['chicken'], minBuilding: { pen: 1 } }, now)).toBe(true);
        expect(conditionMet(config, state, { minBuilding: { garden: 1 } }, now)).toBe(false);
        applyEffect(config, state, { type: 'livestock', animal: 'chicken', amount: -1 }, now);
        expect(state.farm!.animals.chicken).toBe(1);
    });
});
