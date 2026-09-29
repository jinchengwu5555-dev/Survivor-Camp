// 营地数值总览：把营地的每个数值整理成几组，界面的“📊 数值”面板直接显示。

import { barricadeHp, currentRaid, nextRaidIsBloodMoon } from './combat';
import { bedCount, economyRates, hqLevel, morale, moraleMultiplier, safety, storageCap, survivorBattleLevel } from './economy';
import { seasonAt } from './seasons';
import { currentDay } from './state';
import { exploredRatio } from './townMap';
import { GameConfig, GameState, RESOURCE_IDS } from './types';
import { planWatch, raidChanceTonight, watchersNeeded } from './watch';
import { workshopLevel } from './crafting';

export interface StatGroup {
    title: string;
    rows: { label: string; value: string; warn?: boolean }[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)}`;

export function campStats(config: GameConfig, state: GameState, now: number): StatGroup[] {
    const { season, dayInSeason } = seasonAt(config, state, now);
    const injured = state.survivors.filter((s) => s.injured).length;
    const out = state.expeditions.reduce((n, e) => n + e.squad.length, 0) + (state.scouts ?? []).length;
    const idle = state.survivors.filter((s) => !s.assignment && !s.injured).length;
    const rates = economyRates(config, state, now).net;
    const perDay = config.balance.dayLengthMinutes;
    const sleepAvg = state.survivors.length ? state.survivors.reduce((n, s) => n + (s.sleep ?? 100), 0) / state.survivors.length : 0;
    const tired = state.survivors.filter((s) => (s.sleep ?? 100) < (config.balance.nightWatch?.tiredBelow ?? 0)).length;
    const watchers = planWatch(config, state);
    const needed = watchersNeeded(config, state);
    const raid = currentRaid(config, state, now);
    const st = state.stats;

    return [
        {
            title: '🏕️ 营地',
            rows: [
                { label: '日子', value: `第 ${currentDay(config, state, now)} 天 · ${season.icon}${season.name}第 ${dayInSeason} 天` },
                { label: '指挥部', value: `${hqLevel(state)} 级` },
                { label: '人口 / 床位', value: `${state.survivors.length} / ${bedCount(config, state)}`, warn: state.survivors.length >= bedCount(config, state) },
                { label: '干活 / 空闲 / 外出 / 养伤', value: `${state.survivors.length - idle - injured - out} / ${idle} / ${out} / ${injured}`, warn: injured > 0 },
            ],
        },
        {
            title: '📦 物资（库存 / 上限，每天净变化）',
            rows: RESOURCE_IDS.map((id) => {
                const def = config.resources.find((r) => r.id === id);
                const cap = storageCap(config, state, id);
                const net = rates[id] * perDay;
                return {
                    label: `${def?.icon ?? ''}${def?.name ?? id}`,
                    value: `${Math.floor(state.resources[id])}${Number.isFinite(cap) ? ` / ${cap}` : ''}   ${signed(net)}/天`,
                    warn: net < 0,
                };
            }),
        },
        {
            title: '😊 状态',
            rows: [
                { label: '平均心情', value: `${Math.round(morale(state))}（干活效率 ×${moraleMultiplier(state).toFixed(2)}）`, warn: morale(state) < 40 },
                { label: '平均精力', value: `${Math.round(sleepAvg)}`, warn: tired > 0 },
                { label: '太累的人', value: `${tired} 人（干活、打仗变差）`, warn: tired > 0 },
            ],
        },
        {
            title: '🛡️ 防御',
            rows: [
                { label: '安全值', value: `${safety(config, state)}` },
                { label: '栅栏生命', value: `${Math.round(barricadeHp(config, state))}` },
                { label: '战斗等级', value: `Lv${survivorBattleLevel(config, state)}` },
                { label: '今晚守夜', value: `${watchers.length} / ${needed} 人`, warn: watchers.length < needed },
                { label: '今晚尸潮概率', value: raid ? pct(raidChanceTonight(config, state, now)) : '还没开始' },
                { label: '下一次尸潮', value: raid ? `${nextRaidIsBloodMoon(config, state) ? '🩸血月·' : ''}${raid.name}` : '—', warn: nextRaidIsBloodMoon(config, state) },
                { label: '工坊', value: `${workshopLevel(config, state)} 级` },
            ],
        },
        {
            title: '🗺️ 探索',
            rows: [
                { label: '小镇已探索', value: pct(exploredRatio(config, state, now)) },
                { label: '打下的地点', value: `${config.locations.filter((l) => state.flags.includes(`cleared_${l.id}`)).length} / ${config.locations.length}` },
                { label: '发现的营地地点', value: `${state.discoveredSites.length}` },
            ],
        },
        {
            title: '📜 生存记录',
            rows: [
                { label: '守夜 胜 / 负', value: `${st.raids_won ?? 0} / ${st.raids_lost ?? 0}` },
                { label: '平静的夜晚', value: `${st.quiet_nights ?? 0}` },
                { label: '消灭丧尸', value: `${st.zombies_killed ?? 0}` },
                { label: '救回的人', value: `${(st.rescued_by_scouts ?? 0) + (st.recruited ?? 0)}` },
                { label: '牺牲', value: `${st.deaths ?? 0}`, warn: (st.deaths ?? 0) > 0 },
            ],
        },
    ];
}
