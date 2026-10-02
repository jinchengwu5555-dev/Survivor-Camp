// 游戏总入口：界面层只和这个类打交道。

import { autoFarm, clearPlot, collectProduce, harvestAll, petAnimals, plant, slaughter, updateFarm } from './farming';
import { AchievementDef, ActionResult, BattleReport, GameConfig, CandidateState, GameEventDef, GameState, GearSlot, HaulState, ResourceBag, ResourceId, SurvivorRow, WatchMode } from './types';
import { equipGear, forgeGear, unequipGear } from './gear';
import { setWatchMode } from './watch';
import { updateChatter } from './chatter';
import { resolveSurveys, startSurvey, suggestSurveyors } from './districts';
import { buildVehicle, checkVehicleOwners } from './vehicles';
import { autoPack, autoPlace, confirmHaul, placePiece, removePiece } from './packing';
import { autoDecideCandidates, decideCandidate } from './recruits';
import { spendGold } from './gold';
import { pray } from './bonds';
import { resolveHunts, startHunt, suggestHunters } from './hunting';
import { advanceEconomy } from './economy';
import { assignSurvivor, completeUpgrades, speedUpUpgrade, startUpgrade } from './buildings';
import { ChoiceResult, getEventDef, maybeTriggerRandomEvent, resolveChoice } from './events';
import { checkEpisode, startStory } from './story';
import { finishExpeditionNow, maybeRunRaid, recoverInjuries, resolveExpeditions, scheduleFirstRaid, startExpedition, suggestSquad, treatSurvivor } from './combat';
import { LiveRaid } from './liveRaid';
import { collectPickup, PickupResult, updatePickups } from './pickups';
import { claimDaily, claimDailyChest, refreshDaily } from './daily';
import { addWorker, autoAssign, removeWorker } from './workers';
import { refreshTraderOffers, trade, updateTrader } from './trader';
import { BadgeGroup, badgeCounts, markSeen } from './badges';
import { useProp } from './props';
import { resolveScouts, sendScout, updateScoutSpots } from './scouting';
import { craftItem } from './crafting';
import { abandonBounty, acceptBounty, claimBounty } from './bounties';
import { checkAchievements } from './achievements';
import { checkSeasonChange } from './seasons';
import { createNewState } from './state';
import { applyHardship } from './roster';
import { relocate } from './sites';
import { advanceClock } from './clock';
import { grantOfflineReward } from './offline';

export class CampGame {
    /** 新解锁、还没在界面上提示过的成就；界面取走后自己清空 */
    readonly newAchievements: AchievementDef[] = [];
    /**
     * 界面打开时设为 true：尸潮来了不自动结算，放进 state.pendingRaid 等玩家亲手守夜（见 liveRaid.ts）。
     * 测试和数值模拟保持 false，照旧自动结算。
     */
    liveRaids = false;
    private live: LiveRaid | null = null;

    constructor(readonly config: GameConfig, public state: GameState) {}

    static newGame(config: GameConfig, now: number, seed = Date.now()): CampGame {
        const game = new CampGame(config, createNewState(config, now, seed));
        startStory(config, game.state);
        return game;
    }

    /** 暂停 / 继续：暂停时游戏时间不走（界面的设置菜单用） */
    setPaused(paused: boolean, realNow: number): void {
        this.state.clock.paused = paused;
        this.state.clock.lastRealAt = realNow;
        this.state.clock.maxRealAt = Math.max(this.state.clock.maxRealAt, realNow);
    }

    get paused(): boolean {
        return !!this.state.clock.paused;
    }

    /** 当前游戏时间：界面上的倒计时、各种操作都用它，不要用 Date.now() */
    get now(): number {
        return this.state.clock.gameTime;
    }

    /**
     * 界面每秒调用一次，传真实时间。在线时游戏时间按倍速前进并结算；
     * 离线回来的第一次调用只发离线挂机收益（游戏时间不动），返回到手的物资。
     */
    online(realNow: number): { now: number; offlineReward: ResourceBag | null } {
        const step = advanceClock(this.config, this.state, realNow);
        const offlineReward = step.offlineMs > 0 ? grantOfflineReward(this.config, this.state, step.offlineMs, step.gameNow) : null;
        this.tick(step.gameNow);
        return { now: step.gameNow, offlineReward };
    }

