import { describe, expect, it } from 'vitest';
import { Battle } from '../assets/scripts/core/battle/Battle';
import { CampGame } from '../assets/scripts/core/CampGame';
import { battleRegistry, currentRaid, runRaid, suggestSquad, survivorPower } from '../assets/scripts/core/combat';
import { applyEffect } from '../assets/scripts/core/events';
import { loadGame } from '../assets/scripts/core/save';
import { dayStart, INJURY, loadConfig, MemoryStorage, MIN, RAID, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    return game;
}

const survivor = (game: CampGame, id: string) => game.state.survivors.find((s) => s.id === id)!;

describe('探索', () => {
    it('自动编队按战斗力挑 4 个人，优先派闲着的人', () => {
        const game = newGame();
        const squad = suggestSquad(game.config, game.state);
        expect(squad).toHaveLength(4);
        expect(squad).toContain('ethan');
        // 伊森战斗力最高；其他人都是普通幸存者，看天赋和装备
        const power = (id: string) => survivorPower(game.config, game.state, id);
        for (let i = 1; i < squad.length; i++) expect(power(squad[i - 1])).toBeGreaterThanOrEqual(power(squad[i]));
        game.assign('martha', 'kitchen', T0);
        expect(suggestSquad(game.config, game.state)).not.toContain('martha');
    });

    it('人手不够时才从岗位上抽人，出发后离开工作岗位', () => {
        const game = newGame();
        for (const [id, job] of [['martha', 'kitchen'], ['toby', 'kitchen'], ['derek', 'scrapyard'], ['sophie', 'scrapyard']]) game.assign(id, job, T0);
        const squad = suggestSquad(game.config, game.state);
        expect(squad[0]).toBe('ethan');
        expect(squad).toHaveLength(4);
        expect(squad).toContain('martha');
        expect(game.explore('gas_station', T0).ok).toBe(true);
        expect(survivor(game, 'martha').assignment).toBeNull();
        expect(game.assign('martha', 'kitchen', T0)).toEqual({ ok: false, reason: '正在外面探索' });
    });

    it('未解锁的地点、已有小队的地点、受伤的成员都不能出发', () => {
        const game = newGame();
        expect(game.explore('hardware_store', T0)).toEqual({ ok: false, reason: '这个地点还没解锁' });
        game.explore('gas_station', T0, ['toby']);
        expect(game.explore('gas_station', T0, ['sophie'])).toEqual({ ok: false, reason: '已经有小队在这里了' });
        survivor(game, 'sophie').injured = true;
        game.state.flags.push('cleared_gas_station');
        expect(game.explore('hardware_store', T0, ['sophie']).ok).toBe(false);
    });

    it('到时间自动结算：打赢带回战利品、解锁下一个地点、写战报', () => {
        const game = newGame();
        const food = game.state.resources.food;
        game.explore('gas_station', T0);
        game.tick(T0 + 2 * MIN);
        expect(game.state.expeditions).toHaveLength(1);
        game.tick(T0 + 3 * MIN);
        expect(game.state.expeditions).toHaveLength(0);
        const report = game.state.reports[0];
        expect(report).toMatchObject({ kind: 'expedition', result: 'win', loot: { food: 50, wood: 10 } });
        expect(game.state.resources.food).toBeGreaterThan(food + 40);
        expect(game.state.flags).toContain('cleared_gas_station');
        expect(game.explore('hardware_store', T0 + 3 * MIN).ok).toBe(true);
    });

    it('仓库满了：战报只记实际拿到的数量', () => {
        const game = newGame();
        game.state.resources.food = 190;
        game.explore('gas_station', T0);
        game.state.resources.food = 190;
        game.state.lastTickAt = T0 + 3 * MIN; // 跳过这段时间的吃饭消耗
        game.speedUpExpedition(game.state.expeditions[0].id, T0 + 3 * MIN);
        expect(game.state.reports[0].loot.food).toBe(10);
        expect(game.state.resources.food).toBe(200);
    });

    it('打赢后地点要过一段时间才能再去', () => {
        const game = newGame();
        game.explore('gas_station', T0);
        game.tick(T0 + 3 * MIN);
        const restock = game.config.balance.locationRestockMinutes * MIN;
        expect(game.explore('gas_station', T0 + 3 * MIN)).toEqual({ ok: false, reason: '刚搜刮过，物资还没重新聚起来' });
        expect(game.explore('gas_station', T0 + 3 * MIN + restock).ok).toBe(true);
    });

    it('看广告加速：小队立即返回', () => {
        const game = newGame();
        game.explore('gas_station', T0);
        const id = game.state.expeditions[0].id;
        expect(game.speedUpExpedition(id, T0 + MIN).ok).toBe(true);
        expect(game.state.reports).toHaveLength(1);
    });

    it('打输了：倒下的人受伤，过一段时间自然痊愈', () => {
        const game = newGame();
        game.state.flags.push('cleared_hardware_store');
        game.state.buildings.hq.level = 3;
        game.explore('clinic', T0, ['sophie']);
        game.tick(T0 + 20 * MIN);
        expect(game.state.reports[0].result).toBe('lose');
        expect(game.state.reports[0].loot).toEqual({});
        const sophie = survivor(game, 'sophie');
        expect(sophie.injured).toBe(true);
        expect(game.explore('gas_station', T0 + 20 * MIN, ['sophie']).ok).toBe(false);
        game.tick(T0 + 20 * MIN + INJURY);
        expect(sophie.injured).toBe(false);
    });

    it('第一次打下警长办公室触发剧情，第二次不再触发', () => {
        const game = newGame();
        game.state.flags.push('cleared_clinic');
        game.state.buildings.hq.level = 5;
        const later = dayStart(6);
        game.state.lastTickAt = later;
        game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
        game.state.buildings.training.level = 8; // 训练练够了必胜，避免测试依赖随机结果
        game.explore('sheriff_office', later);
        game.tick(later + 30 * MIN);
        expect(game.state.reports[0].result).toBe('win');
        expect(game.state.eventQueue).toContain('sheriff_photo');
        game.state.eventQueue = [];
        const again = later + 30 * MIN + game.config.balance.locationRestockMinutes * MIN;
        expect(game.explore('sheriff_office', again).ok).toBe(true);
        game.tick(again + 30 * MIN);
        expect(game.state.reports[game.state.reports.length - 1].result).toBe('win');
        expect(game.state.eventQueue).not.toContain('sheriff_photo');
    });

    it('第 2 集的目标“搜刮加油站便利店”通过探索完成', () => {
        const game = newGame();
        game.state.episodeIndex = 1;
        game.state.buildings.kitchen.level = 2;
        game.explore('gas_station', T0);
        game.tick(T0 + 3 * MIN);
        expect(game.state.episodeIndex).toBe(2);
    });

    it('探索途中离开营地的人会从小队里移除', () => {
        const game = newGame();
        game.explore('gas_station', T0, ['toby', 'derek']);
        applyEffect(game.config, game.state, { type: 'removeSurvivor', survivor: 'toby' }, T0);
        expect(game.state.expeditions[0].squad).toEqual(['derek']);
    });
});

