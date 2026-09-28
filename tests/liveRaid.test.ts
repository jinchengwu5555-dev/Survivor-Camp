import { describe, expect, it } from 'vitest';
import { Battle } from '../assets/scripts/core/battle/Battle';
import { CampGame } from '../assets/scripts/core/CampGame';
import { battleRegistry } from '../assets/scripts/core/combat';
import { nextHint } from '../assets/scripts/core/guide';
import { eventSpeaker } from '../assets/scripts/core/portrait';
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

    it('花木材修补栅栏，有次数限制', () => {
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

describe('新手引导', () => {
    it('开局先提示安排人手，然后跟着剧情目标走', () => {
        const game = CampGame.newGame(loadConfig(), T0, 42);
        game.state.eventQueue = [];
        expect(nextHint(game.config, game.state, T0)).toMatchObject({ target: 'assign', tab: 'survivors' });
        game.assign('martha', 'kitchen', T0);
        expect(nextHint(game.config, game.state, T0)).toMatchObject({ target: 'upgrade:wall', tab: 'camp' });
        game.upgrade('wall', T0);
        expect(nextHint(game.config, game.state, T0)).toMatchObject({ target: 'speedup:wall' });
    });

    it('探索目标指向探索页的地点', () => {
        const game = CampGame.newGame(loadConfig(), T0, 42);
        game.state.eventQueue = [];
        game.assign('martha', 'kitchen', T0);
        game.state.episodeIndex = 1;
        game.state.buildings.kitchen.level = 2;
        expect(nextHint(game.config, game.state, T0)).toMatchObject({ target: 'explore:gas_station', tab: 'explore' });
    });

    it('有事件、有尸潮时不打扰', () => {
        const game = CampGame.newGame(loadConfig(), T0, 42);
        expect(game.state.eventQueue.length).toBeGreaterThan(0);
        expect(nextHint(game.config, game.state, T0)).toBeNull();
    });
});

describe('事件立绘', () => {
    it('没写 speaker 时取正文里第一个提到的人，都没有就是旁白', () => {
        const game = CampGame.newGame(loadConfig(), T0, 42);
        const ev = { id: 'x', title: '', text: '苏菲和德里克在吵架。', weight: 0, choices: [] };
        expect(eventSpeaker(game.config, game.state, ev).id).toBe('sophie');
        expect(eventSpeaker(game.config, game.state, { ...ev, speaker: 'derek' }).id).toBe('derek');
        expect(eventSpeaker(game.config, game.state, { ...ev, text: '外面下雨了。' }).id).toBe('narrator');
    });
});