    /**
     * 推进游戏时间到 now（游戏时间，不是真实时间）。
     * 生产按段结算：在每个升级完成的时间点切开，保证升级后的产量从完成那一刻开始计算。
     */
    tick(now: number): void {
        const s = this.state;
        if (now <= s.lastTickAt || s.gameOver) return;
        s.clock.gameTime = Math.max(s.clock.gameTime, now);
        let t = s.lastTickAt;

        const finishTimes = Object.values(s.buildings)
            .map((b) => b.upgradeEndsAt)
            .filter((at): at is number => at !== null && at > t && at <= now)
            .sort((a, b) => a - b);
        for (const at of [...finishTimes, now]) {
            const hardship = advanceEconomy(this.config, s, (at - t) / 60_000, t);
            applyHardship(this.config, s, hardship, at);
            completeUpgrades(this.config, s, at);
            t = at;
        }

        s.lastTickAt = now;
        checkSeasonChange(this.config, s, now);
        recoverInjuries(this.config, s, now);
        resolveExpeditions(this.config, s, now, this.liveRaids);
        resolveScouts(this.config, s, now);
        resolveSurveys(this.config, s, now);
        resolveHunts(this.config, s, now);
        updateFarm(this.config, s, now);
        // 没有界面在看（比如模拟器），菜园和畜栏自动打理
        if (!this.liveRaids) autoFarm(this.config, s, now);
        checkVehicleOwners(this.config, s, now);
        // 没有界面在看（比如模拟器），等着装的背包自动装好带回来
        if (!this.liveRaids) for (const h of [...(s.pendingHauls ?? [])]) confirmHaul(this.config, s, h.id, now);
        // 没有界面在看，遇到的人自动决定留不留
        if (!this.liveRaids && (s.candidates ?? []).length) autoDecideCandidates(this.config, s, now);
        // 没有界面在看（比如模拟器），留着的尸潮直接自动打完
        if (!this.liveRaids && s.pendingRaid) new LiveRaid(this.config, s, s.pendingRaid).finish();
        maybeRunRaid(this.config, s, now, this.liveRaids);
        maybeTriggerRandomEvent(this.config, s, now);
        updatePickups(this.config, s, now);
        updateTrader(this.config, s, now);
        updateScoutSpots(this.config, s, now);
        updateChatter(this.config, s, now);
        this.settle(now);
    }

    /** 每个操作之后都检查一次剧情目标和成就 */
    private settle(now: number): void {
        checkEpisode(this.config, this.state, now);
        scheduleFirstRaid(this.config, this.state, now);
        if (!this.state.gameOver) refreshDaily(this.config, this.state, now);
        this.newAchievements.push(...checkAchievements(this.config, this.state, now));
    }

    private act<T extends ActionResult | ChoiceResult | PickupResult>(now: number, action: () => T): T {
        this.tick(now);
        if (this.state.gameOver) return { ok: false, reason: '营地已经覆灭了' } as T;
        const result = action();
        this.settle(now);
        return result;
    }

    upgrade(buildingId: string, now: number): ActionResult {
        return this.act(now, () => startUpgrade(this.config, this.state, buildingId, now));
    }

    /** 看完激励视频后调用：剩余时间减少一部分，不够减就直接完成 */
    speedUpUpgrade(buildingId: string, now: number): ActionResult {
        return this.act(now, () => speedUpUpgrade(this.config, this.state, buildingId, now));
    }

    assign(survivorId: string, buildingId: string | null, now: number): ActionResult {
        return this.act(now, () => assignSurvivor(this.config, this.state, survivorId, buildingId));
    }

    /** 给建筑加一个人（优先专长对口的） */
    addWorker(buildingId: string, now: number): ActionResult {
        return this.act(now, () => addWorker(this.config, this.state, buildingId));
    }

    removeWorker(buildingId: string, now: number): ActionResult {
        return this.act(now, () => removeWorker(this.config, this.state, buildingId));
    }

    /** 一键安排所有闲着的人 */
    autoAssign(now: number): ActionResult {
        return this.act(now, () => autoAssign(this.config, this.state, now));
    }

    /** 捡起营地附近的东西 */
    collectPickup(pickupId: number, now: number): PickupResult {
        return this.act(now, () => collectPickup(this.config, this.state, pickupId, now));
    }

    /** 和流浪商人交易（第 index 笔） */
    trade(index: number, now: number): ActionResult {
        return this.act(now, () => trade(this.config, this.state, index, now));
    }

    /** 看完激励视频后调用：商人重新摆货 */
    refreshTrader(now: number): ActionResult {
        return this.act(now, () => refreshTraderOffers(this.config, this.state, now));
    }

