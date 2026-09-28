import { describe, expect, it } from 'vitest';
import { Battle } from '../assets/scripts/core/battle/Battle';
import { CampGame } from '../assets/scripts/core/CampGame';
import { battleRegistry, raidSetup, squadOf } from '../assets/scripts/core/combat';
import { addWanderer, injureSurvivor } from '../assets/scripts/core/roster';
import { combatMultiplier, talentsOf, workMultiplier } from '../assets/scripts/core/talents';
import { validateConfig } from '../assets/scripts/core/validate';
import { INJURY, loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('天赋', () => {
    it('每个有名有姓的角色都有天赋，流浪者随机抽一个', () => {
        const game = newGame();
        for (const s of game.config.survivors) expect(s.talents?.length, s.id).toBeGreaterThan(0);
        const w = addWanderer(game.config, game.state, T0)!;
        expect(talentsOf(game.config, game.state, w.id)).toHaveLength(1);
        expect(['leadership', 'veteran']).not.toContain(w.profile!.talents![0]);
    });

    it('干活：限定建筑的天赋只在那个建筑生效', () => {
        const game = newGame();
        expect(workMultiplier(game.config, game.state, 'martha', 'kitchen')).toBeCloseTo(1.3);
        expect(workMultiplier(game.config, game.state, 'martha', 'scrapyard')).toBe(1);
        expect(workMultiplier(game.config, game.state, 'toby', 'scrapyard')).toBeCloseTo(1.15);
    });

    it('战斗：天赋的攻击 / 生命倍率带进战斗', () => {
        const game = newGame();
        const { config, state } = game;
        const squad = squadOf(config, state, ['hank']);
        expect(squad[0].atkMult).toBeCloseTo(combatMultiplier(config, state, 'hank').atk);
        const raid = config.raids[0];
        const setup = raidSetup(config, raid, squadOf(config, state, ['ethan']), 300, 1, 1);
        const b = new Battle(battleRegistry(config), setup);
        const ethan = b.units.find((u) => u.tag === 'ethan')!;
        const base = battleRegistry(config).unit('ethan').stats;
        expect(ethan.stats.maxHp).toBe(Math.round(base.maxHp * 1.25));
        expect(ethan.stats.atk).toBeCloseTo(base.atk * 1.1);
    });

    it('恢复力强：养伤时间减半', () => {
        const game = newGame();
        const sophie = game.state.survivors.find((s) => s.id === 'sophie')!;
        const derek = game.state.survivors.find((s) => s.id === 'derek')!;
        injureSurvivor(game.config, game.state, sophie, T0);
        injureSurvivor(game.config, game.state, derek, T0);
        expect(sophie.recoverAt! - T0).toBeCloseTo((derek.recoverAt! - T0) / 2);
        expect(derek.recoverAt! - T0).toBe(INJURY);
    });

    it('飞毛腿：侦察更快', () => {
        const game = newGame();
        for (const s of game.state.survivors) if (s.id !== 'toby') s.injured = true;
        game.state.scoutSpots = [{ id: 1, kind: 'wreck', x: 0, y: 0, expiresAt: T0 + 60 * MIN }];
        game.sendScout(1, T0);
        const sc = game.state.scouts![0];
        expect(sc.survivor).toBe('toby');
        expect(sc.returnsAt - T0).toBeCloseTo(game.config.scouting.kinds.find((k) => k.id === 'wreck')!.travelMinutes * 0.6 * MIN);
    });

    it('配置里引用不存在的天赋会报错', () => {
        const config = loadConfig();
        config.survivors[0].talents = ['no_such_talent'];
        expect(validateConfig(config).some((e) => e.includes('未知天赋'))).toBe(true);
    });
});
