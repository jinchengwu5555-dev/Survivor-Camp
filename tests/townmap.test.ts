import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { campPoint, exploredRatio, isRevealed, locationStatus, prerequisiteOf, revealers, unlockHint } from '../assets/scripts/core/townMap';
import { activeScoutSpots, isScouting, scoutKind } from '../assets/scripts/core/scouting';
import { idleSurvivors } from '../assets/scripts/core/workers';
import { availableFighters } from '../assets/scripts/core/combat';
import { loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}
const loc = (game: CampGame, id: string) => game.config.locations.find((l) => l.id === id)!;

describe('镇地图', () => {
    it('每个地点都有坐标；营地画在当前营地地点的位置', () => {
        const game = newGame();
        for (const l of game.config.locations) expect(l.map, l.id).toBeTruthy();
        expect(campPoint(game.config, game.state)).toEqual(game.config.sites.find((s) => s.id === 'supermarket')!.map);
        game.state.siteId = 'farm';
        expect(campPoint(game.config, game.state)).toEqual(game.config.sites.find((s) => s.id === 'farm')!.map);
    });

    it('地点状态：打下 / 已知 / 传闻（显示？）/ 藏在迷雾里', () => {
        const game = newGame();
        const { config, state } = game;
        expect(locationStatus(config, state, loc(game, 'gas_station'), T0)).toBe('known');
        expect(locationStatus(config, state, loc(game, 'hardware_store'), T0)).toBe('rumor');
        expect(locationStatus(config, state, loc(game, 'school'), T0)).toBe('hidden');
        expect(prerequisiteOf(config, loc(game, 'school'))?.id).toBe('park');
        expect(unlockHint(config, state, loc(game, 'hardware_store'), T0)).toBe('先打下加油站便利店');
        state.flags.push('cleared_gas_station');
        expect(locationStatus(config, state, loc(game, 'gas_station'), T0)).toBe('cleared');
        expect(locationStatus(config, state, loc(game, 'school'), T0)).toBe('rumor');
        expect(unlockHint(config, state, loc(game, 'motel'), T0)).toBe('第 3 天以后');
    });

    it('越探索，迷雾散开得越多', () => {
        const game = newGame();
        const { config, state } = game;
        const before = exploredRatio(config, state, T0);
        expect(isRevealed(revealers(config, state, T0), loc(game, 'clinic').map!.x, loc(game, 'clinic').map!.y)).toBe(false);
        state.flags.push('cleared_gas_station', 'cleared_hardware_store', 'cleared_park', 'cleared_clinic');
        expect(exploredRatio(config, state, T0)).toBeGreaterThan(before);
        expect(isRevealed(revealers(config, state, T0), loc(game, 'clinic').map!.x, loc(game, 'clinic').map!.y)).toBe(true);
    });
});

describe('侦察点', () => {
    it('在亮起来的区域里刷出来，最多 maxActive 个', () => {
        const game = newGame();
        const cfg = game.config.scouting;
        game.tick(T0 + cfg.intervalMinutes * 4 * MIN);
        const spots = activeScoutSpots(game.state, game.now);
        expect(spots.length).toBeGreaterThan(0);
        expect(spots.length).toBeLessThanOrEqual(cfg.maxActive);
        const pts = revealers(game.config, game.state, game.now);
        for (const s of spots) expect(isRevealed(pts, s.x, s.y)).toBe(true);
    });

    it('派一个人去，他暂时不能干活也不能出战，回来带回东西', () => {
        const game = newGame();
        game.state.scoutSpots = [{ id: 900, kind: 'wreck', x: 10, y: 10, expiresAt: T0 + 60 * MIN }];
        game.config.scouting.injuryChance = 0;
        const res = game.sendScout(900, T0);
        expect(res.ok).toBe(true);
        const who = game.state.scouts![0].survivor;
        expect(isScouting(game.state, who)).toBe(true);
        expect(idleSurvivors(game.state).some((s) => s.id === who)).toBe(false);
        expect(availableFighters(game.config, game.state).some((s) => s.id === who)).toBe(false);
        expect(game.assign(who, 'kitchen', T0)).toEqual({ ok: false, reason: '正在外面侦察' });
        const wood = game.state.resources.wood;
        game.tick(T0 + (scoutKind(game.config, 'wreck')!.travelMinutes + 1) * MIN);
        expect(game.state.scouts).toHaveLength(0);
        expect(game.state.resources.wood).toBeGreaterThan(wood);
        expect(game.state.stats.scouts_done).toBe(1);
    });

    it('求救信号：回来后触发救人的事件', () => {
        const game = newGame();
        game.state.scoutSpots = [{ id: 901, kind: 'signal', x: 0, y: 0, expiresAt: T0 + 60 * MIN }];
        game.sendScout(901, T0);
        game.tick(T0 + 10 * MIN);
        expect(game.state.eventQueue).toContain('scout_signal');
    });

    it('没人能派时不能侦察；侦察点没了也不能', () => {
        const game = newGame();
        game.state.scoutSpots = [{ id: 902, kind: 'wreck', x: 0, y: 0, expiresAt: T0 + 60 * MIN }];
        game.state.survivors.forEach((s) => (s.injured = true));
        expect(game.sendScout(902, T0)).toEqual({ ok: false, reason: '没有能派出去的人' });
        expect(game.sendScout(12345, T0)).toEqual({ ok: false, reason: '已经没了' });
    });
});
