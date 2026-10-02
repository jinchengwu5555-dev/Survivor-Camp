// 打猎和钓鱼：派 1～3 个人去某个区，过一阵带回猎物（食物）。
// 每个区适合打的东西不一样（districts.json 的 hunting）：公园有野兔野鸭，河边能钓鱼，水库有鹿和野猪……
// 季节有影响（冬天难打），也有危险（野猪、野狗会伤人）。
// 每个猎人试 triesPerHunter 次，每次成功率 = baseChance × 猎人本事 × 季节。
//   猎人本事：战士、拾荒者 +15%；拿远程武器 +15%（猎弓这种射程 5 的 +25%）；神枪手天赋 +10%
//   钓鱼看耐心：农夫 +20%，不看武器
// 有的猎物（走失的鸡、野兔、山羊……）在畜栏有空位时有机会活捉回去养（capture）。

import { addResource, hqLevel } from './economy';
import { gearOf } from './gear';
import { districtDef, surveyCandidates } from './districts';
import { addAnimals, animalDef, penSpace } from './farming';
import { intelMods } from './intel';
import { districtName } from './names';
import { nextRandom, pickWeighted } from './rng';
import { injureSurvivor, survivorInfo, survivorName } from './roster';
import { seasonAt } from './seasons';
import { addLog, addStat } from './state';
import { talentsOf } from './talents';
import { ActionResult, DistrictDef, GameAnimalDef, GameConfig, GameState } from './types';
import { pickVehicle, useVehicle } from './vehicles';

export function isHunting(state: GameState, id: string): boolean {
    return (state.hunts ?? []).some((h) => h.squad.includes(id));
}

/** 猎人的本事（1 = 普通人） */
export function hunterSkill(config: GameConfig, state: GameState, id: string, kind: 'hunt' | 'fish'): number {
    const spec = survivorInfo(config, state, id)?.specialty;
    let skill = 1;
    if (kind === 'fish') {
        if (spec === 'farmer') skill += 0.2;
        return skill;
    }
    if (spec === 'fighter' || spec === 'scavenger') skill += 0.15;
    const range = gearOf(config, state, id).reduce((m, d) => Math.max(m, d.gear?.range ?? 0), 0);
    if (range >= 5) skill += 0.25;
    else if (range >= 3) skill += 0.15;
    if (talentsOf(config, state, id).some((t) => t.id === 'marksman')) skill += 0.1;
    return skill;
}

/** 这个季节这个区能打到的东西 */
export function huntableGame(config: GameConfig, state: GameState, d: DistrictDef, now: number): GameAnimalDef[] {
    const season = seasonAt(config, state, now).season.id;
    return (d.hunting?.game ?? []).filter((g) => !g.seasons || g.seasons.includes(season));
}

export function huntBlocker(config: GameConfig, state: GameState, districtId: string, hunters: string[], now: number, vehicle?: string): string | null {
    const d = districtDef(config, districtId);
    if (!d?.hunting || huntableGame(config, state, d, now).length === 0) return '这里打不到什么';
    if ((state.hunts ?? []).some((h) => h.district === districtId)) return '已经有人在这里打猎了';
    if (hunters.length === 0) return '没有能派出去的人';
    if (hunters.length > 3) return '打猎最多去 3 个人';
    const pool = surveyCandidates(state);
    if (!hunters.every((id) => pool.includes(id))) return '有人受伤了或者已经在外面';
    return pickVehicle(config, state, d.tier, vehicle).blocker ?? null;
}

export function startHunt(config: GameConfig, state: GameState, districtId: string, hunters: string[], now: number, vehicle?: string): ActionResult {
    const blocker = huntBlocker(config, state, districtId, hunters, now, vehicle);
    if (blocker) return { ok: false, reason: blocker };
    const d = districtDef(config, districtId)!;
    const v = pickVehicle(config, state, d.tier, vehicle).vehicle;
    useVehicle(state, v);
    for (const s of state.survivors) if (hunters.includes(s.id)) s.assignment = null;
    const minutes = config.districts?.hunt?.minutes ?? 6;
    state.hunts = [...(state.hunts ?? []), { id: state.nextId++, district: d.id, squad: [...hunters], vehicle: v?.id, startedAt: now, returnsAt: now + minutes * (v?.speed ?? 1) * 60_000 }];
    addLog(state, now, `🏹 ${hunters.map((id) => survivorName(config, state, id)).join('、')}去${d.icon}${districtName(state, d)}打猎了。`);
    return { ok: true };
}

