// 配置表检查：改完 JSON 后跑 `npm test`，写错的 id、引用不存在的事件等都会被报出来。

import { Effect, GameConfig, RESOURCE_IDS, ResourceBag } from './types';

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
                break;
            default:
                errors.push(`${where}：未知效果类型 ${(e as { type: string }).type}`);
        }
    };

    for (const ev of config.events) {
        if (ev.choices.length === 0) errors.push(`事件 ${ev.id} 没有选项`);
        for (const id of ev.conditions?.hasSurvivors ?? []) checkSurvivor(`事件 ${ev.id} 条件`, id, []);
        ev.choices.forEach((c, ci) => {
            const where = `事件 ${ev.id} 选项 ${ci + 1}`;
            checkBag(where, c.cost);
            if (c.outcomes.length === 0) errors.push(`${where}：没有结果`);
            for (const o of c.outcomes) for (const e of o.effects) checkEffect(where, e);
        });
    }

    for (const ep of config.episodes) {
        const where = `剧集 ${ep.id}`;
        if (ep.startEvent) checkEvent(where, ep.startEvent);
        if (ep.endEvent) checkEvent(where, ep.endEvent);
        checkBag(where, ep.rewards);
        for (const o of ep.objectives) {
            if (o.type === 'buildingLevel' && !buildingIds.has(o.building)) errors.push(`${where}：未知建筑 ${o.building}`);
            if (o.type === 'resource' && !resourceIds.has(o.resource)) errors.push(`${where}：未知资源 ${o.resource}`);
        }
    }

    return errors;
}