describe('尸潮夜袭', () => {
    it('第 1 集结束前不会来尸潮', () => {
        const game = newGame();
        game.tick(T0 + RAID + MIN);
        expect(game.state.reports).toHaveLength(0);
        expect(game.state.nextRaidAt).toBe(T0 + 2 * RAID + MIN);
    });

    it('到时间自动守夜：全员 + 栅栏上阵，守住了发奖励', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        game.state.buildings.wall.level = 2;
        const parts = game.state.resources.parts;
        game.state.createdAt = T0 - 6 * RAID; // 让这次守夜落在第 6 天之后，来的是“尸群”
        game.tick(T0 + RAID);
        const report = game.state.reports[0];
        expect(report).toMatchObject({ kind: 'raid', title: '尸群', result: 'win', loot: { parts: 10, wood: 20 } });
        expect(report.setup.allies[0].tag).toBe('barricade');
        expect(report.setup.allies.map((a) => a.tag).sort()).toEqual(['barricade', 'derek', 'ethan', 'martha', 'sophie', 'toby']);
        expect(report.setup.allies[0].maxHp).toBe(25 * 30);
        expect(report.setup.mustSurvive).toEqual(['barricade']);
        expect(game.state.resources.parts).toBeGreaterThanOrEqual(parts + 10);
    });

    it('训练场提升所有人的战斗等级', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        game.state.buildings.training.level = 2;
        game.tick(T0 + RAID);
        expect(game.state.reports[0].setup.allies[1].level).toBe(3);
    });

    it('栅栏被拆就算输，哪怕守夜的人都还活着', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        game.state.buildings.wall.level = 1;
        const raid = game.config.raids.find((r) => r.id === 'great_horde')!;
        const report = runRaid(game.config, game.state, raid, T0);
        expect(report.result).toBe('lose');
        expect(report.injured.length).toBeLessThan(5);
    });

    it('没人守、栅栏被拆：守夜失败，损失 10% 资源，之后的尸潮减弱（喘息）', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        game.state.survivors.forEach((s) => (s.injured = true));
        game.state.resources.food = 100;
        const raid = currentRaid(game.config, game.state, T0)!;
        const report = runRaid(game.config, game.state, raid, T0);
        expect(report.result).toBe('lose');
        expect(report.lost.food).toBe(10);
        expect(game.state.resources.food).toBe(90);
        expect(game.state.raidRelief).toBe(2);
    });

    it('越往后尸潮越凶', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        expect(currentRaid(game.config, game.state, T0)?.id).toBe('small_horde');
        expect(currentRaid(game.config, game.state, dayStart(6))?.id).toBe('horde');
        expect(currentRaid(game.config, game.state, dayStart(18))?.id).toBe('great_horde');
    });

    it('一次跳过很久也只结算一次尸潮', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        game.tick(T0 + 8 * RAID);
        expect(game.state.reports.filter((r) => r.kind === 'raid')).toHaveLength(1);
    });

    it('战报可以用同一个种子完整重放', () => {
        const game = newGame();
        game.state.flags.push('raids_started');
        game.tick(T0 + RAID);
        const report = game.state.reports[0];
        const replay = new Battle(battleRegistry(game.config), report.setup);
        expect(replay.runToEnd()).toBe(report.result);
    });

    it('栅栏不会被医生治疗', () => {
        const game = newGame();
        const b = new Battle(battleRegistry(game.config), {
            allies: [{ unit: 'barricade', x: 1.5, maxHp: 300 }, { unit: 'sophie' }],
            enemies: [{ unit: 'walker', x: 50 }],
            timeLimit: 10,
            timeoutResult: 'win',
            seed: 1,
        });
        b.units[0].hp = 10;
        b.step();
        expect(b.events.some((e) => e.type === 'heal')).toBe(false);
    });
});

