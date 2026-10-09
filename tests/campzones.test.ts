// 营地空地：开局只有中间能用，其他地要清理（花资源、等时间、有的要指挥部等级）才能盖房子
import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { battleCamp, buildingZoneBlocker, campZones, clearZoneBlocker, zoneCleared, zoneOfBuilding } from '../assets/scripts/core/campzones';
import { prepareRaid } from '../assets/scripts/core/combat';
import { upgradeBlocker } from '../assets/scripts/core/buildings';
import { loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig({ soloStart: true }), T0, 2);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('营地空地', () => {
    it('开局只有中间一块；开局就有的建筑都在中间', () => {
        const game = newGame();
        const { config, state } = game;
        const start = campZones(config).filter((z) => zoneCleared(config, state, z.id)).map((z) => z.id);
        expect(start).toEqual(['core']);
        for (const id of ['hq', 'kitchen', 'dorm', 'scrapyard', 'well', 'wall']) expect(zoneOfBuilding(config, config.buildings.find((b) => b.id === id)!)!.id).toBe('core');
    });

    it('没清理的地上不能盖房子；清理花资源、要等，清完就能盖', () => {
        const game = newGame();
        const { config, state } = game;
        state.buildings.hq.level = 2;
        state.survivors.push({ id: 'martha', mood: 60, injured: false, recoverAt: null, assignment: null });
        state.resources.wood = 500;
        state.resources.parts = 200;
        expect(buildingZoneBlocker(config, state, 'garden')).toBe('要先清理「西边的货架堆」');
        expect(upgradeBlocker(config, state, 'garden')).toBe('要先清理「西边的货架堆」');
        const wood = state.resources.wood;
        expect(game.clearZone('west', T0 + MIN).ok).toBe(true);
        expect(state.resources.wood).toBeLessThan(wood);
        expect(clearZoneBlocker(config, state, 'west')).toBe('正在清理');
        expect(game.clearZone('northeast', T0 + MIN)).toEqual({ ok: false, reason: '一次只能清理一块地' });
        game.tick(T0 + MIN + 2 * MIN);
        expect(zoneCleared(config, state, 'west')).toBe(false);
        game.tick(T0 + MIN + 4 * MIN);
        expect(zoneCleared(config, state, 'west')).toBe(true);
        expect(state.stats.zones_cleared).toBe(1);
        expect(upgradeBlocker(config, state, 'garden')).toBeNull();
        // 东北角要指挥部 3 级
        expect(clearZoneBlocker(config, state, 'northeast')).toBe('需要指挥部 3 级');
    });

    it('老存档：上面已经有建筑的地算清理过了', () => {
        const game = newGame();
        const { config, state } = game;
        state.buildings.cellar.level = 1;
        expect(zoneCleared(config, state, 'southeast')).toBe(true);
        expect(zoneCleared(config, state, 'northeast')).toBe(false);
    });

    it('守夜的战场就是营地地图：围墙随清理出来的地变大，建好的建筑也在里面', () => {
        const game = newGame();
        const { config, state } = game;
        const small = battleCamp(config, state)!;
        state.zones = { west: { cleared: true, endsAt: null } };
        state.buildings.garden.level = 1;
        const big = battleCamp(config, state)!;
        expect(big.rect.x1).toBeLessThan(small.rect.x1);
        expect(big.buildings.some((b) => b.x < small.rect.x1)).toBe(true);
        const pending = prepareRaid(config, state, config.raids[0], T0);
        expect(pending.setup.camp?.rect).toEqual(big.rect);
        expect(pending.setup.camp?.buildings?.length).toBe(big.buildings.length);
    });
});
