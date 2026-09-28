// 配置表检查：改完 JSON 后跑 `npm test`，写错的 id、引用不存在的事件等都会被报出来。

import { Effect, GameConfig, Objective, RESOURCE_IDS, ResourceBag } from './types';
import { BattleRegistry } from './battle/registry';
import { UnitSetup } from './battle/Battle';
import { BARRICADE_UNIT, DOG_UNIT } from './combat';

export function validateConfig(config: GameConfig): string[] {
    const errors: string[] = [];
    const buildingIds = new Set(config.buildings.map((b) => b.id));
    const survivorIds = new Set(config.survivors.map((s) => s.id));
    const eventIds = new Set(config.events.map((e) => e.id));
    const resourceIds = new Set<string>(RESOURCE_IDS);

    const checkUnique = (kind: string, ids: string[]) => {
        const seen = new Set<string>();
        for (const id of ids) {
            if (seen.has(id)) errors.push(`${kind} id 重复：${id}`);
            seen.add(id);
        }
    };
    checkUnique('建筑', config.buildings.map((b) => b.id));
    checkUnique('幸存者', config.survivors.map((s) => s.id));
    checkUnique('事件', config.events.map((e) => e.id));
    checkUnique('剧集', config.episodes.map((e) => e.id));

    const checkBag = (where: string, bag: ResourceBag | undefined) => {
        for (const key of Object.keys(bag ?? {})) {
            if (!resourceIds.has(key)) errors.push(`${where}：未知资源 ${key}`);
        }
    };
    const checkSurvivor = (where: string, id: string, allowed: string[]) => {
        if (!allowed.includes(id) && !survivorIds.has(id)) errors.push(`${where}：未知幸存者 ${id}`);
    };
    const checkEvent = (where: string, id: string) => {
        if (!eventIds.has(id)) errors.push(`${where}：未知事件 ${id}`);
    };

    if (!buildingIds.has('hq')) errors.push('必须有 id 为 hq 的指挥部建筑');
    for (const id of config.balance.startingSurvivors) checkSurvivor('开局幸存者', id, []);
    checkBag('开局资源', config.balance.startingResources);
    checkBag('资源上限', config.balance.baseStorage);

    for (const b of config.buildings) {
        if (b.levels.length === 0) errors.push(`建筑 ${b.id} 没有等级数据`);
        if (b.startLevel < 0 || b.startLevel > b.levels.length) errors.push(`建筑 ${b.id} 的 startLevel 超出范围`);
        b.levels.forEach((lv, i) => {
            const where = `建筑 ${b.id} 第 ${i + 1} 级`;
            checkBag(where, lv.cost);
            checkBag(where, lv.production);
            checkBag(where, lv.storage);
            if (lv.production && !lv.workerSlots) errors.push(`${where}：有产量但没有工人岗位`);
        });
    }

    const checkEffect = (where: string, e: Effect) => {
        switch (e.type) {
            case 'resource':
                if (!resourceIds.has(e.resource)) errors.push(`${where}：未知资源 ${e.resource}`);
                break;
            case 'mood':
                if (e.target) checkSurvivor(where, e.target, ['all', 'random']);
                break;
            case 'addSurvivor':
                checkSurvivor(where, e.survivor, []);
                break;
            case 'removeSurvivor':
            case 'injure':
                checkSurvivor(where, e.survivor, ['random']);
                break;
            case 'heal':
                checkSurvivor(where, e.survivor, ['all']);
                break;
            case 'triggerEvent':
                checkEvent(where, e.event);
                break;
            case 'flag':
            case 'stat':
                break;
            case 'addWanderer':
                if (e.specialty && !config.wanderers.specialties.includes(e.specialty)) errors.push(`${where}：流浪者没有专长 ${e.specialty}`);
                break;
            case 'discoverSite':
                if (!config.sites.some((s) => s.id === e.site)) errors.push(`${where}：未知营地地点 ${e.site}`);
                break;
            default:
                errors.push(`${where}：未知效果类型 ${(e as { type: string }).type}`);
        }
    };

    for (const ev of config.events) {
        if (ev.choices.length === 0) errors.push(`事件 ${ev.id} 没有选项`);
        for (const id of ev.conditions?.hasSurvivors ?? []) checkSurvivor(`事件 ${ev.id} 条件`, id, []);
        if (ev.speaker) checkSurvivor(`事件 ${ev.id} 的 speaker`, ev.speaker, []);
        ev.choices.forEach((c, ci) => {
            const where = `事件 ${ev.id} 选项 ${ci + 1}`;
            checkBag(where, c.cost);
            if (c.outcomes.length === 0) errors.push(`${where}：没有结果`);
            for (const o of c.outcomes) for (const e of o.effects) checkEffect(where, e);
        });
    }

    const checkObjective = (where: string, o: Objective) => {
        if (o.type === 'buildingLevel' && !buildingIds.has(o.building)) errors.push(`${where}：未知建筑 ${o.building}`);
        if (o.type === 'resource' && !resourceIds.has(o.resource)) errors.push(`${where}：未知资源 ${o.resource}`);
    };
    for (const ep of config.episodes) {
        const where = `剧集 ${ep.id}`;
        if (ep.startEvent) checkEvent(where, ep.startEvent);
        if (ep.endEvent) checkEvent(where, ep.endEvent);
        checkBag(where, ep.rewards);
        for (const o of ep.objectives) checkObjective(where, o);
    }

    const battle = new BattleRegistry(config);
    errors.push(...battle.validate());
    for (const s of config.survivors) {
        if (s.battleUnit && !battle.hasUnit(s.battleUnit)) errors.push(`幸存者 ${s.id}：未知战斗角色 ${s.battleUnit}`);
    }
    if (!battle.hasUnit(BARRICADE_UNIT)) errors.push(`units.json 里必须有 id 为 ${BARRICADE_UNIT} 的路障`);
    if (!battle.hasUnit(DOG_UNIT)) errors.push(`units.json 里必须有 id 为 ${DOG_UNIT} 的狗`);
    checkBag('治疗花费', config.balance.healCost);

    const checkEnemies = (where: string, enemies: UnitSetup[]) => {
        if (enemies.length === 0) errors.push(`${where}：没有敌人`);
        for (const e of enemies) if (!battle.hasUnit(e.unit)) errors.push(`${where}：未知战斗角色 ${e.unit}`);
    };
    checkUnique('地点', config.locations.map((l) => l.id));
    checkUnique('尸潮', config.raids.map((r) => r.id));
    for (const loc of config.locations) {
        const where = `地点 ${loc.id}`;
        checkEnemies(where, loc.enemies);
        checkBag(where, loc.loot);
        if (loc.durationMinutes <= 0) errors.push(`${where}：durationMinutes 必须大于 0`);
        if (loc.firstClearEvent) checkEvent(where, loc.firstClearEvent);
        if (loc.discoversSite && !config.sites.some((s) => s.id === loc.discoversSite)) errors.push(`${where}：未知营地地点 ${loc.discoversSite}`);
        if (loc.recruitChance !== undefined && (loc.recruitChance < 0 || loc.recruitChance > 1)) errors.push(`${where}：recruitChance 要在 0～1 之间`);
        for (const id of loc.conditions?.hasSurvivors ?? []) checkSurvivor(where, id, []);
    }
    for (const raid of config.raids) {
        const where = `尸潮 ${raid.id}`;
        checkEnemies(where, raid.enemies);
        checkBag(where, raid.reward);
        for (const id of raid.conditions?.hasSurvivors ?? []) checkSurvivor(where, id, []);
    }

    errors.push(...checkStorageDeadlocks(config));

    if (config.seasons.length === 0) errors.push('seasons.json 至少要有一个季节');
    checkUnique('季节', config.seasons.map((x) => x.id));
    for (const season of config.seasons) {
        if (season.days <= 0) errors.push(`季节 ${season.id}：days 必须大于 0`);
        if (season.startEvent) checkEvent(`季节 ${season.id}`, season.startEvent);
    }

    const maxWorkshop = config.buildings.reduce((sum, b) => sum + Math.max(0, ...b.levels.map((l) => l.workshopLevel ?? 0)), 0);
    checkUnique('物品', config.items.map((x) => x.id));
    for (const item of config.items) {
        const where = `物品 ${item.id}`;
        checkBag(where, item.cost);
        if (!battle.hasSkill(item.battleSkill)) errors.push(`${where}：未知技能 ${item.battleSkill}`);
        if (item.workshopLevel > maxWorkshop) errors.push(`${where}：需要工坊 ${item.workshopLevel} 级，但工坊最高只有 ${maxWorkshop} 级`);
    }

    checkUnique('悬赏', config.bounties.map((x) => x.id));
    if (config.balance.hunterRanks.length === 0) errors.push('balance.hunterRanks 至少要有一级');
    for (const b of config.bounties) {
        const where = `悬赏 ${b.id}`;
        checkBag(where, b.reward);
        if (b.rank >= config.balance.hunterRanks.length) errors.push(`${where}：猎人等级 ${b.rank} 不存在`);
        if (b.goal.amount <= 0) errors.push(`${where}：goal.amount 必须大于 0`);
        for (const id of b.conditions?.hasSurvivors ?? []) checkSurvivor(where, id, []);
    }

    checkUnique('营地地点', config.sites.map((x) => x.id));
    if (!config.sites.some((s) => s.id === config.balance.startingSite)) errors.push(`balance.startingSite：未知营地地点 ${config.balance.startingSite}`);
    for (const site of config.sites) {
        const where = `营地地点 ${site.id}`;
        checkEnemies(where, site.journey.enemies);
        checkBag(where, site.modifiers.production);
        checkBag(where, site.modifiers.passive);
        if (site.arrivalEvent) checkEvent(where, site.arrivalEvent);
        if (site.wallRetention < 0 || site.wallRetention > 1) errors.push(`${where}：wallRetention 要在 0～1 之间`);
    }
    const w = config.wanderers;
    if (w.names.length === 0) errors.push('wanderers.json：names 不能为空');
    if (!battle.hasUnit(w.battleUnit)) errors.push(`wanderers.json：未知战斗角色 ${w.battleUnit}`);
    for (const sp of w.specialties) if (!w.titles[sp]?.length) errors.push(`wanderers.json：专长 ${sp} 没有职业名`);

    checkUnique('成就', config.achievements.map((x) => x.id));
    for (const a of config.achievements) {
        checkBag(`成就 ${a.id}`, a.reward);
        checkObjective(`成就 ${a.id}`, a.goal);
    }

    return errors;
}

