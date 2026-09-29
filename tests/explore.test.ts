import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { expeditionBlocker, getLocation } from '../assets/scripts/core/combat';
import { districtAt, districtDef, districtExplored } from '../assets/scripts/core/districts';
import { autoPack, carryHome, makePieces, newHaul, occupancy, packedWeight, placePiece } from '../assets/scripts/core/packing';
import { propCount, propDef } from '../assets/scripts/core/props';
import { haulSections, ownedVehicles, pickVehicle, vehicleDef } from '../assets/scripts/core/vehicles';
import { loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 21);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    game.state.resources.food = 5000;
    return game;
}

describe('地图分区', () => {
    it('每个地点都在某个区里；营地在超市街区', () => {
        const config = loadConfig();
        for (const loc of config.locations) expect(districtAt(config, loc.map), loc.id).toBeTruthy();
        expect(districtAt(config, { x: 0, y: -60 })?.id).toBe('downtown');
    });

    it('勘察一个区：回来后这个区亮起来一片，探索进度变高', () => {
        const game = newGame();
        const { config, state } = game;
        const d = districtDef(config, 'west_works')!;
        const before = districtExplored(config, state, d, T0);
        expect(game.survey(d.id, T0).ok).toBe(true);
        expect(state.surveys).toHaveLength(1);
        const who = state.surveys![0].squad[0];
        expect(game.assign(who, 'kitchen', T0).ok).toBe(false);
        game.tick(T0 + (d.surveyMinutes + 1) * MIN);
        expect(state.surveys).toHaveLength(0);
        expect(districtExplored(config, state, d, T0)).toBeGreaterThan(before);
        expect(state.stats.surveys_done).toBe(1);
    });

    it('一个区全部探索完，发一次奖励', () => {
        const game = newGame();
        const { config, state } = game;
        expect(districtExplored(config, state, districtDef(config, 'downtown')!, T0)).toBe(1);
        const d = districtDef(config, 'south_church')!;
        let t = T0;
        for (let i = 0; i < 40 && !(state.districtsCompleted ?? []).includes(d.id); i++) {
            state.survivors.forEach((s) => ((s.injured = false), (s.recoverAt = null)));
            game.survey(d.id, t);
            t += (d.surveyMinutes + 1) * MIN;
            game.tick(t);
        }
        expect(state.districtsCompleted).toContain(d.id);
        expect(districtExplored(config, state, d, t)).toBe(1);
        expect(game.survey(d.id, t)).toEqual({ ok: false, reason: '这个区已经探索完了' });
    });
});

describe('交通工具', () => {
    it('开局有托比的自行车，能去河畔老城；到不了要摩托的东南工业区', () => {
        const game = newGame();
        const { config, state } = game;
        expect(ownedVehicles(config, state).map((v) => v.id)).toEqual(['bicycle']);
        expect(pickVehicle(config, state, 1).vehicle?.id).toBe('bicycle');
        expect(pickVehicle(config, state, 2).blocker).toContain('太远了');
        expect(pickVehicle(config, state, 1, 'walk').blocker).toContain('太远了');
        state.flags.push('cleared_warehouse', 'cleared_radio_tower');
        state.buildings.hq.level = 12;
        expect(expeditionBlocker(config, state, 'military_checkpoint', ['ethan', 'toby'], T0)).toContain('太远了');
    });

    it('摩托车要汽油，每趟烧一桶；没油就去不了', () => {
        const game = newGame();
        const { config, state } = game;
        state.vehicles = ['bicycle', 'motorcycle'];
        state.props = { gasoline: 1 };
        expect(pickVehicle(config, state, 2).vehicle?.id).toBe('motorcycle');
        const d = districtDef(config, 'southeast')!;
        expect(game.survey(d.id, T0).ok).toBe(true);
        expect(propCount(state, 'gasoline')).toBe(0);
        expect(game.survey('north_reservoir', T0).ok).toBe(false);
    });

    it('老乔加入时开着皮卡；工坊能修车', () => {
        const game = newGame();
        const { state } = game;
        state.survivors.push({ id: 'joe', mood: 60, injured: false, recoverAt: null, assignment: null });
        game.tick(T0 + MIN);
        expect(state.vehicles).toContain('pickup');
        state.buildings.hq.level = 4;
        state.buildings.workshop.level = 1;
        state.resources.parts = 500;
        state.resources.wood = 500;
        expect(game.buildVehicle('motorcycle', T0 + MIN).ok).toBe(true);
        expect(state.vehicles).toContain('motorcycle');
    });

    it('开车出发路上更快', () => {
        const game = newGame();
        const { config, state } = game;
        const loc = getLocation(config, 'gas_station')!;
        game.explore('gas_station', T0, ['ethan', 'toby'], 'walk');
        expect(state.expeditions[0].returnsAt - T0).toBe(loc.durationMinutes * MIN);
        state.expeditions = [];
        game.explore('gas_station', T0, ['ethan', 'toby'], 'bicycle');
        expect(state.expeditions[0].returnsAt - T0).toBeLessThan(loc.durationMinutes * MIN);
    });
});

