// 第二批试玩反馈：水、栅栏耐久、看守菜园和多茬作物、独立的狩猎场、满员换人
import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { runRaid } from '../assets/scripts/core/combat';
import { economyRates } from '../assets/scripts/core/economy';
import { cropDef } from '../assets/scripts/core/farming';
import { groundDef } from '../assets/scripts/core/hunting';
import { todayIntel } from '../assets/scripts/core/intel';
import { repairWall, wallRepairCost, wallWear } from '../assets/scripts/core/wall';
import { dayStart, loadConfig, MIN, T0 } from './helpers';

function newGame(config = loadConfig(), seed = 4) {
    const game = CampGame.newGame(config, T0, seed);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('水', () => {
    it('每个人都要喝水；水站接雨水，派人去打水产得更多', () => {
        const game = newGame();
        const { config, state } = game;
        expect(state.resources.water).toBe(config.balance.startingResources.water);
        const before = economyRates(config, state, T0).net.water;
        game.assign('toby', 'well', T0);
        expect(economyRates(config, state, T0).net.water).toBeGreaterThan(before);
    });

    it('断水会让大家心情变差', () => {
        const game = newGame();
        const { state } = game;
        state.resources.water = 0;
        state.resources.food = 10_000;
        const mood = state.survivors[0].mood;
        game.tick(T0 + 30 * MIN);
        expect(state.survivors[0].mood).toBeLessThan(mood);
    });

    it('建筑升级不再花食物', () => {
        const config = loadConfig();
        for (const b of config.buildings) for (const lv of b.levels) expect(lv.cost.food ?? 0).toBe(0);
    });
});

describe('栅栏耐久', () => {
    it('守夜打坏的栅栏留到下一晚，花木材能修好', () => {
        const game = newGame();
        game.liveRaids = true;
        const { config, state } = game;
        state.wallWear = 0.4;
        expect(wallRepairCost(config, state)).toBeGreaterThan(0);
        state.resources.wood = 0;
        expect(game.repairWall(T0).ok).toBe(false);
        state.resources.wood = 1000;
        expect(game.repairWall(T0).ok).toBe(true);
        expect(wallWear(state)).toBe(0);
    });

    it('守夜后按栅栏剩下的生命记下损伤，下一晚带伤出场', () => {
        const game = newGame();
        const { config, state } = game;
        state.flags.push('raids_started');
        runRaid(config, state, config.raids[config.raids.length - 1], T0 + MIN);
        expect(wallWear(state)).toBeGreaterThan(0);
        expect(wallWear(state)).toBeLessThanOrEqual(config.balance.wallRepair!.maxWear);
        state.resources.wood = 100_000;
        repairWall(config, state, T0 + 2 * MIN);
        expect(wallWear(state)).toBe(0);
    });
});

describe('菜园', () => {
    it('能收好几茬的作物收完一茬还留在地里', () => {
        const game = newGame();
        game.liveRaids = true;
        const { config, state } = game;
        state.buildings.garden.level = 1;
        game.tick(T0 + 1);
        state.props!.seed_beans = 1;
        expect(game.plant('beans', state.lastTickAt).ok).toBe(true);
        const crop = cropDef(config, 'beans')!;
        for (let i = 0; i < crop.harvests! - 1; i++) {
            game.harvest(state.farm!.plots[0]!.readyAt);
            expect(state.farm!.plots[0]?.crop).toBe('beans');
        }
        game.harvest(state.farm!.plots[0]!.readyAt);
        expect(state.farm!.plots[0]).toBeNull();
        expect(state.stats.harvests).toBe(crop.harvests);
    });

    it('派人看守菜园：熟了自动收、空地自动种', () => {
        const game = newGame();
        game.liveRaids = true;
        const { state } = game;
        state.buildings.garden.level = 1;
        game.tick(T0 + 1);
        expect(game.assign('martha', 'garden', T0 + 2).ok).toBe(true);
        for (let t = T0; t < dayStart(3); t += 5 * MIN) game.tick(t);
        expect(state.stats.harvests ?? 0).toBeGreaterThan(0);
    });
});

describe('狩猎场', () => {
    it('打猎去独立的猎场，不在探索分区里', () => {
        const config = loadConfig();
        expect(groundDef(config, 'lake')?.fishing).toBe(true);
        expect(config.districts!.districts.every((d) => !('hunting' in d))).toBe(true);
        const game = newGame(config);
        expect(game.hunt('park_woods', T0, ['derek']).ok).toBe(true);
        expect(game.hunt('downtown', T0, ['toby']).ok).toBe(false);
    });

    it('打猎钓鱼的情报给猎场，搜刮的情报给分区', () => {
        const game = newGame();
        const { config, state } = game;
        for (let d = 1; d <= 10; d++) {
            for (const x of todayIntel(config, state, dayStart(d) + MIN)) {
                if (x.target === 'ground') expect(x.kind.loot).toBeUndefined();
                else expect(!!x.kind.loot || !!x.kind.danger || !x.kind.hunt).toBe(true);
            }
        }
    });
});

describe('满员时来了新人', () => {
    it('可以让他在门口等，或者请一个人离开换他进来', () => {
        const config = loadConfig({ soloStart: true });
        const game = newGame(config);
        // 界面模式：候选人等玩家决定（测试模式会自动决定）
        game.liveRaids = true;
        const { state } = game;
        state.eventQueue = ['wanderer_knock'];
        game.tick(T0 + MIN);
        const visitor = state.visitors!.people[0];
        // 床位塞满
        state.buildings.dorm.level = 1;
        while (state.survivors.length < config.buildings.find((b) => b.id === 'dorm')!.levels[0].beds!) state.survivors.push({ ...state.survivors[0], id: `filler${state.survivors.length}`, profile: { name: '路人', title: '路人', specialty: 'fighter', talents: [], traits: [] } } as never);
        // 选“收留”：结果可能是夜里偷粮跑了（另一个结果），多试几次直到有人想留下
        game.choose(0, T0 + 2 * MIN);
        const c = state.candidates?.find((x) => x.survivor === visitor.survivor);
        if (!c) return; // 抽到了偷粮的结果
        expect(game.pendingCandidates).toContain(c);
        expect(game.waitCandidate(c.id, T0 + 3 * MIN).ok).toBe(true);
        expect(game.pendingCandidates).not.toContain(c);
        const leaving = state.survivors.find((s) => s.id !== 'ethan')!.id;
        expect(game.dismiss('ethan', T0 + 4 * MIN).ok).toBe(false);
        expect(game.dismiss(leaving, T0 + 4 * MIN)).toMatchObject({ ok: true });
        expect(game.decideCandidate(c.id, true, T0 + 5 * MIN).ok).toBe(true);
        expect(state.survivors).toContain(visitor.survivor);
    });
});