/**
 * 防止“仓库存满了也不够升级”的死局：每一级升级的花费，都不能超过满足升级条件时能达到的仓库上限。
 * 只有指挥部提供仓库容量，所以按“升级时指挥部至少是几级”来算上限。
 */
function checkStorageDeadlocks(config: GameConfig): string[] {
    const errors: string[] = [];
    const hq = config.buildings.find((b) => b.id === 'hq');
    if (!hq) return errors;
    const capAtHq = (hqLevel: number, id: (typeof RESOURCE_IDS)[number]): number => {
        const base = config.balance.baseStorage[id];
        if (base === undefined) return Infinity;
        let extra = 0;
        for (const b of config.buildings) {
            // 其他建筑提供的容量不算（保守估计），只算指挥部
            if (b.id === 'hq' && hqLevel > 0) extra += b.levels[hqLevel - 1]?.storage?.[id] ?? 0;
        }
        return base + extra;
    };
    for (const b of config.buildings) {
        b.levels.forEach((lv, i) => {
            const level = i + 1;
            if (level <= b.startLevel) return;
            // 升级指挥部到 L 级时，指挥部当前是 L-1 级；其他建筑按 requiresHq（没写就按 1 级）
            const hqAt = b.id === 'hq' ? level - 1 : Math.max(1, lv.requiresHq ?? 1);
            for (const id of RESOURCE_IDS) {
                const cost = lv.cost[id] ?? 0;
                const cap = capAtHq(hqAt, id);
                if (cost > cap) errors.push(`建筑 ${b.id} 第 ${level} 级：${id} 花费 ${cost} 超过了指挥部 ${hqAt} 级时的仓库上限 ${cap}，会卡死`);
            }
        });
    }
    return errors;
}