    /** 派一个人去镇地图上的侦察点 */
    sendScout(spotId: number, now: number): ActionResult {
        return this.act(now, () => sendScout(this.config, this.state, spotId, now));
    }

    /** 使用背包里的一个道具 */
    useProp(propId: string, now: number): ActionResult {
        return this.act(now, () => useProp(this.config, this.state, propId, now));
    }

    /** 各处的红点数 */
    badges(): Record<BadgeGroup, number> {
        return badgeCounts(this.config, this.state, this.now);
    }

    /** 玩家打开了某个页面，新内容记为已读（只影响红点，不是游戏操作） */
    markSeen(group: BadgeGroup): void {
        markSeen(this.config, this.state, group, this.now);
    }

    claimDaily(taskId: string, now: number): ActionResult {
        return this.act(now, () => claimDaily(this.config, this.state, taskId, now));
    }

    claimDailyChest(now: number): ActionResult {
        return this.act(now, () => claimDailyChest(this.config, this.state, now));
    }

    /** 派小队去探索；不指定成员时自动挑战斗力最高的人 */
    /** vehicle：开哪辆车（'walk' = 走路；不写 = 自动挑能到的最好的一辆） */
    explore(locationId: string, now: number, squad?: string[], vehicle?: string): ActionResult {
        return this.act(now, () =>
            startExpedition(this.config, this.state, locationId, squad ?? suggestSquad(this.config, this.state), now, vehicle),
        );
    }

    /** 勘察一个分区：驱散一片迷雾 */
    survey(districtId: string, now: number, squad?: string[], vehicle?: string): ActionResult {
        return this.act(now, () => startSurvey(this.config, this.state, districtId, squad ?? suggestSurveyors(this.state), now, vehicle));
    }

    /** 派人去某个区打猎 / 钓鱼 */
    hunt(districtId: string, now: number, hunters?: string[], vehicle?: string): ActionResult {
        return this.act(now, () => startHunt(this.config, this.state, districtId, hunters ?? suggestHunters(this.config, this.state), now, vehicle));
    }

    /** 在工坊修一辆车 */
    buildVehicle(vehicleId: string, now: number): ActionResult {
        return this.act(now, () => buildVehicle(this.config, this.state, vehicleId, now));
    }

    /** 花黄金换资源（越往后越不值钱） */
    spendGold(resource: ResourceId, now: number): ActionResult {
        return this.act(now, () => spendGold(this.config, this.state, resource, now));
    }

    /** 探索时遇到、等着决定留不留的人 */
    get candidates(): CandidateState[] {
        return this.state.candidates ?? [];
    }

    /** 留下 / 让他走 */
    decideCandidate(candidateId: number, keep: boolean, now: number): ActionResult {
        return this.act(now, () => decideCandidate(this.config, this.state, candidateId, keep, now));
    }

    /** 当前要装的背包（探索回来的战利品） */
    get currentHaul(): HaulState | undefined {
        return this.state.pendingHauls?.[0];
    }

    /** 装背包：把一件东西放到 (x, y) */
    placeLoot(pieceId: number, section: number, x: number, y: number, rotated: boolean): ActionResult {
        const h = this.currentHaul;
        if (!h) return { ok: false, reason: '没有要装的东西' };
        const reason = placePiece(h, pieceId, section, x, y, rotated);
        return reason ? { ok: false, reason } : { ok: true };
    }

    /** 装背包：自动找个位置放 */
    autoPlaceLoot(pieceId: number): ActionResult {
        const h = this.currentHaul;
        if (!h) return { ok: false, reason: '没有要装的东西' };
        const reason = autoPlace(h, pieceId);
        return reason ? { ok: false, reason } : { ok: true };
    }

    /** 装背包：拿出来 */
    unpackLoot(pieceId: number): void {
        if (this.currentHaul) removePiece(this.currentHaul, pieceId);
    }

    /** 装背包：一键整理 */
    autoPackLoot(): void {
        if (this.currentHaul) autoPack(this.config, this.currentHaul);
    }

    /** 背上背包回营地 */
    carryHaul(now: number): ActionResult {
        const h = this.currentHaul;
        if (!h) return { ok: false, reason: '没有要装的东西' };
        return this.act(now, () => confirmHaul(this.config, this.state, h.id, now));
    }

    /** 看完激励视频后调用：小队立即返回 */
    speedUpExpedition(expeditionId: number, now: number): ActionResult {
        return this.act(now, () => finishExpeditionNow(this.config, this.state, expeditionId, now));
    }

