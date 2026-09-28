import { describe, expect, it } from 'vitest';
import { Battle } from '../assets/scripts/core/battle/Battle';
import { CampGame } from '../assets/scripts/core/CampGame';
import { battleRegistry } from '../assets/scripts/core/combat';
import { loadConfig, MIN, RAID, T0 } from './helpers';

function newGame(live = true) {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.flags.push('raids_started', 'first_raid_scheduled');
    game.liveRaids = live;
    return game;
}

/** 按界面的节奏把战斗打完：每 0.1 秒推进一次，技能好了就点 */
function playOut(game: CampGame) {
    const live = game.liveRaid()!;
    for (let i = 0; i < 10_000 && !live.done; i++) {
        for (const b of live.skillButtons()) if (b.cooldown <= 0 && !b.blocked) live.cast(b.uid);
        live.advance(0.1);
    }
    return live;
}

describe('亲手守夜', () => {
    it('界面打开时尸潮不自动结算，等玩家来打', () => {
        const game = newGame();
        game.tick(T0 + RAID);
        expect(game.state.pendingRaid).toBeTruthy();
        expect(game.state.reports).toHaveLength(0);
        expect(game.liveRaid()).toBe(game.liveRaid());
        // 等待期间不会再来第二场
        game.tick(T0 + 3 * RAID);
        expect(game.state.raidCount).toBe(1);
    });

    it('手动放技能、打完结算，战报可以完整重放（包括玩家的操作）', () => {
        const game = newGame();
        game.tick(T0 + RAID);
        const live = playOut(game);
        expect(live.battle.inputs.some((i) => 'cast' in i)).toBe(true);
        const report = game.finishLiveRaid(T0 + RAID + MIN)!;
        expect(game.state.pendingRaid).toBeNull();
        expect(report.kind).toBe('raid');
        expect(report.setup.inputs?.length).toBe(live.battle.inputs.length);
        const replay = new Battle(battleRegistry(game.config), report.setup);
        expect(replay.runToEnd()).toBe(report.result);
        expect(replay.events.length).toBe(live.battle.events.length);
    });

    it('花木材修补路障，有次数限制', () => {
        const game = newGame();
        game.state.resources.wood = 200;
        game.tick(T0 + RAID);
        const live = game.liveRaid()!;
        expect(live.repair()).toBe('不需要修补');
        live.barricade!.hp = 1;
        const { wood } = live.repairCost();
        expect(live.repair()).toBeNull();
        expect(game.state.resources.wood).toBe(200 - wood);
        expect(live.barricade!.hp).toBe(1 + live.repairCost().hp);
        for (let i = 1; i < game.config.balance.raidRepair.maxUses; i++) {
            live.barricade!.hp = 1;
            expect(live.repair()).toBeNull();
        }
        live.barricade!.hp = 1;
        expect(live.repair()).toBe('这一夜已经修不动了');
        expect(game.state.stats.barricade_repairs).toBe(game.config.balance.raidRepair.maxUses);
    });

    it('跳过：剩下的自动打完', () => {
        const game = newGame();
        game.tick(T0 + RAID);
        game.liveRaid()!.skip();
        expect(game.liveRaid()!.done).toBe(true);
        expect(game.finishLiveRaid(T0 + RAID)?.result).toBeDefined();
    });

    it('没有界面在看时，留着的尸潮会自动打完', () => {
        const game = newGame();
        game.tick(T0 + RAID);
        game.liveRaids = false;
        game.tick(T0 + RAID + MIN);
        expect(game.state.pendingRaid).toBeNull();
        expect(game.state.reports.filter((r) => r.kind === 'raid')).toHaveLength(1);
    });
});

describe('第一次尸潮', () => {
    it('第 1 集结束后很快就来', () => {
        const game = CampGame.newGame(loadConfig(), T0, 42);
        game.state.eventQueue = [];
        game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
        game.state.flags.push('raids_started');
        game.tick(T0 + MIN);
        expect(game.state.nextRaidAt).toBe(T0 + MIN + game.config.balance.firstRaidMinutes * MIN);
        expect(game.state.flags).toContain('first_raid_scheduled');
    });
});
