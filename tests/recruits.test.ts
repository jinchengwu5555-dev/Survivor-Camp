import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { productionPerMinute } from '../assets/scripts/core/economy';
import { decideCandidate, makeCandidate, nightQuirks, offerCandidates, visibleQuirks } from '../assets/scripts/core/recruits';
import { raidChanceTonight } from '../assets/scripts/core/watch';
import { loadConfig, MIN, T0 } from './helpers';

function soloGame(seed = 5) {
    const game = CampGame.newGame(loadConfig({ soloStart: true }), T0, seed);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    game.liveRaids = true;
    return game;
}

describe('单人开局与招募', () => {
    it('开局只有伊森；第一次探索回来遇到 1～3 个人，等玩家决定', () => {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
            const game = soloGame(seed);
            expect(game.state.survivors.map((s) => s.id)).toEqual(['ethan']);
            game.explore('gas_station', T0, ['ethan']);
            game.tick(game.state.expeditions[0].returnsAt + 1);
            const n = game.candidates.length;
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(3);
            for (const c of game.candidates) expect(c.intro.length).toBeGreaterThan(10);
        }
    });

    it('留下的人加入营地，带来的东西到手；让他走的人不会再出现（有名有姓的）', () => {
        const game = soloGame();
        const { config, state } = game;
        const [a] = offerCandidates(config, state, 1, '测试地点', T0);
        a.survivor.quirks = ['supplies'];
        const food = state.resources.food;
        expect(decideCandidate(config, state, a.id, true, T0).ok).toBe(true);
        expect(state.survivors).toHaveLength(2);
        expect(state.resources.food).toBeGreaterThan(food);
        const b = makeCandidate(config, state, '测试地点', T0)!;
        state.candidates = [b];
        decideCandidate(config, state, b.id, false, T0);
        expect(state.survivors).toHaveLength(2);
        if (!b.survivor.profile) expect(state.flags).toContain(`refused_${b.survivor.id}`);
    });

    it('病号加入就是伤员；懒散的人干活慢', () => {
        const game = soloGame();
        const { config, state } = game;
        const [c] = offerCandidates(config, state, 1, '测试地点', T0);
        c.survivor.quirks = ['sick'];
        decideCandidate(config, state, c.id, true, T0);
        expect(state.survivors.find((s) => s.id === c.survivor.id)!.injured).toBe(true);

        for (const s of state.survivors) game.assign(s.id, null, T0);
        const ethan = state.survivors.find((s) => s.id === 'ethan')!;
        ethan.mood = 60;
        game.assign('ethan', 'kitchen', T0);
        const normal = productionPerMinute(config, state).food;
        ethan.quirks = ['lazy'];
        expect(productionPerMinute(config, state).food).toBeCloseTo(normal * 0.75);
    });

    it('藏着的坏毛病：一开始看不到，发作之后才暴露', () => {
        const game = soloGame();
        const { config, state } = game;
        const [c] = offerCandidates(config, state, 1, '测试地点', T0);
        c.survivor.quirks = ['thief'];
        expect(visibleQuirks(config, c.survivor)).toHaveLength(0);
        decideCandidate(config, state, c.id, true, T0);
        const s = state.survivors.find((x) => x.id === c.survivor.id)!;
        state.resources.food = 500;
        for (let i = 0; i < 30 && !(s.revealed ?? []).includes('thief'); i++) nightQuirks(config, state, T0 + i * MIN);
        expect(s.revealed).toContain('thief');
        expect(state.resources.food).toBeLessThan(500);
    });

    it('嘴不严的人让尸潮更容易来', () => {
        const game = soloGame();
        const { config, state } = game;
        state.raidCount = 1;
        const base = raidChanceTonight(config, state, T0);
        state.survivors[0].quirks = ['snitch'];
        expect(raidChanceTonight(config, state, T0)).toBeCloseTo(Math.min(1, base + 0.1));
    });

    it('没有界面时（模拟）自动决定，不会卡住', () => {
        const game = soloGame();
        game.liveRaids = false;
        offerCandidates(game.config, game.state, 2, '测试地点', T0);
        game.tick(T0 + MIN);
        expect(game.candidates).toHaveLength(0);
    });
});
