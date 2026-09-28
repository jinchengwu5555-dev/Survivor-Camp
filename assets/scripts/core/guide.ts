// 新手引导：根据当前剧情目标，算出“下一步该做什么”，界面把对应的按钮高亮。
// 不需要单独写引导脚本：剧情目标改了，引导跟着变。

import { upgradeBlocker } from './buildings';
import { getBuildingDef } from './economy';
import { getLocation } from './combat';
import { currentDay } from './state';
import { currentEpisode, objectiveDone } from './story';
import { GameConfig, GameState, Objective } from './types';

export type GuideTab = 'camp' | 'survivors' | 'explore';

export interface GuideHint {
    text: string;
    /** 要高亮的按钮：upgrade:<建筑>、speedup:<建筑>、explore:<地点>、assign；没有就只显示文字 */
    target?: string;
    /** 按钮在哪个页签 */
    tab?: GuideTab;
}

/** 前几天都显示引导，之后只在有剧情目标时显示 */
const NEWBIE_DAYS = 3;

export function nextHint(config: GameConfig, state: GameState, now: number): GuideHint | null {
    if (state.gameOver || state.eventQueue.length > 0 || state.pendingRaid) return null;
    const newbie = currentDay(config, state, now) <= NEWBIE_DAYS;
    if (newbie && !state.survivors.some((s) => s.assignment)) {
        return { text: '去「幸存者」页点“一键安排工作”——有人干活才有饭吃', target: 'assign', tab: 'survivors' };
    }
    const ep = currentEpisode(config, state);
    const obj = ep?.objectives.find((o) => !objectiveDone(config, state, o, now));
    if (obj) return objectiveHint(config, state, obj);
    if (state.flags.includes('raids_started') && state.raidCount === 0) {
        return { text: '尸潮就要来了！守夜时点角色的技能按钮，栅栏快撑不住时花木材修补' };
    }
    return null;
}

function objectiveHint(config: GameConfig, state: GameState, obj: Objective): GuideHint {
    if (obj.type === 'buildingLevel') return upgradeHint(config, state, obj.building, obj.level);
    if (obj.type === 'flag' && obj.flag.startsWith('cleared_')) {
        const loc = getLocation(config, obj.flag.slice('cleared_'.length));
        if (loc) {
            if (state.expeditions.some((e) => e.location === loc.id)) return { text: `小队正在前往${loc.name}，等他们回来` };
            return { text: `去「探索」页，派小队搜刮${loc.name}`, target: `explore:${loc.id}`, tab: 'explore' };
        }
    }
    return { text: obj.text };
}

function upgradeHint(config: GameConfig, state: GameState, buildingId: string, level: number, depth = 0): GuideHint {
    const name = getBuildingDef(config, buildingId)?.name ?? buildingId;
    const b = state.buildings[buildingId];
    if (b?.upgradeEndsAt !== null && b?.upgradeEndsAt !== undefined) {
        return { text: `${name}正在升级，稍等一下（也可以看广告加速）`, target: `speedup:${buildingId}`, tab: 'camp' };
    }
    const blocker = upgradeBlocker(config, state, buildingId);
    const hq = blocker?.match(/需要指挥部 (\d+) 级/);
    if (hq && depth === 0) return upgradeHint(config, state, 'hq', Number(hq[1]), 1);
    if (blocker === '建造队列已满') {
        const busy = Object.values(state.buildings).find((x) => x.upgradeEndsAt !== null);
        const busyName = busy ? getBuildingDef(config, busy.id)?.name ?? busy.id : '';
        return { text: `等${busyName}升级完，再升级${name}`, target: busy ? `speedup:${busy.id}` : undefined, tab: 'camp' };
    }
    if (blocker === '资源不足') {
        return { text: `把${name}升到 ${level} 级——资源还不够，让大家多干活，或者去探索搜刮`, target: `upgrade:${buildingId}`, tab: 'camp' };
    }
    return { text: `点「升级」，把${name}升到 ${level} 级`, target: `upgrade:${buildingId}`, tab: 'camp' };
}
