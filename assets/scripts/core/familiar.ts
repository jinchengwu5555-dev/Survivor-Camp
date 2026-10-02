// 熟悉的丧尸（资料库 R58）和信号弹求救（R57）。
//
// 熟悉的丧尸：死在外面的人，遗体留在了原地（墓地里记为“尸骨未归”）。过 familiarZombie.delayDays 天后，
//   每次尸潮有一定概率混在尸群里出现（头顶显示名字）。打倒它，就能把遗体带回营地安葬；
//   没打倒（尸潮冲进营地、或者撑到天亮它还站着），它会再回来。
// 信号弹：用掉后附近的幸存者循着信号来投奔（候选人），但当晚尸潮一定会来，而且更大。

import { BattleSetup, UnitSetup } from './battle/Battle';
import { changeMoodAll } from './mood';
import { nextRandom } from './rng';
import { offerCandidates } from './recruits';
import { addWanderer } from './roster';
import { addLog, addStat } from './state';
import { ActionResult, GameConfig, GameState, GraveState } from './types';

export const FAMILIAR_TAG = 'grave:';

/** 战斗单位上的标记：grave:墓地id:名字（名字写进去，回放时也能显示） */
export function familiarTag(g: GraveState): string {
    return `${FAMILIAR_TAG}${g.id}:${g.name}`;
}

export function parseFamiliarTag(tag: string | undefined): { id: string; name: string } | null {
    if (!tag || !tag.startsWith(FAMILIAR_TAG)) return null;
    const rest = tag.slice(FAMILIAR_TAG.length);
    const i = rest.indexOf(':');
    return i < 0 ? { id: rest, name: rest } : { id: rest.slice(0, i), name: rest.slice(i + 1) };
}

/** 现在可能变成行尸回来的人：尸骨未归、还没安葬、死了足够久 */
export function restlessGraves(config: GameConfig, state: GameState, now: number): GraveState[] {
    const cfg = config.balance.familiarZombie;
    if (!cfg) return [];
    const dayMs = config.balance.dayLengthMinutes * 60_000;
    return (state.graveyard ?? []).filter((g) => g.lost && !g.returned && now - g.diedAt >= cfg.delayDays * dayMs);
}

/** 准备尸潮时：掷骰子决定有没有熟人混在尸群里，有的话加进敌人列表；返回墓地 id */
export function addFamiliar(config: GameConfig, state: GameState, setup: BattleSetup, enemyLevel: number, at: number): string | undefined {
    const cfg = config.balance.familiarZombie;
    const pool = restlessGraves(config, state, at);
    if (!cfg || pool.length === 0 || nextRandom(state) >= cfg.chance) return undefined;
    const g = pool[Math.floor(nextRandom(state) * pool.length)];
    const unit: UnitSetup = { unit: cfg.unit, level: enemyLevel, spawnAt: cfg.spawnAt, hpMult: cfg.hpMult, atkMult: cfg.atkMult, tag: familiarTag(g) };
    setup.enemies = [...setup.enemies, unit];
    g.sightings = (g.sightings ?? 0) + 1;
    addStat(state, 'familiar_seen');
    return g.id;
}

/** 尸潮结束：熟人倒下了就把遗体带回来安葬 */
export function settleFamiliar(config: GameConfig, state: GameState, graveId: string | undefined, laidDown: boolean, at: number): string {
    const g = (state.graveyard ?? []).find((x) => x.id === graveId);
    if (!g) return '';
    if (!laidDown) {
        changeMoodAll(state, -4, `看到${g.name}变成了行尸`, at);
        addLog(state, at, `🧟 尸群里有一个熟悉的身影——是${g.name}。天亮时它消失在了街角，它还会回来的。`);
        return `尸群里有${g.name}的身影，它又走了。`;
    }
    g.returned = true;
    changeMoodAll(state, -4, `看到${g.name}变成了行尸`, at);
    changeMoodAll(state, 6, `终于让${g.name}入土为安`, at);
    addStat(state, 'familiar_laid_to_rest');
    addLog(state, at, `🪦 尸群里有一个熟悉的身影——是${g.name}。大家认出了那件外套，把${g.name}带回了营地，在墓地里好好安葬了。`);
    return `🪦 大家认出了变成行尸的${g.name}，终于把${g.name}带回来安葬了。`;
}

// ---------- 信号弹 ----------

export function flareBlocker(config: GameConfig, state: GameState): string | null {
    if (!config.balance.flare) return '没有信号弹的配置';
    if (state.flare) return '已经放过信号弹了，等今晚过去';
    return null;
}

/** 放信号弹：招来几个人，今晚的尸潮一定会来而且更大 */
export function fireFlare(config: GameConfig, state: GameState, now: number): ActionResult {
    const blocker = flareBlocker(config, state);
    if (blocker) return { ok: false, reason: blocker };
    const [lo, hi] = config.balance.flare!.candidates;
    state.flare = true;
    addStat(state, 'flares_fired');
    addLog(state, now, '🎆 一颗信号弹划破了天空。远处有人看见了——别的东西也看见了。');
    const count = lo + Math.floor(nextRandom(state) * (hi - lo + 1));
    // 没有招募配置（老配置）：直接来几个流浪者
    const met = config.recruits ? offerCandidates(config, state, count, '营地外', now).length : Array.from({ length: count }, () => addWanderer(config, state, now)).filter(Boolean).length;
    return { ok: true, message: `${met} 个人循着信号弹来了，今晚的尸潮会更大` };
}