describe('探索背包', () => {
    it('资源打包，摆进格子不能重叠、不能超出、不能超重', () => {
        const game = newGame();
        const { config, state } = game;
        const pieces = makePieces(config, state, { food: 60, wood: 50 }, { shotgun: 1 });
        expect(pieces.filter((p) => p.item === 'food')).toHaveLength(3);
        expect(pieces.find((p) => p.item === 'shotgun')).toMatchObject({ w: 1, h: 3 });
        const haul = newHaul(config, state, '测试', T0, pieces, [{ label: '书包', w: 3, h: 3 }], 100);
        haul.packed = [];
        const wood = pieces.find((p) => p.item === 'wood')!;
        expect(placePiece(haul, wood.id, 0, 0, 0, false)).toBeNull();
        expect(placePiece(haul, pieces[0].id, 0, 1, 0, false)).toBe('位置被占了');
        expect(placePiece(haul, pieces[0].id, 0, 3, 0, false)).toBe('放不下');
        expect(placePiece(haul, pieces[0].id, 1, 0, 0, false)).toBe('没有这个格子');
        haul.maxWeight = packedWeight(haul);
        expect(placePiece(haul, pieces[0].id, 0, 2, 0, false)).toBe('太重了，背不动');
    });

    it('自动整理：放得下的都放进去，放不下的留下；带回营地只入库装进去的', () => {
        const game = newGame();
        const { config, state } = game;
        const pieces = makePieces(config, state, { food: 200, parts: 60 }, { mystery_box: 1 });
        const haul = newHaul(config, state, '测试', T0, pieces, [{ label: '书包', w: 3, h: 3 }], 999);
        autoPack(config, haul);
        state.resources.food = 0;
        const cells = occupancy(haul).flat().filter(Boolean).length;
        expect(cells).toBeLessThanOrEqual(9);
        expect(haul.packed.length).toBeLessThan(pieces.length);
        const food = state.resources.food;
        const res = carryHome(config, state, haul);
        expect(res.left).not.toBe('');
        expect(state.resources.food - food).toBe(res.loot.food ?? 0);
    });

    it('界面模式：打赢后战利品等玩家装包，确认后才入库', () => {
        const game = newGame();
        game.liveRaids = true;
        const { state } = game;
        game.explore('gas_station', T0, ['ethan', 'derek', 'toby']);
        game.tick(state.expeditions[0].returnsAt + 1);
        expect(game.currentHaul).toBeTruthy();
        const haul = game.currentHaul!;
        const food = state.resources.food;
        expect(game.carryHaul(game.now).ok).toBe(true);
        expect(game.currentHaul).toBeUndefined();
        const packedFood = haul.packed.map((pk) => haul.pieces.find((p) => p.id === pk.piece)!).filter((p) => p.item === 'food').reduce((n, p) => n + p.amount, 0);
        expect(state.resources.food).toBeGreaterThanOrEqual(food + packedFood - 50);
    });
});

describe('不同种类的背包（三角洲式）', () => {
    it('每个人的包是一块或几块格子区，没背包只有两只手；开车多一块后备箱', () => {
        const game = newGame();
        const { config, state } = game;
        const ethan = state.survivors.find((s) => s.id === 'ethan')!;
        ethan.gear = { bag: 'hiking_pack' };
        const cap = haulSections(config, state, ['ethan', 'toby'], vehicleDef(config, 'bicycle'));
        expect(cap.sections.map((s) => [s.w, s.h])).toEqual([[3, 4], [2, 2], [2, 2], [2, 2]]);
        expect(cap.sections[2].label).toContain('两只手');
        const per = config.districts!.carryPerPerson;
        expect(cap.maxWeight).toBe(per * 2 + propDef(config, 'hiking_pack')!.bag!.carry + vehicleDef(config, 'bicycle')!.cargo);
    });

    it('自动整理会用上所有格子区；一件东西不能跨区', () => {
        const game = newGame();
        const { config, state } = game;
        const pieces = makePieces(config, state, { food: 200 }, {});
        const haul = newHaul(config, state, '测试', T0, pieces, [{ label: 'A', w: 2, h: 2 }, { label: 'B', w: 2, h: 2 }], 999);
        expect(haul.packed.length).toBe(8);
        expect(new Set(haul.packed.map((pk) => pk.section))).toEqual(new Set([0, 1]));
        const long = makePieces(config, state, {}, { shotgun: 1 });
        const h2 = newHaul(config, state, '测试', T0, long, [{ label: 'A', w: 2, h: 2 }, { label: 'B', w: 2, h: 2 }], 999);
        expect(h2.packed).toHaveLength(0);
    });

    it('开局伊森背着书包', () => {
        const game = CampGame.newGame(loadConfig({ soloStart: true }), T0, 1);
        expect(game.state.survivors[0].gear?.bag).toBe('school_bag');
    });
});
