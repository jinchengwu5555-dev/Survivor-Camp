// 原型阶段的界面：全部用代码生成（色块 + 文字 + emoji），先验证玩法，之后再换成正式美术。
// 用法：把这个组件挂到场景的 Canvas 节点上（见 README）。
//
// 结构：
//   Background  背景
//   Content     营地界面（每秒整体重画一次；内容太长时可以上下拖动）
//   Overlay     守夜 / 战斗回放画面（BattleView），打开时隐藏 Content
//   Fx          飘字特效（不会被重画清掉）

import { _decorator, Color, Component, EventTouch, game, Game, Graphics, JsonAsset, Label, Node, resources, SubContextView, UITransform } from 'cc';
import { CampGame } from '../core/CampGame';
import { upgradeBlocker } from '../core/buildings';
import { availableLocations, currentRaid, expeditionLoot, formatBag, isOnExpedition, nextRaidIsBloodMoon, raidEnemyBonus, restockSecondsLeft, suggestSquad } from '../core/combat';
import { bedCount, economyRates, getBuildingDef, morale, safety, storageCap, survivorBattleLevel } from '../core/economy';
import { availableBounties, bountyProgress, getBounty, hunterRankName } from '../core/bounties';
import { craftBlocker, itemCount, workshopLevel } from '../core/crafting';
import { isUnlocked } from '../core/achievements';
import { seasonAt } from '../core/seasons';
import { loadGame, saveGame } from '../core/save';
import { currentDay } from '../core/state';
import { currentEpisode, objectiveDone, objectiveProgress } from '../core/story';
import { BattleReport, BuildingDef, BuildingLevelDef, GameConfig, RESOURCE_IDS, ResourceBag } from '../core/types';
import { validateConfig } from '../core/validate';
import { carryOverAchievements, loadRecords, MetaRecords, recordRun, saveRecords } from '../core/records';
import { survivorInfo } from '../core/roster';
import { currentSite } from '../core/siteMods';
import { relocationBlocker, relocationFoodCost, relocationTargets } from '../core/sites';
import { expandConfig } from '../core/configExpand';
import { realSeconds } from '../core/clock';
import { GlobalRanking, scoreEntry } from '../core/leaderboard';
import { GuideHint, nextHint } from '../core/guide';
import { eventSpeaker } from '../core/portrait';
import { activePickups, pickupKind } from '../core/pickups';
import { dailyChest, dailyClaimable, dailyProgress, dailyTaskDef } from '../core/daily';
import { idleSurvivors, workersIn } from '../core/workers';
import { createAdService } from '../platform/AdService';
import { CocosStorage } from '../platform/CocosStorage';
import { createLeaderboard } from '../platform/Leaderboard';
import { createNetworkService } from '../platform/Network';
import { BattleView } from './BattleView';
import { addLabel, COLORS, drawPanel, floatText, formatTime, hexColor, makeNode, punch } from './widgets';

const { ccclass } = _decorator;

/** 界面右上角显示的版本号：每次更新代码都改一下，方便确认游戏是不是最新的 */
const GAME_VERSION = 'v0.5 拾荒+每日目标';

const WIDTH = 680;
const LEFT = -WIDTH / 2;
const TOP = 620;
/** 屏幕可见高度（设计分辨率 1280） */
const VIEW_HEIGHT = 1240;
const TEXT = COLORS.text;
const DIM = COLORS.dim;
const ACCENT = COLORS.accent;
const WIN = COLORS.win;
const LOSE = COLORS.lose;
const TILE_COLUMNS = 3;
const TILE_HEIGHT = 112;
/** 手指移动超过这么多像素算拖动，不算点击 */
const DRAG_THRESHOLD = 12;

type Tab = 'camp' | 'survivors' | 'explore' | 'bounties' | 'workshop' | 'achievements' | 'reports' | 'rank';
const TABS: [Tab, string][] = [
    ['camp', '营地'],
    ['survivors', '幸存者'],
    ['explore', '探索'],
    ['bounties', '任务'],
    ['workshop', '工坊'],
    ['achievements', '成就'],
    ['reports', '战报'],
    ['rank', '排行'],
];
const TABS_PER_ROW = 4;

type ButtonStyle = 'normal' | 'disabled' | 'highlight';

@ccclass('GameRoot')
export class GameRoot extends Component {
    private camp: CampGame | null = null;
    private readonly storage = new CocosStorage();
    private records: MetaRecords = loadRecords(this.storage);
    /** 这一局的覆灭是否已经记进跨局记录（避免重复记录） */
    private runRecorded = false;
    private newBest = false;
    private readonly ads = createAdService();
    private readonly network = createNetworkService();
    private readonly leaderboard = createLeaderboard();
    private connected = false;
    private loading = false;
    private config: GameConfig | null = null;
    /** 上一次上报成绩时是第几天（每过一天报一次） */
    private submittedDay = 0;
    private ranking: GlobalRanking | null = null;
    private rankingError = '';
    private friendView: Node | null = null;
    private content: Node | null = null;
    private overlay: Node | null = null;
    private fx: Node | null = null;
    private battleView: BattleView | null = null;
    private cursorY = TOP;
    private secondTimer = 0;
    private saveTimer = 0;
    private toast = '';
    private toastUntil = 0;
    private tab: Tab = 'camp';
    /** 营地页选中的建筑（下方显示详情） */
    private selectedBuilding: string | null = null;
    private showSites = false;
    /** 当前的新手引导 */
    private guide: GuideHint | null = null;
    // 拖动滚动
    private scrollY = 0;
    private contentHeight = 0;
    private dragDistance = 0;
    // 用来发现变化、放飘字
    private seenLevels: Record<string, number> = {};
    private seenReportId = 0;
    private raidWarned = false;

