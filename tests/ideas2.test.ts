// 资料库第二批采用的点子：R55 伊森的日记、R57 信号弹、R58 熟悉的丧尸、R62 出大红、R79 今日情报
import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { prepareRaid, runRaid } from '../assets/scripts/core/combat';
import { addFamiliar, parseFamiliarTag, restlessGraves } from '../assets/scripts/core/familiar';
import { intelMods, todayIntel } from '../assets/scripts/core/intel';
import { propDef, treasureValue } from '../assets/scripts/core/props';
import { killSurvivor } from '../assets/scripts/core/roster';
import { newSurvivorState, setFlag } from '../assets/scripts/core/state';
import { DAY, dayStart, loadConfig, MIN, RAID, T0 } from './helpers';

function newGame(config = loadConfig(), seed = 4) {
    const game = CampGame.newGame(config, T0, seed);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('R58 熟悉的丧尸', () => {
    it('死在外面的人记为尸骨未归，过几天才可能出现在尸潮里', () => {
        const game = newGame();
        const { config, state } = game;
        killSurvivor(config, state, 'toby', T0, '在外面牺牲了', 'gas_station');
        killSurvivor(config, state, 'derek', T0, '在守夜中牺牲了');
        expect(state.graveyard!.find((g) => g.id === 'toby')!.lost).toBe(true);
        expect(state.graveyard!.find((g) => g.id === 'derek')!.lost).toBeUndefined();
        expect(restlessGraves(config, state, T0 + MIN)).toHaveLength(0);
        const later = T0 + (config.balance.familiarZombie!.delayDays + 0.1) * DAY;
        expect(restlessGraves(config, state, later).map((g) => g.id)).toEqual(['toby']);
    });

    it('尸潮里混进一个带名字的行尸；打倒就把遗体带回来安葬', () => {
        const config = loadConfig();
        config.balance.familiarZombie = { ...config.balance.familiarZombie!, chance: 1, hpMult: 0.01, atkMult: 0.01, spawnAt: 0 };
        const game = newGame(config);
        const { state } = game;
        killSurvivor(config, state, 'toby', T0, '在外面牺牲了', 'gas_station');
        const at = T0 + (config.balance.familiarZombie!.delayDays + 1) * DAY;
        game.tick(at);
        const raid = config.raids[0];
        const report = runRaid(config, state, raid, at);
        const grave = state.graveyard!.find((g) => g.id === 'toby')!;
        expect(grave.sightings).toBe(1);
        expect(report.setup.enemies.some((e) => parseFamiliarTag(e.tag)?.name === grave.name)).toBe(true);
        expect(grave.returned).toBe(true);
        expect(state.stats.familiar_laid_to_rest).toBe(1);
        expect(restlessGraves(config, state, at)).toHaveLength(0);
    });

    it('概率没中就不加', () => {
        const config = loadConfig();
        config.balance.familiarZombie = { ...config.balance.familiarZombie!, chance: 0 };
        const game = newGame(config);
        killSurvivor(config, game.state, 'toby', T0, '在外面牺牲了', 'gas_station');
        const pending = prepareRaid(config, game.state, config.raids[0], T0 + 10 * DAY);
        expect(pending.familiar).toBeUndefined();
        expect(addFamiliar(config, game.state, pending.setup, 1, T0 + 10 * DAY)).toBeUndefined();
    });
});

describe('R57 信号弹', () => {
    it('招来几个候选人，当晚一定有尸潮而且更大', () => {
        const config = loadConfig({ soloStart: true });
        config.balance.raidChance = { base: 0, perDay: 0, max: 0 };
        const game = newGame(config);
        const { state } = game;
        state.raidCount = 3;
        setFlag(state, 'raids_started');
        setFlag(state, 'first_raid_scheduled');
        state.props = { flare: 2 };
        const before = (state.candidates ?? []).length;
        const res = game.useProp('flare', T0 + MIN);
        expect(res.ok).toBe(true);
        expect((state.candidates ?? []).length - before).toBeGreaterThanOrEqual(config.balance.flare!.candidates[0]);
        expect(state.flare).toBe(true);
        // 已经放过一次，今晚过去之前不能再放
        expect(game.useProp('flare', T0 + 2 * MIN).ok).toBe(false);
        game.liveRaids = true;
        state.nextRaidAt = T0 + 3 * MIN;
        game.tick(T0 + 3 * MIN);
        expect(state.pendingRaid?.title).toContain('信号弹');
        expect(state.flare).toBe(false);
    });
});

describe('R62 出大红', () => {
    it('稀有品卖掉得到一大笔物资，商人在营地时更贵', () => {
        const game = newGame();
        const { config, state } = game;
        const def = propDef(config, 'gold_watch')!;
        expect(def.rare).toBe(true);
        const normal = treasureValue(config, state, def, T0);
        state.trader = { nextVisitAt: T0 + DAY, leavesAt: T0 + 10 * MIN, visit: 1, offers: [], refreshesLeft: 0 };
        const withTrader = treasureValue(config, state, def, T0);
        expect(withTrader.food!).toBeGreaterThan(normal.food!);
        state.props = { gold_watch: 1 };
        state.resources.parts = 0;
        expect(game.useProp('gold_watch', T0).ok).toBe(true);
        expect(state.resources.parts).toBeGreaterThan(0);
        expect(state.stats.treasures_sold).toBe(1);
    });

    it('每个稀有品至少能从一个地方掉落', () => {
        const config = loadConfig();
        const drops = [...config.locations.flatMap((l) => l.drops ?? []), ...config.districts!.districts.flatMap((d) => d.drops ?? [])];
        for (const p of config.props.filter((x) => x.rare)) expect(drops.some((d) => d.prop === p.id)).toBe(true);
    });
});

describe('R79 今日情报', () => {
    it('每天固定几条，同一天结果一样，换一天会变', () => {
        const game = newGame();
        const { config, state } = game;
        const day1 = todayIntel(config, state, T0 + MIN).map((x) => `${x.id}:${x.kind.id}`);
        expect(day1).toHaveLength(config.intel!.perDay);
        expect(todayIntel(config, state, T0 + 30 * MIN).map((x) => `${x.id}:${x.kind.id}`)).toEqual(day1);
        const days = new Set<string>();
        for (let d = 1; d <= 8; d++) days.add(todayIntel(config, state, dayStart(d) + MIN).map((x) => `${x.id}:${x.kind.id}`).join(','));
        expect(days.size).toBeGreaterThan(1);
    });

    it('有情报的分区倍率不是 1，没情报的是 1', () => {
        const game = newGame();
        const { config, state } = game;
        const intel = todayIntel(config, state, T0 + MIN);
        const hit = intel[0];
        const m = intelMods(config, state, hit.id, T0 + MIN);
        expect([m.hunt, m.fish, m.loot, m.danger].some((v) => v !== 1)).toBe(true);
        const other = config.districts!.districts.find((d) => !intel.some((x) => x.id === d.id))!;
        expect(intelMods(config, state, other.id, T0 + MIN)).toEqual({ hunt: 1, fish: 1, loot: 1, danger: 1 });
    });
});

describe('R55 伊森的日记', () => {
    it('每过一天写一篇，记下谁来了、谁走了', () => {
        const game = newGame();
        const { config, state } = game;
        game.tick(T0 + MIN);
        state.survivors.push(newSurvivorState(config, 'rosa'));
        killSurvivor(config, state, 'toby', T0 + 2 * MIN, '在外面牺牲了');
        game.tick(dayStart(2) + MIN);
        expect(state.diary).toHaveLength(1);
        const entry = state.diary![0];
        expect(entry.day).toBe(1);
        expect(entry.author).toBe('伊森');
        expect(entry.text).toContain('罗莎');
        expect(entry.text).toContain('托比');
        game.tick(dayStart(4) + MIN);
        expect(state.diary!.length).toBeGreaterThanOrEqual(2);
    });

    it('伊森不在了，由别人接着写', () => {
        const game = newGame();
        const { config, state } = game;
        game.tick(T0 + MIN);
        state.survivors = state.survivors.filter((s) => s.id !== 'ethan');
        game.tick(dayStart(2) + MIN);
        expect(state.diary![0].author).not.toBe('伊森');
        expect(state.diary![0].text).toContain('伊森不在了');
        expect(RAID).toBeGreaterThan(0);
    });
});