/** 默认派谁去打猎：闲着的人里本事最好的两个 */
export function suggestHunters(config: GameConfig, state: GameState, size = 2): string[] {
    const pool = surveyCandidates(state);
    const idle = pool.filter((id) => !state.survivors.find((s) => s.id === id)?.assignment);
    const busy = pool.filter((id) => !idle.includes(id));
    const bySkill = (a: string, b: string) => hunterSkill(config, state, b, 'hunt') - hunterSkill(config, state, a, 'hunt');
    return [...idle.sort(bySkill), ...busy.sort(bySkill)].slice(0, size);
}

export function resolveHunts(config: GameConfig, state: GameState, now: number): void {
    const due = (state.hunts ?? []).filter((h) => h.returnsAt <= now);
    if (due.length === 0) return;
    state.hunts = (state.hunts ?? []).filter((h) => h.returnsAt > now);
    const cfg = config.districts?.hunt ?? { minutes: 6, triesPerHunter: 2, baseChance: 0.4, seasonChance: {} };
    const growth = Math.pow(config.balance.expeditionScaling.lootGrowth, (hqLevel(state) - 1) / 2);
    for (const h of due) {
        const d = districtDef(config, h.district);
        const hunters = h.squad.filter((id) => state.survivors.some((s) => s.id === id));
        if (!d || hunters.length === 0) continue;
        const at = h.returnsAt;
        const game = huntableGame(config, state, d, at);
        const season = cfg.seasonChance[seasonAt(config, state, at).season.id] ?? 1;
        // 今日情报按出发那天算
        const intel = intelMods(config, state, d.id, h.startedAt);
        const caught: Record<string, number> = {};
        let food = 0;
        const hurt: string[] = [];
        const captured: string[] = [];
        for (const id of hunters) {
            for (let i = 0; i < cfg.triesPerHunter; i++) {
                const animal = pickWeighted(state, game);
                if (!animal) continue;
                const tip = animal.kind === 'fish' ? intel.fish : intel.hunt;
                if (nextRandom(state) >= cfg.baseChance * hunterSkill(config, state, id, animal.kind) * season * tip) continue;
                // 畜栏有空位：有机会活捉回去养
                if (animal.capture && penSpace(config, state) > 0 && nextRandom(state) < animal.capture.chance) {
                    const n = addAnimals(config, state, animal.capture.animal, 1, at);
                    if (n > 0) {
                        const kept = animalDef(config, animal.capture.animal);
                        captured.push(`${kept?.icon ?? animal.icon}${kept?.name ?? animal.name}`);
                        addStat(state, 'animals_captured');
                        continue;
                    }
                }
                caught[animal.id] = (caught[animal.id] ?? 0) + 1;
                food += Math.round(animal.food * growth);
                addStat(state, `game_${animal.id}`);
                const s = state.survivors.find((x) => x.id === id);
                if (s && !s.injured && nextRandom(state) < animal.risk * intel.danger) {
                    injureSurvivor(config, state, s, at);
                    hurt.push(`${survivorName(config, state, id)}被${animal.name}弄伤了`);
                }
            }
        }
        addResource(config, state, 'food', food);
        addStat(state, 'hunts_done');
        const list = Object.entries(caught).map(([id, n]) => {
            const g = game.find((x) => x.id === id)!;
            return `${g.icon}${g.name}${n > 1 ? `×${n}` : ''}`;
        });
        addLog(state, at, `🏹 去${d.icon}${districtName(state, d)}打猎的人回来了：${list.length ? `打到了${list.join('、')}，带回 🍞${food}。` : captured.length ? '' : '空手而归。'}${captured.length ? `活捉了${captured.join('、')}，关进了畜栏！` : ''}${hurt.length ? `${hurt.join('，')}。` : ''}`);
    }
}