    treat(survivorId: string, now: number): ActionResult {
        return this.act(now, () => treatSurvivor(this.config, this.state, survivorId, now));
    }

    craft(itemId: string, now: number): ActionResult {
        return this.act(now, () => craftItem(this.config, this.state, itemId, now));
    }

    /** 给某人穿上背包里的装备（同位置的旧装备放回背包） */
    equip(survivorId: string, propId: string, now: number): ActionResult {
        return this.act(now, () => equipGear(this.config, this.state, survivorId, propId));
    }

    unequip(survivorId: string, slot: GearSlot, now: number): ActionResult {
        return this.act(now, () => unequipGear(this.state, survivorId, slot));
    }

    /** 工坊打造装备 */
    forge(propId: string, now: number): ActionResult {
        return this.act(now, () => forgeGear(this.config, this.state, propId, now));
    }

    /** 战斗站位：前排 / 后排；null = 按武器自动 */
    setRow(survivorId: string, row: SurvivorRow | null, now: number): ActionResult {
        return this.act(now, () => {
            const s = this.state.survivors.find((x) => x.id === survivorId);
            if (!s) return { ok: false, reason: '没有这个人' };
            if (row) s.row = row;
            else delete s.row;
            return { ok: true };
        });
    }

    /** 在墓前祷告（每座墓每天一次） */
    pray(graveId: string, now: number): ActionResult {
        return this.act(now, () => pray(this.config, this.state, graveId, now));
    }

    /** 守夜安排：轮班 / 固定守夜 / 不守夜 */
    setWatch(survivorId: string, mode: WatchMode, now: number): ActionResult {
        return this.act(now, () => (setWatchMode(this.state, survivorId, mode) ? { ok: true } : { ok: false, reason: '没有这个人' }));
    }

    /** 菜园：种下一颗种子（不指定地块就种在第一块空地） */
    plant(cropId: string, now: number, plotIndex?: number): ActionResult {
        return this.act(now, () => plant(this.config, this.state, cropId, now, plotIndex));
    }

    harvest(now: number): ActionResult {
        return this.act(now, () => harvestAll(this.config, this.state, now));
    }

    clearPlot(plotIndex: number, now: number): ActionResult {
        return this.act(now, () => clearPlot(this.config, this.state, plotIndex, now));
    }

    /** 畜栏：收鸡蛋、羊奶 */
    collectProduce(now: number): ActionResult {
        return this.act(now, () => collectProduce(this.config, this.state, now));
    }

    slaughter(animalId: string, now: number): ActionResult {
        return this.act(now, () => slaughter(this.config, this.state, animalId, now));
    }

    petAnimals(now: number): ActionResult {
        return this.act(now, () => petAnimals(this.config, this.state, now));
    }

    acceptBounty(bountyId: string, now: number): ActionResult {
        return this.act(now, () => acceptBounty(this.config, this.state, bountyId, now));
    }

    abandonBounty(bountyId: string, now: number): ActionResult {
        return this.act(now, () => abandonBounty(this.state, bountyId));
    }

    /** 举营搬迁到已发现的营地地点 */
    relocate(siteId: string, now: number): ActionResult {
        return this.act(now, () => relocate(this.config, this.state, siteId, now));
    }

    claimBounty(bountyId: string, now: number): ActionResult {
        return this.act(now, () => claimBounty(this.config, this.state, bountyId, now));
    }

    /** 有尸潮在等玩家守夜时，返回这场战斗（同一场只创建一次）；界面每帧推进它 */
    liveRaid(): LiveRaid | null {
        const pending = this.state.pendingRaid;
        if (!pending || this.state.gameOver) return null;
        if (!this.live || this.live.pending !== pending) this.live = new LiveRaid(this.config, this.state, pending);
        return this.live;
    }

    /** 守夜打完（或跳过）后调用：结算奖励、伤亡，写战报 */
    finishLiveRaid(now: number): BattleReport | null {
        const live = this.liveRaid();
        if (!live) return null;
        let report: BattleReport | null = null;
        this.act(now, () => {
            report = live.finish();
            return { ok: true } as ActionResult;
        });
        this.live = null;
        return report;
    }

    get currentEvent(): GameEventDef | undefined {
        const id = this.state.eventQueue[0];
        return id ? getEventDef(this.config, id) : undefined;
    }

    choose(choiceIndex: number, now: number): ChoiceResult {
        return this.act(now, () => resolveChoice(this.config, this.state, choiceIndex, now));
    }
}