describe('伤员治疗', () => {
    it('需要医务室和药品', () => {
        const game = newGame();
        const sophie = survivor(game, 'sophie');
        sophie.injured = true;
        expect(game.treat('sophie', T0)).toEqual({ ok: false, reason: '需要先建造医务室' });
        game.state.buildings.infirmary.level = 1;
        game.state.resources.medicine = 4;
        expect(game.treat('sophie', T0)).toEqual({ ok: false, reason: '药品不足' });
        game.state.resources.medicine = 5;
        expect(game.treat('sophie', T0).ok).toBe(true);
        expect(sophie.injured).toBe(false);
        expect(game.state.resources.medicine).toBe(0);
    });
});

describe('老存档升级', () => {
    it('第 1 版存档可以读取，补全远征、尸潮、战报以及第 3 版的新字段', () => {
        const game = newGame();
        const old = JSON.parse(JSON.stringify(game.state));
        old.version = 1;
        delete old.expeditions;
        delete old.nextRaidAt;
        delete old.reports;
        delete old.nextId;
        old.survivors[0].injured = true;
        delete old.survivors[0].recoverAt;
        const storage = new MemoryStorage();
        storage.setItem('doomsday-camp-save', JSON.stringify(old));
        const loaded = loadGame(storage, game.config, T0)!;
        expect(loaded.version).toBe(6);
        expect(loaded.clock.gameTime).toBe(old.lastTickAt);
        expect(loaded.raidRelief).toBe(0);
        expect(loaded.siteId).toBe('supermarket');
        expect(loaded.discoveredSites).toEqual(['supermarket']);
        expect(loaded.gameOver).toBeNull();
        expect(loaded.expeditions).toEqual([]);
        expect(loaded.stats).toEqual({});
        expect(loaded.bounties).toEqual({ active: [], completed: [] });
        expect(loaded.seasonId).toBe('summer');
        expect(loaded.nextRaidAt).toBe(T0 + RAID);
        expect(loaded.survivors[0].recoverAt).toBe(T0 + INJURY);
    });
});