    onLoad(): void {
        this.drawBackground();
        this.content = makeNode('Content', this.node);
        this.overlay = makeNode('Overlay', this.node);
        this.fx = makeNode('Fx', this.node);
        game.on(Game.EVENT_HIDE, this.onHide, this);
        this.node.on(Node.EventType.TOUCH_START, () => (this.dragDistance = 0));
        this.node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => this.onDrag(e.getDeltaY()));
        this.network.onChange((online) => {
            this.connected = online;
            if (online && !this.config) this.loadConfig();
            this.render();
        });
        this.connect();
    }

    /** 游戏需要联网：没网时显示提示和重试按钮 */
    private connect(): void {
        this.network.check().then((online) => {
            this.connected = online;
            if (!online) {
                this.showOffline();
                return;
            }
            if (!this.config) this.loadConfig();
        });
    }

    private showOffline(): void {
        if (!this.content) return;
        this.content.destroyAllChildren();
        this.cursorY = TOP;
        this.text('需要联网', 40, ACCENT);
        this.text('《末日营地》需要联网才能玩：存活天数要上传到排行榜。\n断网期间营地会暂停，不会有尸潮，也不会死人；离线的时间会算成挂机收益。', 24);
        this.gap(20);
        this.button('重新连接', WIDTH, () => this.connect());
    }

    private onHide(): void {
        this.submitScore(true);
        this.save();
    }

    onDestroy(): void {
        game.off(Game.EVENT_HIDE, this.onHide, this);
        this.save();
    }

    update(dt: number): void {
        // 断网时不推进时间：之后重新连上，这段会算成离线（营地暂停，只发挂机收益）
        if (!this.camp || !this.connected) return;
        this.battleView?.update(dt);
        this.secondTimer += dt;
        this.saveTimer += dt;
        if (this.secondTimer >= 1) {
            this.secondTimer = 0;
            this.goOnline();
            this.submitScore();
            this.detectChanges();
            if (!this.battleView && this.camp.liveRaid()) this.openLiveRaid();
            if (!this.battleView) this.render();
        }
        if (this.saveTimer >= 10) {
            this.saveTimer = 0;
            this.save();
        }
    }

    private loadConfig(): void {
        if (this.loading) return;
        this.loading = true;
        resources.loadDir('config', JsonAsset, (err, assets) => {
            if (err) {
                this.showFatal(`配置加载失败：${err.message}`);
                return;
            }
            const byName: Record<string, unknown> = {};
            for (const a of assets) byName[a.name] = a.json;
            // 和测试一样：先把建筑的成长公式展开成完整等级
            const config = expandConfig(byName as unknown as GameConfig);
            const errors = validateConfig(config);
            if (errors.length > 0) {
                this.showFatal(`配置表有错误：\n${errors.slice(0, 10).join('\n')}`);
                return;
            }
            this.config = config;
            const saved = loadGame(this.storage, config);
            this.setCamp(saved ? new CampGame(config, saved) : this.newRun(config, Date.now()));
            // 读到的是已经覆灭的存档：说明上次覆灭时已经记录过了
            this.runRecorded = !!saved?.gameOver;
            this.goOnline();
            this.render();
        });
    }

    private setCamp(camp: CampGame): void {
        // 界面开着：尸潮来了由玩家亲手守夜
        camp.liveRaids = true;
        this.camp = camp;
        this.seenLevels = {};
        for (const b of Object.values(camp.state.buildings)) this.seenLevels[b.id] = b.level;
        this.seenReportId = camp.state.reports.reduce((max, r) => Math.max(max, r.id), 0);
    }

    /** 推进在线时钟；离线回来时提示挂机收益 */
    private goOnline(): void {
        if (!this.camp) return;
        const { offlineReward } = this.camp.online(Date.now());
        if (offlineReward) this.effect(`离线期间，留守的人攒下了 ${formatBag(this.camp.config, offlineReward)}`, ACCENT, 28);
    }

    /** 每秒检查一次：建筑升级完成、小队回来、尸潮快到了，放飘字 */
    private detectChanges(): void {
        const camp = this.camp;
        if (!camp) return;
        const { config, state } = camp;
        for (const b of Object.values(state.buildings)) {
            const before = this.seenLevels[b.id] ?? b.level;
            if (b.level > before) this.effect(`⬆️ ${getBuildingDef(config, b.id)?.name} 升到 ${b.level} 级！`, WIN, 30);
            this.seenLevels[b.id] = b.level;
        }
        for (const r of state.reports) {
            if (r.id <= this.seenReportId) continue;
            this.seenReportId = r.id;
            if (r.kind === 'expedition') this.effect(`${r.result === 'win' ? '🎒' : '🏃'} ${r.summary}`, r.result === 'win' ? WIN : LOSE, 24);
        }
        const raidLeft = realSeconds(config, state.nextRaidAt - camp.now);
        if (currentRaid(config, state, camp.now) && raidLeft <= 15 && !state.pendingRaid) {
            if (!this.raidWarned) this.effect('🧟 尸潮快到了！准备守夜！', LOSE, 32);
            this.raidWarned = true;
        } else {
            this.raidWarned = false;
        }
        if (camp.newAchievements.length > 0) {
            const names = camp.newAchievements.map((a) => `${a.icon}${a.name}`).join('、');
            camp.newAchievements.length = 0;
            this.effect(`🏆 解锁成就：${names}`, ACCENT, 28);
        }
    }

    /** 屏幕中间飘一行字 */
    private effect(text: string, color: Color, size = 26): void {
        if (this.fx) floatText(this.fx, text, 0, 80, color, size, 120, 2.2);
    }

    // ---------- 守夜 / 回放 ----------

    private openLiveRaid(): void {
        const camp = this.camp;
        const live = camp?.liveRaid();
        if (!camp || !live || !this.overlay) return;
        this.openBattle(
            new BattleView(this.overlay, {
                title: `🌙 守夜：${live.pending.title}`,
                live,
                onClose: () => {
                    const report = camp.finishLiveRaid(camp.now);
                    if (report) this.seenReportId = Math.max(this.seenReportId, report.id);
                    this.closeBattle();
                    this.save();
                },
            }),
        );
    }

    private openReplay(report: BattleReport): void {
        if (!this.camp || !this.overlay) return;
        this.openBattle(
            new BattleView(this.overlay, {
                title: `▶ 回放：${report.title}`,
                replay: { config: this.camp.config, setup: report.setup, report },
                onClose: () => this.closeBattle(),
            }),
        );
    }

    private openBattle(view: BattleView): void {
        this.battleView = view;
        if (this.content) this.content.active = false;
        this.setFriendView(false);
    }

    private closeBattle(): void {
        this.battleView?.destroy();
        this.battleView = null;
        if (this.content) this.content.active = true;
        this.render();
    }

    // ---------- 成绩和排行 ----------

    /** 每过一天（或切到后台、营地覆灭时）上报一次成绩 */
    private submitScore(force = false): void {
        const camp = this.camp;
        if (!camp || !this.connected) return;
        const entry = scoreEntry(camp.config, camp.state, this.records, camp.now);
        if (!force && entry.days === this.submittedDay) return;
        this.submittedDay = entry.days;
        this.leaderboard.submit(entry).catch(() => {
            this.submittedDay = 0; // 下一秒重试
        });
    }

    private loadRanking(): void {
        this.rankingError = '';
        this.leaderboard
            .globalTop()
            .then((r) => (this.ranking = r))
            .catch(() => (this.rankingError = '排行榜加载失败，稍后再试'))
            .then(() => this.render());
    }

    private save(): void {
        if (this.camp) saveGame(this.storage, this.camp.state);
    }

    /** 开新的一局：已经解锁的成就带过去 */
    private newRun(config: GameConfig, now: number): CampGame {
        const camp = CampGame.newGame(config, now);
        carryOverAchievements(this.records, camp.state, now);
        return camp;
    }

    /** 营地刚覆灭：记进跨局记录（只记一次） */
    private recordGameOver(camp: CampGame): void {
        if (this.runRecorded || !camp.state.gameOver) return;
        this.newBest = recordRun(camp.config, this.records, camp.state);
        saveRecords(this.storage, this.records);
        this.runRecorded = true;
        this.submitScore(true);
        this.save();
    }

    private renderGameOver(camp: CampGame): void {
        const over = camp.state.gameOver!;
        const r = this.records;
        this.text('营地覆灭了', 40, LOSE);
        this.text(`你们在末日里坚持了 ${over.day} 天`, 32, ACCENT);
        if (this.newBest) this.text('🏆 新纪录！', 28, WIN);
        this.text(over.cause, 22, DIM);
        this.gap(12);
        const stats = camp.state.stats;
        this.text(`消灭丧尸 ${stats.zombies_killed ?? 0}   守住的最高尸潮 +${stats.best_raid_level ?? 0}   牺牲 ${stats.deaths ?? 0} 人   搬迁 ${stats.relocations ?? 0} 次`, 22);
        this.gap(12);
        this.text(`最长纪录 ${r.bestDays} 天 · 第 ${r.runs} 个营地 · 累计坚持 ${r.totalDays} 天`, 24, ACCENT);
        for (const h of r.history.slice(0, 5)) this.text(`第 ${h.days} 天 · ${h.site} · ${h.cause}`, 20, DIM);
        this.gap(20);
        this.button('重新开始：建立新的营地', WIDTH, () => {
            this.setCamp(this.newRun(camp.config, Date.now()));
            this.runRecorded = false;
            this.newBest = false;
            this.tab = 'camp';
            this.save();
            this.render();
        }, LEFT, 'highlight');
    }

    // ---------- 界面 ----------

    private render(): void {
        const camp = this.camp;
        if (!camp || !this.content || this.battleView) return;
        if (!this.connected) {
            this.setFriendView(false);
            this.showOffline();
            return;
        }
        this.content.destroyAllChildren();
        this.cursorY = TOP;
        const now = camp.now;
        const { config, state } = camp;
        this.setFriendView(this.tab === 'rank' && !state.gameOver && !camp.currentEvent);

        if (state.gameOver) {
            this.recordGameOver(camp);
            this.renderGameOver(camp);
            this.finishLayout();
            return;
        }
        this.guide = nextHint(config, state, now);
        const { season, dayInSeason } = seasonAt(config, state, now);
        const versionY = this.cursorY;
        this.text(GAME_VERSION, 16, DIM, WIDTH, LEFT);
        this.cursorY = versionY - 18;
        this.text(`《末日营地》 第 ${currentDay(config, state, now)} 天  ${season.icon}${season.name}·第${dayInSeason}天`, 34, ACCENT);
        this.text(
            `${currentSite(config, state)?.icon ?? ''}${currentSite(config, state)?.name ?? ''}   士气 ${Math.round(morale(state))}   安全 ${safety(config, state)}   人数 ${state.survivors.length}/${bedCount(config, state)}   纪录 ${this.records.bestDays} 天`,
            22,
            DIM,
        );
        this.text(this.resourceLine(config, camp, now), 22);
        const raid = currentRaid(config, state, now);
        if (raid) {
            const left = realSeconds(config, state.nextRaidAt - now);
            const bloodMoon = nextRaidIsBloodMoon(config, state);
            const bonus = raidEnemyBonus(config, state, now);
            const level = bonus > 0 ? ` +${bonus}` : '';
            const relief = state.raidRelief > 0 ? `（喘息 -${state.raidRelief}）` : '';
            const name = bloodMoon ? `🩸血月夜！${raid.name}${level}（数量多一半，奖励翻倍）` : `${raid.name}${level}${relief}`;
            this.text(`🧟 ${formatTime(left)} 后${name}来袭`, left <= 15 ? 26 : 22, LOSE);
        }
        this.renderPickups(camp, now);
        this.gap(8);

        const ep = currentEpisode(config, state);
        if (ep) {
            this.text(`第 ${ep.season} 季 第 ${ep.episode} 集「${ep.title}」`, 24, ACCENT);
            for (const o of ep.objectives) this.text(`${objectiveDone(config, state, o, now) ? '✅' : '⬜'} ${o.text}`, 22);
        } else {
            this.text('第一季完（未完待续）', 24, ACCENT);
        }
        if (this.guide) this.banner(`👉 下一步：${this.guide.text}`);
        this.gap(10);

        if (camp.currentEvent) {
            this.renderEvent(camp);
        } else {
            this.renderTabs();
            if (this.tab === 'camp') {
                this.renderBuildings(camp, now);
                this.renderSites(camp, now);
                this.renderLog(camp);
            } else if (this.tab === 'survivors') {
                this.renderSurvivors(camp, now);
            } else if (this.tab === 'explore') {
                this.renderExplore(camp, now);
            } else if (this.tab === 'bounties') {
                this.renderBounties(camp, now);
            } else if (this.tab === 'workshop') {
                this.renderWorkshop(camp);
            } else if (this.tab === 'achievements') {
                this.renderAchievements(camp, now);
            } else if (this.tab === 'rank') {
                this.renderRanking(camp, now);
            } else {
                this.renderReports(camp);
            }
        }

        if (this.toast && Date.now() < this.toastUntil) this.banner(this.toast, COLORS.panelLight);
        this.finishLayout();
    }

    /** 营地附近能捡的东西：一排金色按钮，点一下捡走 */
    private renderPickups(camp: CampGame, now: number): void {
        const pickups = activePickups(camp.state, now);
        if (pickups.length === 0) return;
        const w = (WIDTH - 10 * (camp.config.pickups.maxActive - 1)) / camp.config.pickups.maxActive;
        const top = this.cursorY - 4;
        pickups.forEach((p, i) => {
            const kind = pickupKind(camp.config, p.kind);
            if (!kind) return;
            this.cursorY = top;
            this.button(`${kind.icon} ${kind.name}`, w, () => {
                const res = camp.collectPickup(p.id, camp.now);
                if (res.ok) this.effect(`${kind.icon} ${formatBag(camp.config, res.gained ?? {}) || kind.name}`, WIN, 28);
                else this.showToast(res.reason ?? '');
                this.render();
            }, LEFT + i * (w + 10), 'highlight', 22, 48);
        });
        this.gap(4);
    }

    /** 记下内容高度，限制滚动范围 */
    private finishLayout(): void {
        this.contentHeight = TOP - this.cursorY;
        this.applyScroll();
    }

    private onDrag(dy: number): void {
        this.dragDistance += Math.abs(dy);
        if (this.battleView) return;
        this.scrollY += dy;
        this.applyScroll();
    }

    private applyScroll(): void {
        const max = Math.max(0, this.contentHeight - VIEW_HEIGHT);
        this.scrollY = Math.max(0, Math.min(max, this.scrollY));
        this.content?.setPosition(0, this.scrollY);
    }

    private resetScroll(): void {
        this.scrollY = 0;
        this.applyScroll();
    }

    /** 这个按钮是不是新手引导要点的那个 */
    private isGuided(target: string): boolean {
        return this.guide?.target === target;
    }

    private renderRanking(camp: CampGame, now: number): void {
        const entry = scoreEntry(camp.config, camp.state, this.records, now);
        this.text(`这一局：第 ${entry.days} 天   我的最长纪录：${entry.bestDays} 天`, 24, ACCENT);
        this.text('天数只按在线时间算：在线约 10 分钟过一天，离线时营地暂停。', 20, DIM);
        this.gap(8);
        this.text('—— 全服排行（最长存活天数）——', 22, DIM);
        if (this.rankingError) this.text(this.rankingError, 22, LOSE);
        else if (!this.ranking) this.text('加载中……', 22, DIM);
        else {
            this.ranking.list.slice(0, 10).forEach((r, i) => this.text(`${i + 1}. ${r.name}  ${r.bestDays} 天${r.me ? '（我）' : ''}`, 22, r.me ? ACCENT : TEXT));
            if (this.ranking.me) this.text(`我的全服排名：第 ${this.ranking.me.rank} 名`, 22, ACCENT);
        }
        this.button('刷新排行', WIDTH, () => this.loadRanking());
    }

    /** 好友榜只能由开放数据域画在 sharedCanvas 上，这里用 SubContextView 显示；不在微信里时不显示 */
    private setFriendView(visible: boolean): void {
        if (visible && !this.friendView) {
            if (!this.leaderboard.showFriends()) return;
            const node = makeNode('FriendRanking', this.node, WIDTH, 600);
            node.setPosition(0, -300);
            node.addComponent(SubContextView);
            this.friendView = node;
        }
        if (this.friendView) this.friendView.active = visible;
    }

    private resourceLine(config: GameConfig, camp: CampGame, now: number): string {
        const { state } = camp;
        const rates = economyRates(config, state, now).net;
        return config.resources
            .map((r) => {
                const cap = storageCap(config, state, r.id);
                const amount = Math.floor(state.resources[r.id]);
                // 显示成每分钟在线时间的变化
                const rate = rates[r.id] * config.balance.clock.onlineTimeScale;
                const rateText = Math.abs(rate) >= 0.05 ? `(${rate > 0 ? '+' : ''}${rate.toFixed(1)})` : '';
                return `${r.icon}${amount}${cap === Infinity ? '' : '/' + cap}${rateText}`;
            })
            .join('  ');
    }

    /** 事件卡：左边是说话人的头像，右边是正文，下面是选项 */
    private renderEvent(camp: CampGame): void {
        const { config, state } = camp;
        const event = camp.currentEvent!;
        const speaker = eventSpeaker(config, state, event);
        const top = this.cursorY;

        // 先把正文排好，算出卡片高度
        const textWidth = WIDTH - 170;
        const body = makeNode('EventCard', this.content!, WIDTH, 10);
        const bodyLabel = addLabel(body, event.text, 24, TEXT, { width: textWidth, wrap: true, align: 'left' });
        bodyLabel.updateRenderData(true);
        const textHeight = bodyLabel.node.getComponent(UITransform)!.height;
        const cardHeight = Math.max(260, textHeight + 110);

        body.setPosition(0, top - cardHeight / 2);
        const g = body.addComponent(Graphics);
        drawPanel(g, WIDTH, cardHeight, COLORS.panel, 16, ACCENT, 3);
        // 标题
        const title = addLabel(body, `【${event.title}】`, 30, ACCENT, { width: WIDTH - 40, align: 'left' });
        title.node.setPosition(0, cardHeight / 2 - 34);
        // 头像
        const faceX = -WIDTH / 2 + 80;
        const faceY = cardHeight / 2 - 130;
        g.fillColor = hexColor(speaker.color);
        g.circle(faceX, faceY, 52);
        g.fill();
        g.lineWidth = 4;
        g.strokeColor = TEXT;
        g.circle(faceX, faceY, 52);
        g.stroke();
        addLabel(body, speaker.id === 'narrator' ? '📻' : speaker.name.slice(0, 1), 44, TEXT, { width: 100 }).node.setPosition(faceX, faceY);
        addLabel(body, speaker.name, 22, ACCENT, { width: 150 }).node.setPosition(faceX, faceY - 72);
        if (speaker.title) addLabel(body, speaker.title, 18, DIM, { width: 150 }).node.setPosition(faceX, faceY - 98);
        // 正文
        bodyLabel.node.setPosition(-WIDTH / 2 + 160 + textWidth / 2, cardHeight / 2 - 70 - textHeight / 2);

        this.cursorY = top - cardHeight - 16;
        event.choices.forEach((choice, i) => {
            const cost = choice.cost && Object.keys(choice.cost).length ? `（花费 ${formatBag(config, choice.cost)}）` : '';
            this.button(`${choice.text}${cost}`, WIDTH, () => {
                const res = camp.choose(i, camp.now);
                this.showToast(res.ok ? res.outcomeText ?? '' : res.reason ?? '');
                this.render();
            }, LEFT, 'normal', 24, 60);
            this.gap(10);
        });
    }

    /** 当前营地地点 + 可以搬去的地点（默认收起） */
    private renderSites(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const here = currentSite(config, state);
        const targets = relocationTargets(config, state);
        this.gap(6);
        if (here) this.text(`${here.icon} 当前营地：${here.name}　👍${here.pros}　👎${here.cons}`, 20, DIM);
        if (targets.length === 0) return;
        this.button(this.showSites ? '▲ 收起营地地点' : `🧭 已发现 ${targets.length} 个可以搬去的营地地点`, WIDTH, () => {
            this.showSites = !this.showSites;
            this.render();
        });
        this.gap(8);
        if (!this.showSites) return;
        for (const site of targets) {
            this.text(`${site.icon}${site.name}：${site.description}`, 20);
            this.text(`👍 ${site.pros}　👎 ${site.cons}`, 20, DIM);
            const blocker = relocationBlocker(config, state, site.id, now);
            const label = `举营搬迁（路上 ${relocationFoodCost(config, state)} 食物，只能带走一半物资，路障要重建）`;
            this.button(blocker ? `${label}（${blocker}）` : label, WIDTH, () => {
                const res = camp.relocate(site.id, camp.now);
                this.showToast(res.ok ? `搬到了${site.name}` : res.reason);
                this.render();
            }, LEFT, blocker !== null ? 'disabled' : 'normal');
            this.gap(8);
        }
    }

    /** 营地建筑：三列方块，点一下在下面显示详情和升级按钮 */
    private renderBuildings(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const guided = this.guide?.target?.match(/^(upgrade|speedup):(.+)$/)?.[2];
        if (guided && !this.selectedBuilding) this.selectedBuilding = guided;
        const tileWidth = (WIDTH - 10 * (TILE_COLUMNS - 1)) / TILE_COLUMNS;
        const top = this.cursorY;
        config.buildings.forEach((def, i) => {
            const col = i % TILE_COLUMNS;
            const row = Math.floor(i / TILE_COLUMNS);
            const b = state.buildings[def.id];
            const node = makeNode('Tile', this.content!, tileWidth, TILE_HEIGHT);
            node.setPosition(LEFT + col * (tileWidth + 10) + tileWidth / 2, top - row * (TILE_HEIGHT + 10) - TILE_HEIGHT / 2);
            const blocker = upgradeBlocker(config, state, def.id);
            const upgrading = b.upgradeEndsAt !== null;
            const selected = this.selectedBuilding === def.id;
            const isGuided = guided === def.id;
            const fill = upgrading ? hexColor('#34506a') : b.level === 0 ? hexColor('#3a3a3a') : COLORS.panelLight;
            const border = isGuided ? COLORS.highlight : selected ? ACCENT : blocker === null ? WIN : undefined;
            drawPanel(node.addComponent(Graphics), tileWidth, TILE_HEIGHT, fill, 12, border, isGuided || selected ? 5 : 2);
            addLabel(node, `${def.icon ?? '🏠'} ${def.name}`, 24, b.level > 0 ? TEXT : DIM, { width: tileWidth - 12 }).node.setPosition(0, 28);
            const workers = state.survivors.filter((s) => s.assignment === def.id).length;
            const slots = b.level > 0 ? def.levels[b.level - 1]?.workerSlots ?? 0 : 0;
            addLabel(node, b.level > 0 ? `Lv ${b.level}${slots ? `  👷${workers}/${slots}` : ''}` : '未建造', 20, DIM, { width: tileWidth - 12 }).node.setPosition(0, -4);
            const status = upgrading
                ? `🔨 ${formatTime(realSeconds(config, b.upgradeEndsAt! - now))}`
                : blocker === null
                  ? `⏫ 可以${b.level === 0 ? '建造' : '升级'}`
                  : blocker === '已达到最高等级'
                    ? '已满级'
                    : '';
            addLabel(node, (isGuided ? '👉 ' : '') + status, 20, upgrading ? ACCENT : WIN, { width: tileWidth - 12 }).node.setPosition(0, -34);
            node.on(Node.EventType.TOUCH_END, () => {
                if (this.dragDistance > DRAG_THRESHOLD) return;
                punch(node);
                this.selectedBuilding = selected ? null : def.id;
                this.render();
            });
        });
        const rows = Math.ceil(config.buildings.length / TILE_COLUMNS);
        this.cursorY = top - rows * (TILE_HEIGHT + 10) - 4;
        const def = this.selectedBuilding ? getBuildingDef(config, this.selectedBuilding) : undefined;
        if (def) this.renderBuildingDetail(camp, def, now);
        else this.text('点建筑查看详情和升级', 20, DIM);
    }

    private renderBuildingDetail(camp: CampGame, def: BuildingDef, now: number): void {
        const { config, state } = camp;
        const b = state.buildings[def.id];
        this.text(`${def.icon ?? ''} ${def.name} Lv${b.level}：${def.description}`, 22);
        const current = b.level > 0 ? def.levels[b.level - 1] : undefined;
        const next = def.levels[b.level];
        if (current) this.text(`现在：${levelSummary(config, current) || '—'}`, 20, DIM);
        const slots = current?.workerSlots ?? 0;
        if (slots > 0) {
            const workers = workersIn(state, def.id);
            const names = workers.map((s) => survivorInfo(config, state, s.id)?.name ?? s.id).join('、') || '没人';
            this.text(`👷 ${workers.length}/${slots}：${names}（闲着 ${idleSurvivors(state).length} 人）`, 20);
            const half = (WIDTH - 10) / 2;
            const row = this.cursorY;
            this.button('－ 撤下一人', half, () => {
                const res = camp.removeWorker(def.id, camp.now);
                if (!res.ok) this.showToast(res.reason);
                this.render();
            }, LEFT, workers.length === 0 ? 'disabled' : 'normal', 22, 48);
            this.cursorY = row;
            this.button('＋ 派一个人来', half, () => {
                const res = camp.addWorker(def.id, camp.now);
                if (res.ok) this.effect(`👷 ${res.message}去${def.name}干活了`, WIN);
                else this.showToast(res.reason);
                this.render();
            }, LEFT + half + 10, workers.length >= slots || idleSurvivors(state).length === 0 ? 'disabled' : 'normal', 22, 48);
            this.gap(6);
        }
        if (next) this.text(`下一级：${levelSummary(config, next) || '—'}`, 20, WIN);
        if (b.upgradeEndsAt !== null) {
            const left = realSeconds(config, b.upgradeEndsAt - now);
            this.button(`🔨 升级中 ${formatTime(left)} · 看广告加速`, WIDTH, () => this.speedUp(def.id), LEFT, this.isGuided(`speedup:${def.id}`) ? 'highlight' : 'normal', 24, 56);
        } else if (next) {
            const blocker = upgradeBlocker(config, state, def.id);
            const label = `${b.level === 0 ? '建造' : '升级'}  ${formatCost(config, next.cost)}`;
            const style: ButtonStyle = blocker !== null ? 'disabled' : this.isGuided(`upgrade:${def.id}`) ? 'highlight' : 'normal';
            this.button(blocker ? `${label}（${blocker}）` : label, WIDTH, () => {
                const res = camp.upgrade(def.id, camp.now);
                if (res.ok) this.effect(`🔨 开始${b.level === 0 ? '建造' : '升级'}${def.name}`, ACCENT);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, style, 24, 56);
        } else {
            this.text('已经是最高等级了', 20, DIM);
        }
        this.gap(8);
    }

    private renderTabs(): void {
        const w = (WIDTH - 10 * (TABS_PER_ROW - 1)) / TABS_PER_ROW;
        let rowTop = this.cursorY;
        TABS.forEach(([tab, name], i) => {
            const col = i % TABS_PER_ROW;
            if (col === 0 && i > 0) rowTop -= 52;
            this.cursorY = rowTop;
            const guided = this.guide?.tab === tab && this.tab !== tab;
            const style: ButtonStyle = guided ? 'highlight' : this.tab === tab ? 'normal' : 'disabled';
            const dot = tab === 'bounties' && this.camp && this.hasClaimable(this.camp) ? '❗' : '';
            this.button(guided ? `👉${name}` : this.tab === tab ? `【${name}${dot}】` : `${name}${dot}`, w, () => {
                this.tab = tab;
                this.resetScroll();
                if (tab === 'rank') this.loadRanking();
                this.render();
            }, LEFT + col * (w + 10), style, 22, 44, true);
        });
        this.gap(14);
    }

    /** 任务页有没有能领的奖励（页签上显示 ❗） */
    private hasClaimable(camp: CampGame): boolean {
        const { config, state } = camp;
        if (dailyClaimable(config, state)) return true;
        return state.bounties.active.some((a) => {
            const { current, target } = bountyProgress(config, state, a.id);
            return target > 0 && current >= target;
        });
    }

    /** 每日目标：每个游戏日 3 个小目标，全部完成开宝箱 */
    private renderDaily(camp: CampGame): void {
        const { config, state } = camp;
        const daily = state.daily;
        if (!daily) return;
        this.text(`—— 第 ${daily.day} 天的目标（每天换一批，没领的第二天就没了）——`, 22, DIM);
        for (const t of daily.tasks) {
            const def = dailyTaskDef(config, t.id);
            if (!def) continue;
            const { current, target } = dailyProgress(config, state, t.id);
            const done = current >= target;
            const label = t.claimed ? `✅ ${def.text}（已领取）` : `${done ? '🎁' : '⬜'} ${def.text}  ${current}/${target}  奖励 ${formatBag(config, def.reward)}`;
            this.button(label, WIDTH, () => {
                const res = camp.claimDaily(t.id, camp.now);
                if (res.ok) this.effect(`🎁 ${res.message ?? ''}`, WIN, 28);
                this.render();
            }, LEFT, t.claimed || !done ? 'disabled' : 'highlight', 22, 48);
            this.gap(6);
        }
        const allClaimed = daily.tasks.length > 0 && daily.tasks.every((t) => t.claimed);
        const chest = daily.chestClaimed ? '📭 今天的宝箱已经打开了' : `📦 全部完成开宝箱：${formatBag(config, dailyChest(config, state))}`;
        this.button(chest, WIDTH, () => {
            const res = camp.claimDailyChest(camp.now);
            if (res.ok) this.effect(`📦 宝箱：${res.message ?? ''}`, ACCENT, 30);
            else this.showToast(res.reason);
            this.render();
        }, LEFT, allClaimed && !daily.chestClaimed ? 'highlight' : 'disabled', 22, 52);
        this.gap(14);
    }

    private renderBounties(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.renderDaily(camp);
        this.text(`—— 悬赏板（${hunterRankName(config, state)} · 经验 ${state.hunterXp}）——`, 22, DIM);
        this.text(`进行中 ${state.bounties.active.length}/${config.balance.maxActiveBounties}`, 22, ACCENT);
        for (const active of state.bounties.active) {
            const def = getBounty(config, active.id);
            if (!def) continue;
            const { current, target } = bountyProgress(config, state, def.id);
            this.text(`🎯 ${def.title}  ${current}/${target}  奖励 ${formatBag(config, def.reward)}`, 22);
            const done = current >= target;
            this.button(done ? '领取奖励' : '放弃', WIDTH, () => {
                const res = done ? camp.claimBounty(def.id, camp.now) : camp.abandonBounty(def.id, camp.now);
                if (res.ok && done) this.effect(`🎯 悬赏「${def.title}」完成！`, WIN, 28);
                else this.showToast(res.ok ? '已放弃' : res.reason);
                this.render();
            }, LEFT, done ? 'highlight' : 'normal');
            this.gap(8);
        }
        this.text('可以接的悬赏', 22, ACCENT);
        for (const def of availableBounties(config, state, now)) {
            this.text(`${def.title}：${def.description}  奖励 ${formatBag(config, def.reward)} · 经验 ${def.xp}`, 20);
            this.button('接取', WIDTH, () => {
                const res = camp.acceptBounty(def.id, camp.now);
                this.showToast(res.ok ? `接下了「${def.title}」` : res.reason);
                this.render();
            });
            this.gap(8);
        }
    }

    private renderWorkshop(camp: CampGame): void {
        const { config, state } = camp;
        const level = workshopLevel(config, state);
        this.text(level > 0 ? `—— 工坊 ${level} 级（物品在战斗中自动使用，用掉才扣）——` : '—— 工坊（先在营地里建造工坊）——', 22, DIM);
        for (const item of config.items) {
            this.text(`${item.icon}${item.name} ×${itemCount(state, item.id)}  ${item.description}`, 22);
            const blocker = craftBlocker(config, state, item.id);
            this.button(`制作 ${formatCost(config, item.cost)}${blocker ? `（${blocker}）` : ''}`, WIDTH, () => {
                const res = camp.craft(item.id, camp.now);
                if (res.ok) this.effect(`${item.icon} 做好了一个${item.name}`, WIN);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, blocker !== null ? 'disabled' : 'normal');
            this.gap(10);
        }
    }

    private renderAchievements(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text(`—— 成就 ${state.achievements.length}/${config.achievements.length} ——`, 22, DIM);
        for (const def of config.achievements) {
            const unlocked = isUnlocked(state, def.id);
            if (!unlocked && def.hidden) {
                this.text('🔒 ？？？  隐藏成就', 20, DIM);
                continue;
            }
            const { current, target } = objectiveProgress(config, state, def.goal, now);
            const progress = unlocked ? '已解锁' : `${Math.min(current, target)}/${target}`;
            this.text(`${unlocked ? def.icon : '🔒'} ${def.name}  ${def.description}  ${progress}`, 20, unlocked ? WIN : TEXT);
        }
    }

    private renderSurvivors(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text(`—— 幸存者（点名字切换工作；伤员点击用药品治疗）战斗等级 ${survivorBattleLevel(config, state)} ——`, 22, DIM);
        const jobs: (string | null)[] = [null, ...config.buildings.filter((b) => b.levels.some((l) => l.workerSlots)).map((b) => b.id)];
        // 新手引导“安排人手”：高亮“一键安排工作”
        const idle = idleSurvivors(state).length;
        this.button(`${this.isGuided('assign') ? '👉 ' : ''}一键安排工作（闲着 ${idle} 人）`, WIDTH, () => {
            const res = camp.autoAssign(camp.now);
            if (res.ok) this.effect(`👷 ${res.message}`, WIN);
            else this.showToast(res.reason);
            this.render();
        }, LEFT, idle === 0 ? 'disabled' : this.isGuided('assign') ? 'highlight' : 'normal', 24, 56);
        this.gap(10);
        const colWidth = (WIDTH - 10) / 2;
        let rowTop = this.cursorY;
        state.survivors.forEach((s, i) => {
            const col = i % 2;
            if (col === 0) rowTop = this.cursorY;
            else this.cursorY = rowTop;
            const def = survivorInfo(config, state, s.id);
            const recover = s.recoverAt !== null ? formatTime(realSeconds(config, s.recoverAt - now)) : '';
            const job = s.injured
                ? `🩹${recover}`
                : isOnExpedition(state, s.id)
                  ? '探索中'
                  : s.assignment
                    ? getBuildingDef(config, s.assignment)?.name
                    : '空闲';
            this.button(`${def?.name ?? s.id} 😊${Math.round(s.mood)} ${job}`, colWidth, () => {
                if (s.injured) {
                    const res = camp.treat(s.id, camp.now);
                    this.showToast(res.ok ? `${def?.name}的伤治好了` : res.reason);
                    this.render();
                    return;
                }
                const start = jobs.indexOf(s.assignment);
                for (let step = 1; step <= jobs.length; step++) {
                    if (camp.assign(s.id, jobs[(start + step) % jobs.length], camp.now).ok) break;
                }
                this.render();
            }, col === 0 ? LEFT : LEFT + colWidth + 10, 'normal', 22, 50);
            if (col === 1 || i === state.survivors.length - 1) this.gap(8);
        });
        this.gap(6);
    }

    private renderExplore(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const squad = suggestSquad(config, state);
        const names = squad.map((id) => survivorInfo(config, state, id)?.name ?? id);
        this.text(`—— 探索（自动编队：${names.join('、') || '没有能出发的人'}）——`, 22, DIM);
        for (const loc of availableLocations(config, state, now)) {
            this.text(`${loc.name}  ⏱${formatTime(realSeconds(config, loc.durationMinutes * 60_000))}  战利品 ${formatBag(config, expeditionLoot(config, state, loc))}`, 24);
            this.text(loc.description, 20, DIM);
            const ex = state.expeditions.find((e) => e.location === loc.id);
            if (ex) {
                const left = realSeconds(config, ex.returnsAt - now);
                this.button(`小队在外面，${formatTime(left)} 后返回 · 看广告立即返回`, WIDTH, () => this.speedUpExpedition(ex.id));
            } else if (restockSecondsLeft(state, loc.id, now) > 0) {
                const left = realSeconds(config, restockSecondsLeft(state, loc.id, now) * 1000);
                this.button(`刚搜刮过，${formatTime(left)} 后物资重新聚起来`, WIDTH, () => {}, LEFT, 'disabled');
            } else {
                const guided = this.isGuided(`explore:${loc.id}`);
                this.button(`${guided ? '👉 ' : ''}派出小队`, WIDTH, () => {
                    const res = camp.explore(loc.id, camp.now);
                    if (res.ok) this.effect(`🚶 小队出发前往${loc.name}`, ACCENT);
                    else this.showToast(res.reason);
                    this.render();
                }, LEFT, squad.length === 0 ? 'disabled' : guided ? 'highlight' : 'normal', 24, 52);
            }
            this.gap(12);
        }
    }

    private renderReports(camp: CampGame): void {
        const { reports } = camp.state;
        this.text('—— 战报（点“回放”重看整场战斗）——', 22, DIM);
        if (reports.length === 0) this.text('还没有战斗。', 22, DIM);
        for (const r of reports.slice(-6).reverse()) {
            const icon = r.kind === 'raid' ? '🧟' : '🎒';
            this.text(`${icon} ${r.result === 'win' ? '胜利' : '失败'}  ${r.summary}`, 22, r.result === 'win' ? WIN : LOSE);
            this.button('▶ 回放', 160, () => this.openReplay(r));
            this.gap(10);
        }
    }

    private renderLog(camp: CampGame): void {
        this.text('—— 营地日志 ——', 22, DIM);
        for (const entry of camp.state.log.slice(-4).reverse()) this.text(entry.text, 20, DIM);
    }

    private speedUp(buildingId: string): void {
        this.ads.showRewarded().then((watched) => {
            if (!this.camp) return;
            if (watched) {
                const res = this.camp.speedUpUpgrade(buildingId, this.camp.now);
                this.showToast(res.ok ? res.message ?? '' : res.reason);
            } else {
                this.showToast('需要看完广告才能加速');
            }
            this.render();
        });
    }

    private speedUpExpedition(expeditionId: number): void {
        this.ads.showRewarded().then((watched) => {
            if (!this.camp) return;
            if (watched) {
                this.camp.speedUpExpedition(expeditionId, this.camp.now);
                this.tab = 'reports';
            } else {
                this.showToast('需要看完广告才能加速');
            }
            this.render();
        });
    }

    private showToast(message: string): void {
        if (!message) return;
        this.toast = message;
        this.toastUntil = Date.now() + 3000;
    }

    private showFatal(message: string): void {
        if (!this.content) return;
        this.content.destroyAllChildren();
        this.cursorY = TOP;
        this.text(message, 24, ACCENT);
    }

    // ---------- 节点工具 ----------

    private drawBackground(): void {
        const bg = makeNode('Background', this.node, 2000, 3000);
        const g = bg.addComponent(Graphics);
        g.fillColor = COLORS.bg;
        g.rect(-1000, -1500, 2000, 3000);
        g.fill();
    }

    /** 从当前光标位置往下写一段自动换行的文字，返回后光标移到文字下方 */
    private text(str: string, size: number, color: Color = TEXT, width = WIDTH, x = LEFT): void {
        const node = makeNode('Text', this.content!);
        const tf = node.getComponent(UITransform)!;
        tf.setAnchorPoint(0, 1);
        tf.width = width;
        node.setPosition(x, this.cursorY);
        const label = node.addComponent(Label);
        label.string = str;
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
        label.updateRenderData(true);
        this.cursorY -= tf.height + 4;
    }

    /** 一行带底色的提示条（新手引导、toast） */
    private banner(str: string, fill: Color = COLORS.highlight): void {
        const height = 48;
        const node = makeNode('Banner', this.content!, WIDTH, height);
        node.setPosition(0, this.cursorY - height / 2 - 4);
        drawPanel(node.addComponent(Graphics), WIDTH, height, fill, 10);
        addLabel(node, str, 22, TEXT, { width: WIDTH - 24, height });
        this.cursorY -= height + 8;
    }

    private button(str: string, width: number, onClick: () => void, x = LEFT, style: ButtonStyle = 'normal', size = 22, height = 44, clickableWhenDisabled = false): void {
        const node = makeNode('Button', this.content!, width, height);
        node.setPosition(x + width / 2, this.cursorY - height / 2);
        const fill = style === 'highlight' ? COLORS.highlight : style === 'disabled' ? COLORS.disabled : COLORS.button;
        drawPanel(node.addComponent(Graphics), width, height, fill, 8, style === 'highlight' ? ACCENT : undefined);
        addLabel(node, str, size, TEXT, { width: width - 12, height });
        node.on(Node.EventType.TOUCH_END, () => {
            // 拖动滚动时不算点击；禁用的按钮不响应（页签除外，灰色只表示没选中）
            if (this.dragDistance > DRAG_THRESHOLD || (style === 'disabled' && !clickableWhenDisabled)) return;
            punch(node);
            onClick();
        });
        this.cursorY -= height;
    }

    private gap(px: number): void {
        this.cursorY -= px;
    }
}

function formatCost(config: GameConfig, cost: ResourceBag): string {
    const parts = RESOURCE_IDS.filter((id) => cost[id]).map((id) => {
        const icon = config.resources.find((r) => r.id === id)?.icon ?? id;
        return `${icon}${cost[id]}`;
    });
    return parts.length > 0 ? parts.join(' ') : '免费';
}

/** 一级建筑的效果，比如“每人产 🍖1.6/分  岗位 3” */
function levelSummary(config: GameConfig, lv: BuildingLevelDef): string {
    const scale = config.balance.clock.onlineTimeScale;
    const icon = (id: string) => config.resources.find((r) => r.id === id)?.icon ?? id;
    const parts: string[] = [];
    if (lv.production) {
        const prod = RESOURCE_IDS.filter((id) => lv.production![id]).map((id) => `${icon(id)}${+(lv.production![id]! * scale).toFixed(1)}`);
        if (prod.length) parts.push(`每人每分钟产 ${prod.join(' ')}`);
    }
    if (lv.workerSlots) parts.push(`岗位 ${lv.workerSlots}`);
    if (lv.storage) parts.push(`仓库 ${RESOURCE_IDS.filter((id) => lv.storage![id]).map((id) => `${icon(id)}+${lv.storage![id]}`).join(' ')}`);
    if (lv.beds) parts.push(`床位 ${lv.beds}`);
    if (lv.safety) parts.push(`安全 ${lv.safety}`);
    if (lv.battleLevel) parts.push(`战斗等级 +${lv.battleLevel}`);
    if (lv.spoilReduction) parts.push(`食物腐烂 -${Math.round(lv.spoilReduction * 100)}%`);
    if (lv.workshopLevel) parts.push(`工坊 ${lv.workshopLevel} 级`);
    return parts.join('  ');
}
