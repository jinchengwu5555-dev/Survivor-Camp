// 配置表检查：改完 JSON 后跑 `npm test`，写错的 id、引用不存在的事件等都会被报出来。

import { Effect, GameConfig, GEAR_SLOTS, Objective, PropDrop, RESOURCE_IDS, ResourceBag } from './types';
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
    const propIds = new Set((config.props ?? []).map((p) => p.id));
    const checkProp = (where: string, id: string) => {
        if (!propIds.has(id)) errors.push(`${where}：未知道具 ${id}`);
    };
    const checkDrops = (where: string, drops: PropDrop[] | undefined) => {
        for (const d of drops ?? []) {
            checkProp(where, d.prop);
            if (d.chance !== undefined && (d.chance < 0 || d.chance > 1)) errors.push(`${where}：道具 ${d.prop} 的 chance 要在 0～1 之间`);
        }
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
        (b.stages ?? []).forEach((st, i, all) => {
            if (i === 0 && st.level !== 1) errors.push(`建筑 ${b.id} 的第一个阶段要从 1 级开始`);
            if (i > 0 && st.level <= all[i - 1].level) errors.push(`建筑 ${b.id} 的阶段等级要从小到大`);
        });
        b.levels.forEach((lv, i) => {
            const where = `建筑 ${b.id} 第 ${i + 1} 级`;
            checkBag(where, lv.cost);
            checkBag(where, lv.production);
            checkBag(where, lv.storage);
            if (lv.production && !lv.workerSlots) errors.push(`${where}：有产量但没有工人岗位`);
        });
    }

    const checkAnimal = (where: string, id: string) => {
        if (!config.farming?.animals.some((a) => a.id === id)) errors.push(`${where}：未知牲口 ${id}`);
    };

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
            case 'fall':
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
            case 'prop':
                checkProp(where, e.prop);
                break;
            case 'discoverSite':
                if (!config.sites.some((s) => s.id === e.site)) errors.push(`${where}：未知营地地点 ${e.site}`);
                break;
            case 'livestock':
                checkAnimal(where, e.animal);
                if (!e.amount) errors.push(`${where}：livestock 的 amount 不能是 0`);
                break;
            default:
                errors.push(`${where}：未知效果类型 ${(e as { type: string }).type}`);
        }
    };

    for (const ev of config.events) {
        if (ev.choices.length === 0) errors.push(`事件 ${ev.id} 没有选项`);
        for (const id of ev.conditions?.hasSurvivors ?? []) checkSurvivor(`事件 ${ev.id} 条件`, id, []);
        for (const id of Object.keys(ev.conditions?.minBuilding ?? {})) if (!config.buildings.some((b) => b.id === id)) errors.push(`事件 ${ev.id} 条件：未知建筑 ${id}`);
        for (const id of ev.conditions?.hasAnimals ?? []) checkAnimal(`事件 ${ev.id} 条件`, id);
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
    if (!battle.hasUnit(BARRICADE_UNIT)) errors.push(`units.json 里必须有 id 为 ${BARRICADE_UNIT} 的栅栏`);
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
        checkDrops(where, loc.drops);
        if (loc.firstClearEvent) checkEvent(where, loc.firstClearEvent);
        if (loc.discoversSite && !config.sites.some((s) => s.id === loc.discoversSite)) errors.push(`${where}：未知营地地点 ${loc.discoversSite}`);
        if (loc.recruitChance !== undefined && (loc.recruitChance < 0 || loc.recruitChance > 1)) errors.push(`${where}：recruitChance 要在 0～1 之间`);
        for (const id of loc.conditions?.hasSurvivors ?? []) checkSurvivor(where, id, []);
    }
    for (const raid of config.raids) {
        const where = `尸潮 ${raid.id}`;
        checkEnemies(where, raid.enemies);
        checkBag(where, raid.reward);
        checkDrops(where, raid.drops);
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
        else if (item.trap && battle.skill(item.battleSkill).trigger.type !== 'enemyNear') errors.push(`${where}：陷阱的技能要用 enemyNear 触发`);
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

    checkUnique('拾荒物', config.pickups.kinds.map((x) => x.id));
    if (config.pickups.intervalMinutes <= 0) errors.push('pickups.json：intervalMinutes 必须大于 0');
    for (const k of config.pickups.kinds) {
        checkBag(`拾荒物 ${k.id}`, k.reward);
        checkDrops(`拾荒物 ${k.id}`, k.drops);
        if (k.weight <= 0) errors.push(`拾荒物 ${k.id}：weight 必须大于 0`);
    }
    checkUnique('商人交易', config.trader.offers.map((x) => x.id));
    for (const o of config.trader.offers) {
        checkBag(`商人交易 ${o.id}`, o.give);
        checkBag(`商人交易 ${o.id}`, o.get);
        for (const id of Object.keys(o.getProps ?? {})) checkProp(`商人交易 ${o.id}`, id);
        if (o.weight <= 0) errors.push(`商人交易 ${o.id}：weight 必须大于 0`);
    }
    if (config.trader.offersPerVisit > config.trader.offers.length) errors.push('trader.json：offersPerVisit 不能多于交易种类');
    checkUnique('每日目标', config.daily.tasks.map((x) => x.id));
    checkBag('每日宝箱', config.daily.chest);
    checkDrops('每日宝箱', config.daily.chestProps);
    for (const t of config.daily.tasks) {
        const where = `每日目标 ${t.id}`;
        checkBag(where, t.reward);
        if (t.amount <= 0) errors.push(`${where}：amount 必须大于 0`);
        if (t.requiresBuilding && !buildingIds.has(t.requiresBuilding)) errors.push(`${where}：未知建筑 ${t.requiresBuilding}`);
        for (const id of t.conditions?.hasSurvivors ?? []) checkSurvivor(where, id, []);
    }

    checkUnique('天赋', config.talents.map((x) => x.id));
    const talentIds = new Set(config.talents.map((t) => t.id));
    for (const s of config.survivors) for (const t of s.talents ?? []) if (!talentIds.has(t)) errors.push(`幸存者 ${s.id}：未知天赋 ${t}`);
    for (const t of config.talents) {
        if (t.effects.work?.building && !buildingIds.has(t.effects.work.building)) errors.push(`天赋 ${t.id}：未知建筑 ${t.effects.work.building}`);
    }
    if (!config.talents.some((t) => t.wanderer !== false)) errors.push('talents.json：至少要有一个流浪者能抽到的天赋');

    checkUnique('侦察点', config.scouting.kinds.map((x) => x.id));
    for (const k of config.scouting.kinds) {
        const where = `侦察点 ${k.id}`;
        checkBag(where, k.reward);
        checkDrops(where, k.drops);
        if (k.event) checkEvent(where, k.event);
        if (k.travelMinutes <= 0) errors.push(`${where}：travelMinutes 必须大于 0`);
        if (k.weight <= 0) errors.push(`${where}：weight 必须大于 0`);
    }
    for (const loc of config.locations) if (!loc.map) errors.push(`地点 ${loc.id}：没有写镇地图坐标 map`);

    const districtList = config.districts?.districts ?? [];
    checkUnique('分区', districtList.map((d) => d.id));
    for (const d of districtList) {
        const where = `分区 ${d.id}`;
        checkBag(where, d.loot);
        checkDrops(where, d.drops);
        checkBag(where, d.complete?.resources);
        for (const id of Object.keys(d.complete?.props ?? {})) checkProp(where, id);
        if (d.rect.x2 <= d.rect.x1 || d.rect.y2 <= d.rect.y1) errors.push(`${where}：rect 范围不对`);
        if (d.surveyMinutes <= 0) errors.push(`${where}：surveyMinutes 必须大于 0`);
    }
    const vehicleList = config.vehicles ?? [];
    checkUnique('交通工具', vehicleList.map((v) => v.id));
    for (const v of vehicleList) {
        const where = `交通工具 ${v.id}`;
        if (v.grid[0] < 1 || v.grid[1] < 1) errors.push(`${where}：grid 至少 1×1`);
        if (v.speed <= 0) errors.push(`${where}：speed 必须大于 0`);
        if (v.obtain) checkBag(where, v.obtain.cost);
        if (v.comesWith) checkSurvivor(where, v.comesWith, []);
        if (!v.startOwned && !v.obtain && !v.comesWith) errors.push(`${where}：没有办法得到（startOwned / obtain / comesWith）`);
    }
    if (districtList.length && !vehicleList.length && districtList.some((d) => d.tier > 0)) errors.push('有远的分区但没有交通工具');
    for (const tier of new Set(districtList.map((d) => d.tier))) {
        if (tier > 0 && !vehicleList.some((v) => v.tier >= tier)) errors.push(`分区等级 ${tier} 没有交通工具能到`);
    }
    const grounds = config.hunting?.grounds ?? [];
    checkUnique('狩猎场', grounds.map((g) => g.id));
    for (const ground of grounds) {
        const where = `狩猎场 ${ground.id}`;
        if (!ground.game.length) errors.push(`${where}：没有猎物`);
        if (ground.tier > 0 && !vehicleList.some((v) => v.tier >= ground.tier)) errors.push(`${where}：没有交通工具能到`);
        for (const g of ground.game) {
            if (g.weight <= 0 || g.food <= 0) errors.push(`${where} 猎物 ${g.id}：weight、food 必须大于 0`);
            if (g.kind !== 'hunt' && g.kind !== 'fish') errors.push(`${where} 猎物 ${g.id}：kind 只能是 hunt / fish`);
            for (const se of g.seasons ?? []) if (!config.seasons.some((x) => x.id === se)) errors.push(`${where} 猎物 ${g.id}：未知季节 ${se}`);
            if (g.capture) {
                checkAnimal(`${where} 猎物 ${g.id}`, g.capture.animal);
                if (g.capture.chance <= 0 || g.capture.chance > 1) errors.push(`${where} 猎物 ${g.id}：capture.chance 要在 0～1 之间`);
            }
        }
    }
    // 探索背包：每件道具至少要能放进某一块格子区（两只手、某种包、某辆车的后备箱）
    const areas: [number, number][] = [config.packing?.handsGrid ?? [2, 2], ...vehicleList.map((v) => v.grid)];
    for (const p of config.props) for (const sec of p.bag?.sections ?? []) areas.push(sec);
    const fits = ([w, h]: [number, number]) => areas.some(([aw, ah]) => (w <= aw && h <= ah) || (h <= aw && w <= ah));
    for (const p of config.props) {
        const size = p.size ?? [1, 1];
        if (!fits(size)) errors.push(`道具 ${p.id}：${size[0]}×${size[1]} 放不进任何背包格子`);
    }
    for (const [res, b] of Object.entries(config.packing?.bundles ?? {})) if (!fits(b.size)) errors.push(`资源包 ${res}：放不进任何背包格子`);

    if (config.recruits) {
        const r = config.recruits;
        for (const id of Object.keys(r.intros)) checkSurvivor('招募介绍', id, []);
        checkUnique('特质', r.quirks.map((q) => q.id));
        for (const q of r.quirks) {
            const where = `特质 ${q.id}`;
            checkBag(where, q.onJoin?.resources);
            for (const id of Object.keys(q.onJoin?.props ?? {})) checkProp(where, id);
            checkBag(where, q.nightly?.resources);
        }
        if (!r.quirks.some((q) => q.good) || !r.quirks.some((q) => !q.good)) errors.push('recruits.json：好特质和坏特质都至少要有一个');
        if (r.firstCount[0] < 1 || r.firstCount[1] < r.firstCount[0]) errors.push('recruits.json：firstCount 写错了');
    }

    const dialogues = config.chatter?.dialogues ?? [];
    checkUnique('闲聊', dialogues.map((d) => d.id));
    for (const d of dialogues) {
        const where = `闲聊 ${d.id}`;
        if (d.who.length < 1) errors.push(`${where}：至少要有一个说话的人`);
        for (const id of d.who) if (id !== 'any') checkSurvivor(where, id, []);
        for (const id of d.conditions?.hasSurvivors ?? []) checkSurvivor(where, id, []);
        if (!['chat', 'gossip', 'joke', 'warm', 'worry', 'quarrel'].includes(d.kind)) errors.push(`${where}：未知类型 ${d.kind}`);
        if (d.lines.length === 0) errors.push(`${where}：没有台词`);
        for (const [i] of d.lines) if (i < 0 || i >= d.who.length) errors.push(`${where}：说话人序号 ${i} 超出 who 的范围`);
        const usesX = d.lines.some(([, text]) => text.includes('{x}'));
        if (usesX && !d.about) errors.push(`${where}：台词里有 {x} 但没写 about`);
    }

    checkUnique('道具', config.props.map((x) => x.id));
    for (const id of Object.keys(config.balance.startingProps ?? {})) checkProp('开局道具', id);
    for (const p of config.props) {
        const where = `道具 ${p.id}`;
        if (!['resource', 'speedup', 'recall', 'mood', 'heal', 'recruit', 'chest', 'gear', 'seed', 'animal', 'flare', 'treasure'].includes(p.type)) errors.push(`${where}：未知类型 ${p.type}`);
        if (p.type === 'seed' && !config.farming?.crops.some((c) => c.id === p.crop && c.seed === p.id)) errors.push(`${where}：种子要写 crop，并且那种作物的 seed 要指回这个道具`);
        if (p.type === 'animal') {
            checkAnimal(where, p.animal ?? '');
            if (!(p.amount && p.amount > 0)) errors.push(`${where}：牲口道具要写 amount`);
        }
        if (p.type === 'gear') {
            if (!p.slot || !GEAR_SLOTS.includes(p.slot)) errors.push(`${where}：装备要写 slot（weapon / armor / tool / bag）`);
            const g = p.gear;
            if (p.slot === 'bag') {
                if (!p.bag?.sections.length) errors.push(`${where}：背包要写 bag.sections`);
            } else if (!g || !(g.atk || g.hp || g.work || g.scout)) errors.push(`${where}：装备要写 gear 属性`);
            if (g?.work?.building && !config.buildings.some((b) => b.id === g.work!.building)) errors.push(`${where}：未知建筑 ${g.work.building}`);
            if (p.craft) checkBag(where, p.craft.cost);
        }
        checkBag(where, p.reward);
        if ((p.type === 'resource' || p.type === 'treasure') && !p.reward) errors.push(`${where}：资源箱、稀有品要写 reward`);
        if (p.type === 'speedup' && !(p.minutes && p.minutes > 0)) errors.push(`${where}：加速道具要写 minutes`);
        if (p.type === 'mood' && !p.amount) errors.push(`${where}：士气道具要写 amount`);
        if (p.type === 'chest') {
            if (!p.contents?.length) errors.push(`${where}：宝箱要写 contents`);
            for (const c of p.contents ?? []) {
                if (c.prop) checkProp(where, c.prop);
                checkBag(where, c.resources);
                if (!c.prop && !c.resources) errors.push(`${where}：contents 每一项要有 prop 或 resources`);
            }
        }
    }

    const fz = config.balance.familiarZombie;
    if (fz) {
        if (!config.units?.some((u) => u.id === fz.unit)) errors.push(`balance.familiarZombie：未知战斗单位 ${fz.unit}`);
        if (fz.chance < 0 || fz.chance > 1) errors.push('balance.familiarZombie：chance 要在 0～1 之间');
    }
    if (config.unlocks) {
        checkUnique('新功能解锁', config.unlocks.features.map((f) => f.id));
        for (const f of config.unlocks.features) {
            if (f.any.length === 0) errors.push(`新功能 ${f.id}：any 里至少要有一个条件（不然永远解锁不了）`);
            for (const c of f.any) {
                for (const id of Object.keys(c.minBuilding ?? {})) if (!config.buildings.some((b) => b.id === id)) errors.push(`新功能 ${f.id} 条件：未知建筑 ${id}`);
            }
        }
    }
    if (config.intel) {
        checkUnique('情报', config.intel.kinds.map((k) => k.id));
        for (const k of config.intel.kinds) {
            if (!k.text.includes('{d}')) errors.push(`情报 ${k.id}：text 里要有 {d}（分区名）`);
            for (const v of [k.hunt, k.fish, k.loot, k.danger]) if (v !== undefined && v <= 0) errors.push(`情报 ${k.id}：倍率必须大于 0`);
        }
    }
    if (config.diary) {
        const d = config.diary;
        if (!d.openers.length || !d.closers.length || !d.quiet.length) errors.push('diary.json：openers、closers、quiet 都不能为空');
        for (const se of Object.keys(d.seasons)) if (!config.seasons.some((x) => x.id === se)) errors.push(`diary.json：未知季节 ${se}`);
        for (const st of d.stats) if (!st.lines.length) errors.push(`diary.json：${st.stat} 没有句子`);
    }
    const fl = config.balance.flare;
    if (fl && (fl.candidates[0] < 1 || fl.candidates[1] < fl.candidates[0])) errors.push('balance.flare：candidates 写错了');

    if (config.farming) {
        const f = config.farming;
        checkUnique('作物', f.crops.map((c) => c.id));
        checkUnique('牲口', f.animals.map((a) => a.id));
        for (const c of f.crops) {
            const where = `作物 ${c.id}`;
            checkProp(where, c.seed);
            checkBag(where, c.yield);
            if (c.minutes <= 0) errors.push(`${where}：minutes 必须大于 0`);
            if (c.seedsBack[0] < 0 || c.seedsBack[1] < c.seedsBack[0]) errors.push(`${where}：seedsBack 写错了`);
            // 平均拿回的种子至少 1 颗，不然种子会越种越少
            if ((c.seedsBack[0] + c.seedsBack[1]) / 2 < 1) errors.push(`${where}：平均拿回的种子少于 1 颗，会种绝`);
            for (const se of c.seasons ?? []) if (!config.seasons.some((x) => x.id === se)) errors.push(`${where}：未知季节 ${se}`);
        }
        for (const a of f.animals) {
            const where = `牲口 ${a.id}`;
            if (a.feed <= 0 || a.meat <= 0) errors.push(`${where}：feed、meat 必须大于 0`);
            if (a.breed < 0 || a.breed > 1) errors.push(`${where}：breed 要在 0～1 之间`);
            if (a.litter[0] < 1 || a.litter[1] < a.litter[0]) errors.push(`${where}：litter 写错了`);
            const home = a.space ?? 'pen';
            if (home !== 'pen' && home !== 'pond') errors.push(`${where}：space 只能是 pen / pond`);
            const building = config.buildings.find((b) => b.id === home);
            if (!building) errors.push(`${where}：没有 ${home} 建筑`);
            else if ((a.minLevel ?? 1) > (building.scaling?.maxLevel ?? building.levels.length)) errors.push(`${where}：minLevel 超过了 ${home} 的最高等级`);
        }
        for (const id of Object.keys(f.starterSeeds)) checkProp('开局种子', id);
        for (const se of Object.keys(f.seasonGrowth)) if (!config.seasons.some((x) => x.id === se)) errors.push(`farming.json：未知季节 ${se}`);
        if (!config.buildings.some((b) => b.id === 'garden') || !config.buildings.some((b) => b.id === 'pen')) errors.push('farming.json 需要 garden（菜园）和 pen（畜栏）两个建筑');
    }

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
