// 原型阶段的界面：全部用代码生成（色块 + 文字 + emoji），先验证玩法，之后再换成正式美术。
// 用法：把这个组件挂到场景的 Canvas 节点上（见 README）。
//
// 结构：
//   Background  背景
//   Content     营地界面（每秒整体重画一次；内容太长时可以上下拖动）
//   Overlay     守夜 / 战斗回放画面（BattleView），打开时隐藏 Content
//   Fx          飘字特效（不会被重画清掉）

import { _decorator, BlockInputEvents, Color, Component, EventTouch, game, Game, Graphics, JsonAsset, Label, Mask, Node, resources, SubContextView, UIOpacity, UITransform } from 'cc';
import { CampGame } from '../core/CampGame';
import { upgradeBlocker } from '../core/buildings';
import {
    barricadeHp,
    currentRaid,
    DOG_FLAG,
    expeditionLoot,
    formatBag,
    isOnExpedition,
    nextRaidIsBloodMoon,
    raidDefenders,
    raidEnemyBonus,
    raidSetup,
    restockSecondsLeft,
    squadOf,
    suggestSquad,
} from '../core/combat';
import { bedCount, economyRates, getBuildingDef, morale, safety, storageCap, survivorBattleLevel } from '../core/economy';
import { availableBounties, bountyProgress, getBounty, hunterRankName } from '../core/bounties';
import { craftBlocker, itemCount, workshopLevel } from '../core/crafting';
import { isUnlocked } from '../core/achievements';
import { seasonAt } from '../core/seasons';
import { loadGame, saveGame } from '../core/save';
import { currentDay, hasFlag } from '../core/state';
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
import { eventSpeaker, portraitOf } from '../core/portrait';
import { activePickups, pickupKind } from '../core/pickups';
import { dailyChest, dailyProgress, dailyTaskDef } from '../core/daily';
import { idleSurvivors, workersIn } from '../core/workers';
import { traderPresent } from '../core/trader';
import { campPoint, exploredRatio, isRevealed, locationStatus, prerequisiteOf, revealers, unlockHint } from '../core/townMap';
import { activeScoutSpots, scoutKind } from '../core/scouting';
import { BadgeGroup } from '../core/badges';
import { formatProps, propBlocker, propCount, propReward } from '../core/props';
import { createAdService } from '../platform/AdService';
import { CocosStorage } from '../platform/CocosStorage';
import { createLeaderboard } from '../platform/Leaderboard';
import { createNetworkService } from '../platform/Network';
import { BattleView } from './BattleView';
import { addBadge, addLabel, COLORS, drawPanel, floatText, formatTime, hexColor, makeNode, punch } from './widgets';
import { addSprite, fitSize, getSprite, SPRITE_DIRS } from './sprites';

const { ccclass } = _decorator;

/** 界面右上角显示的版本号：每次更新代码都改一下，方便确认游戏是不是最新的 */
const GAME_VERSION = 'v1.0 小镇地图';

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
// ---- 屏幕布局（设计分辨率 720×1280，y 从上到下 640 → -640）----
/** 顶部状态栏：天数、季节、资源 */
const HUD_TOP = 640;
const HUD_BOTTOM = 515;
/** 营地地图 */
const MAP_TOP = HUD_BOTTOM;
const MAP_BOTTOM = -150;
const MAP_WIDTH = 720;
const MAP_HEIGHT = MAP_TOP - MAP_BOTTOM;
const MAP_CENTER_Y = (MAP_TOP + MAP_BOTTOM) / 2;
/** 底部两行导航按钮 */
const NAV_TOP = -500;
const NAV_BOTTOM = -640;
/** 地图下面的信息条（剧情目标、引导） */
const INFO_TOP = MAP_BOTTOM - 8;
/** 打开的面板（人员、探索……）占据状态栏和导航之间的区域 */
const SHEET_TOP = HUD_BOTTOM - 10;
/** 探索页的小镇地图：占面板上部，下面是选中地点的详情 */
const TOWN_HEIGHT = 730;
const TOWN_CENTER_Y = SHEET_TOP - TOWN_HEIGHT / 2;
/** 建筑在地图上的默认大小（再乘 buildings.json 里 map.scale） */
const BUILDING_BOX = { width: 150, height: 118 };
/** 拾荒物在地图上出现的位置（相对地图中心） */
const PICKUP_SPOTS = [
    { x: -110, y: -30 },
    { x: -205, y: 150 },
    { x: 205, y: 150 },
    { x: -110, y: -185 },
    { x: 120, y: -30 },
];
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
/** 营地页上打开的面板：建筑详情、营地地点 */
type Sheet = 'building' | 'sites' | 'trader' | 'props' | null;

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
    /** 营地地图、顶部状态栏、底部导航（固定不滚动） */
    private mapLayer: Node | null = null;
    private hud: Node | null = null;
    private nav: Node | null = null;
    /** text() / button() 往哪个节点里画（默认 content） */
    private target: Node | null = null;
    private sheet: Sheet = null;
    /** 可滚动区域的上沿和高度（随显示模式变化） */
    private viewTop = TOP;
    private viewHeight = VIEW_HEIGHT;
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
    /** 探索页选中的地点 */
    private selectedLocation: string | null = null;
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
        this.mapLayer = makeNode('Map', this.node);
        this.hud = makeNode('Hud', this.node);
        this.nav = makeNode('Nav', this.node);
        this.target = this.content;
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
        this.fullScreenMode();
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

    /** 演示战斗：用营地现在的人打一场当前的尸潮，不影响营地（预览角色图片、熟悉守夜用） */
    private openDemo(): void {
        const camp = this.camp;
        if (!camp || !this.overlay) return;
        const { config, state } = camp;
        const raid = currentRaid(config, state, camp.now) ?? config.raids[0];
        const ids = raidDefenders(config, state);
        const defenders = squadOf(config, state, ids.length ? ids : config.balance.startingSurvivors);
        const setup = raidSetup(config, raid, defenders, barricadeHp(config, state), survivorBattleLevel(config, state), Date.now() % 1_000_000_007, {
            dog: hasFlag(state, DOG_FLAG),
        });
        this.openBattle(
            new BattleView(this.overlay, {
                title: `🎬 演示：${raid.name}`,
                replay: { config, setup, report: null },
                onClose: () => this.closeBattle(),
            }),
        );
    }

    private openBattle(view: BattleView): void {
        this.battleView = view;
        this.setMainVisible(false);
        this.setFriendView(false);
    }

    private closeBattle(): void {
        this.battleView?.destroy();
        this.battleView = null;
        this.setMainVisible(true);
        this.render();
    }

    /** 战斗画面打开时隐藏主界面（否则点击会穿透到下面的地图和按钮） */
    private setMainVisible(visible: boolean): void {
        for (const node of [this.content, this.mapLayer, this.hud, this.nav]) if (node) node.active = visible;
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
            this.sheet = null;
            this.save();
            this.render();
        }, LEFT, 'highlight');
    }

    // ---------- 界面 ----------

    /** 整屏模式（断网、覆灭、出错）：不显示地图、状态栏和导航，内容从屏幕顶端开始 */
    private fullScreenMode(): void {
        this.mapLayer?.destroyAllChildren();
        this.hud?.destroyAllChildren();
        this.nav?.destroyAllChildren();
        this.content!.destroyAllChildren();
        this.target = this.content;
        this.viewTop = TOP;
        this.viewHeight = VIEW_HEIGHT;
        this.cursorY = TOP;
    }

    /** 有没有打开的面板（事件、页签、建筑详情……）；没有就显示营地地图 */
    private sheetOpen(camp: CampGame): boolean {
        return !!camp.currentEvent || this.tab !== 'camp' || this.sheet !== null;
    }

    private render(): void {
        const camp = this.camp;
        if (!camp || !this.content || this.battleView) return;
        if (!this.connected) {
            this.setFriendView(false);
            this.showOffline();
            return;
        }
        const now = camp.now;
        const { config, state } = camp;

        if (state.gameOver) {
            this.setFriendView(false);
            this.fullScreenMode();
            this.recordGameOver(camp);
            this.renderGameOver(camp);
            this.finishLayout();
            return;
        }
        this.guide = nextHint(config, state, now);
        this.setFriendView(this.tab === 'rank' && !camp.currentEvent);
        this.renderHud(camp, now);
        this.renderNav(camp);

        this.content.destroyAllChildren();
        this.mapLayer!.destroyAllChildren();
        this.target = this.content;
        if (this.sheetOpen(camp)) {
            // 面板：状态栏和导航之间，可以上下拖动（探索页是地图，不滚动）
            const townMap = this.tab === 'explore' && !camp.currentEvent;
            this.viewTop = SHEET_TOP;
            this.viewHeight = townMap ? 0 : SHEET_TOP - NAV_TOP;
            if (townMap) this.scrollY = 0;
            this.cursorY = SHEET_TOP;
            this.renderSheet(camp, now);
        } else {
            // 营地：上面是地图，下面是剧情目标和引导，不滚动
            this.viewTop = INFO_TOP;
            this.viewHeight = 0;
            this.scrollY = 0;
            this.renderMap(camp, now);
            this.cursorY = INFO_TOP;
            this.renderInfo(camp, now);
        }
        this.finishLayout();
    }

    /** 顶部状态栏：天数、季节、营地、资源、士气 */
    private renderHud(camp: CampGame, now: number): void {
        const hud = this.hud!;
        const { config, state } = camp;
        hud.destroyAllChildren();
        const height = HUD_TOP - HUD_BOTTOM;
        const centerY = (HUD_TOP + HUD_BOTTOM) / 2;
        const bar = makeNode('HudBar', hud, 720, height);
        bar.setPosition(0, centerY);
        bar.addComponent(BlockInputEvents);
        drawPanel(bar.addComponent(Graphics), 720, height, COLORS.panel, 0);
        const { season, dayInSeason } = seasonAt(config, state, now);
        const site = currentSite(config, state);
        const line = (text: string, size: number, color: Color, y: number) =>
            addLabel(bar, text, size, color, { width: WIDTH, align: 'left' }).node.setPosition(0, y - centerY);
        line(GAME_VERSION, 14, DIM, 630);
        line(`第 ${currentDay(config, state, now)} 天  ${season.icon}${season.name}·第${dayInSeason}天   ${site?.icon ?? ''}${site?.name ?? ''}`, 26, ACCENT, 603);
        line(this.resourceLine(config, camp, now), 20, TEXT, 570);
        line(`士气 ${Math.round(morale(state))}  安全 ${safety(config, state)}  人数 ${state.survivors.length}/${bedCount(config, state)}  战斗 Lv${survivorBattleLevel(config, state)}  🏆${this.records.bestDays} 天`, 18, DIM, 538);

        // 右上角：背包
        const totalProps = Object.values(state.props ?? {}).reduce((sum, n) => sum + n, 0);
        const bag = makeNode('Bag', bar, 120, 46);
        bag.setPosition(WIDTH / 2 - 60, 603 - centerY);
        drawPanel(bag.addComponent(Graphics), 120, 46, this.sheet === 'props' ? COLORS.highlight : COLORS.button, 10, ACCENT, 2);
        addLabel(bag, `🎒背包 ${totalProps}`, 20, TEXT, { width: 112 });
        addBadge(bag, 54, 18, camp.badges().props);
        bag.on(Node.EventType.TOUCH_END, () => {
            if (camp.currentEvent) return;
            punch(bag);
            this.tab = 'camp';
            this.sheet = this.sheet === 'props' ? null : 'props';
            this.resetScroll();
            this.render();
        });
    }

    /** 底部导航：两行，每行四个 */
    private renderNav(camp: CampGame): void {
        const nav = this.nav!;
        nav.destroyAllChildren();
        const height = NAV_TOP - NAV_BOTTOM;
        const bar = makeNode('NavBar', nav, 720, height);
        bar.setPosition(0, (NAV_TOP + NAV_BOTTOM) / 2);
        bar.addComponent(BlockInputEvents);
        drawPanel(bar.addComponent(Graphics), 720, height, COLORS.panel, 0);
        // 有事件要处理时，先处理事件
        const event = !!camp.currentEvent;
        const w = (WIDTH - 10 * (TABS_PER_ROW - 1)) / TABS_PER_ROW;
        const badges = camp.badges();
        this.target = nav;
        TABS.forEach(([tab, name], i) => {
            const col = i % TABS_PER_ROW;
            const row = Math.floor(i / TABS_PER_ROW);
            this.cursorY = NAV_TOP - 10 - row * 62;
            const current = this.tab === tab && this.sheet === null;
            const guided = this.guide?.tab === tab && !current;
            const badge = tab in badges ? badges[tab as BadgeGroup] : 0;
            const style: ButtonStyle = event ? 'disabled' : guided ? 'highlight' : current ? 'normal' : 'disabled';
            this.button(guided ? `👉${name}` : current ? `【${name}】` : name, w, () => {
                if (event) return;
                this.tab = tab;
                this.sheet = null;
                this.resetScroll();
                if (tab === 'rank') this.loadRanking();
                this.render();
            }, LEFT + col * (w + 10), style, 24, 52, true, current ? 0 : badge);
        });
        this.target = this.content;
    }

    /** 营地地图：背景 + 各个设施 + 地上能捡的东西 + 尸潮倒计时 */
    private renderMap(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const map = makeNode('CampMap', this.mapLayer!, MAP_WIDTH, MAP_HEIGHT);
        map.setPosition(0, MAP_CENTER_Y);
        // 裁掉超出地图区域的部分（背景图比例不一样时）
        const mask = map.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;
        const bg = getSprite(SPRITE_DIRS.bg + 'bg_camp');
        if (bg) {
            const scale = Math.max(MAP_WIDTH / (bg.rect.width || 1), MAP_HEIGHT / (bg.rect.height || 1));
            addSprite(map, bg, bg.rect.width * scale, bg.rect.height * scale);
        } else {
            this.drawMapPlaceholder(map, camp);
        }

        this.drawCampFence(map, state.buildings.wall?.level ?? 0);
        const guided = this.guide?.target?.match(/^(upgrade|speedup):(.+)$/)?.[2];
        config.buildings.forEach((def, i) => this.renderMapBuilding(map, camp, def, i, now, guided === def.id));

        // 地上能捡的东西
        activePickups(state, now).forEach((p, i) => {
            const kind = pickupKind(config, p.kind);
            if (!kind) return;
            const spot = PICKUP_SPOTS[i % PICKUP_SPOTS.length];
            const node = makeNode('Pickup', map, 90, 90);
            node.setPosition(spot.x, spot.y);
            const g = node.addComponent(Graphics);
            g.fillColor = new Color(214, 150, 40, 230);
            g.circle(0, 6, 34);
            g.fill();
            g.lineWidth = 3;
            g.strokeColor = ACCENT;
            g.circle(0, 6, 34);
            g.stroke();
            addLabel(node, kind.icon, 34, TEXT, { width: 70 }).node.setPosition(0, 8);
            addLabel(node, kind.name, 16, TEXT, { width: 110 }).node.setPosition(0, -38);
            node.on(Node.EventType.TOUCH_END, () => {
                const res = camp.collectPickup(p.id, camp.now);
                if (res.ok) this.effect(`${kind.icon} ${[formatBag(config, res.gained ?? {}), res.found].filter(Boolean).join(' ') || kind.name}`, WIN, 28);
                else this.showToast(res.reason ?? '');
                this.render();
            });
        });

        // 尸潮倒计时
        const raid = currentRaid(config, state, now);
        if (raid) {
            const left = realSeconds(config, state.nextRaidAt - now);
            const bloodMoon = nextRaidIsBloodMoon(config, state);
            const bonus = raidEnemyBonus(config, state, now);
            const name = `${bloodMoon ? '🩸血月·' : ''}${raid.name}${bonus > 0 ? ` +${bonus}` : ''}${state.raidRelief > 0 ? `（喘息 -${state.raidRelief}）` : ''}`;
            const pill = makeNode('Raid', map, 460, 40);
            pill.setPosition(-110, MAP_HEIGHT / 2 - 28);
            drawPanel(pill.addComponent(Graphics), 460, 40, new Color(40, 16, 16, 210), 20, left <= 15 ? LOSE : undefined, 2);
            addLabel(pill, `🧟 ${formatTime(left)} 后${name}来袭`, left <= 15 ? 22 : 19, LOSE, { width: 440 });
        }

        // 已发现的其他营地地点
        const targets = relocationTargets(config, state);
        if (targets.length > 0) {
            const btn = makeNode('Sites', map, 200, 40);
            btn.setPosition(MAP_WIDTH / 2 - 112, MAP_HEIGHT / 2 - 28);
            drawPanel(btn.addComponent(Graphics), 200, 40, COLORS.button, 20);
            addLabel(btn, `🧭 营地地点 ${targets.length}`, 19, TEXT, { width: 190 });
            addBadge(btn, 92, 14, camp.badges().sites);
            btn.on(Node.EventType.TOUCH_END, () => {
                punch(btn);
                this.sheet = 'sites';
                this.resetScroll();
                this.render();
            });
        }

        // 流浪商人的皮卡
        if (traderPresent(state, now)) {
            const truck = makeNode('Trader', map, 110, 90);
            truck.setPosition(255, -245);
            const tg = truck.addComponent(Graphics);
            drawPanel(tg, 104, 70, new Color(70, 90, 110, 235), 14, ACCENT, 3);
            addLabel(truck, '🚚', 36, TEXT, { width: 60 }).node.setPosition(0, 8);
            const left = realSeconds(config, (state.trader!.leavesAt ?? now) - now);
            addLabel(truck, `商人 ${formatTime(left)}`, 16, TEXT, { width: 104 }).node.setPosition(0, -22);
            addBadge(truck, 46, 30, camp.badges().trader);
            truck.on(Node.EventType.TOUCH_END, () => {
                punch(truck);
                this.sheet = 'trader';
                this.resetScroll();
                this.render();
            });
        }
    }

    /**
     * 营地的栅栏：围着停车场一圈，样子随栅栏等级变化——
     * 0 级：散落的货架；1～3 级：木栅栏；4～7 级：加固木墙；8～12 级：铁皮墙；13 级以上：水泥墙加铁丝网。
     * 下方中间留一个大门（栅栏建筑就站在门口）。
     */
    private drawCampFence(map: Node, level: number): void {
        const node = makeNode('Fence', map, MAP_WIDTH, MAP_HEIGHT);
        const g = node.addComponent(Graphics);
        const left = -MAP_WIDTH / 2 + 16;
        const right = MAP_WIDTH / 2 - 16;
        const bottom = -MAP_HEIGHT / 2 + 16;
        const top = MAP_HEIGHT / 2 - 160;
        const gate = { from: -10, to: 130 };
        const style =
            level >= 13
                ? { color: hexColor('#9a9a92'), width: 12, post: hexColor('#6a6a64'), wire: true }
                : level >= 8
                  ? { color: hexColor('#7c8a94'), width: 10, post: hexColor('#4e5a62'), wire: false }
                  : level >= 4
                    ? { color: hexColor('#8a6a44'), width: 9, post: hexColor('#5e4428'), wire: false }
                    : level >= 1
                      ? { color: hexColor('#9a7a50'), width: 5, post: hexColor('#6e5232'), wire: false }
                      : { color: new Color(150, 130, 100, 150), width: 3, post: new Color(110, 90, 60, 150), wire: false };
        // 墙身：左、右、下（下方中间是大门），上面接着超市外墙
        g.strokeColor = style.color;
        g.lineWidth = style.width;
        g.moveTo(left, top);
        g.lineTo(left, bottom);
        g.lineTo(gate.from, bottom);
        g.moveTo(gate.to, bottom);
        g.lineTo(right, bottom);
        g.lineTo(right, top);
        g.stroke();
        // 立柱
        g.fillColor = style.post;
        const post = (x: number, y: number) => {
            g.rect(x - style.width / 2 - 2, y - style.width / 2 - 2, style.width + 4, style.width + 4);
        };
        for (let y = bottom; y <= top; y += 42) {
            post(left, y);
            post(right, y);
        }
        for (let x = left; x <= right; x += 42) if (x < gate.from - 6 || x > gate.to + 6) post(x, bottom);
        g.fill();
        // 最高级：墙头的铁丝网
        if (style.wire) {
            g.strokeColor = new Color(200, 200, 200, 160);
            g.lineWidth = 2;
            for (let y = bottom; y < top; y += 14) {
                g.moveTo(left - 6, y);
                g.lineTo(left + 6, y + 7);
                g.moveTo(right - 6, y);
                g.lineTo(right + 6, y + 7);
            }
            g.stroke();
        }
    }

    /** 没有 bg_camp 背景图时，画一个简单的超市停车场 */
    private drawMapPlaceholder(map: Node, camp: CampGame): void {
        const g = map.addComponent(Graphics);
        const w = MAP_WIDTH;
        const h = MAP_HEIGHT;
        // 柏油地面
        g.fillColor = hexColor('#3b403a');
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        // 停车位的白线
        g.strokeColor = new Color(200, 200, 190, 60);
        g.lineWidth = 3;
        for (let x = -w / 2 + 40; x < w / 2; x += 90) {
            g.moveTo(x, -h / 2 + 20);
            g.lineTo(x, -h / 2 + 90);
            g.moveTo(x, h / 2 - 190);
            g.lineTo(x, h / 2 - 250);
        }
        g.stroke();
        // 超市外墙
        g.fillColor = hexColor('#5a4a3a');
        g.rect(-w / 2, h / 2 - 150, w, 150);
        g.fill();
        g.fillColor = hexColor('#6e5a44');
        g.rect(-w / 2, h / 2 - 158, w, 12);
        g.fill();
        const site = currentSite(camp.config, camp.state);
        addLabel(map, `${site?.icon ?? ''} ${site?.name ?? ''}`, 22, new Color(255, 220, 150, 180), { width: 300 }).node.setPosition(-230, h / 2 - 70);
    }

    /** 地图上的一个设施：图片（或色块）+ 名字等级 + 状态角标 + 干活的人 */
    private renderMapBuilding(map: Node, camp: CampGame, def: BuildingDef, index: number, now: number, guided: boolean): void {
        const { config, state } = camp;
        const b = state.buildings[def.id];
        const pos = def.map ?? { x: ((index % 3) - 1) * 230, y: 180 - Math.floor(index / 3) * 150 };
        const scale = def.map?.scale ?? 1;
        const bw = BUILDING_BOX.width * scale;
        const bh = BUILDING_BOX.height * scale;
        const node = makeNode(`Building_${def.id}`, map, bw, bh + 40);
        node.setPosition(pos.x, pos.y);

        const blocker = upgradeBlocker(config, state, def.id);
        const upgrading = b.upgradeEndsAt !== null;
        const art = getSprite(`${SPRITE_DIRS.buildings}building_${def.id}`);
        const g = node.addComponent(Graphics);
        if (guided) {
            g.lineWidth = 5;
            g.strokeColor = COLORS.highlight;
            g.roundRect(-bw / 2 - 6, -bh / 2 - 6, bw + 12, bh + 12, 16);
            g.stroke();
        }
        if (art) {
            const size = fitSize(art, bw, bh);
            const sprite = addSprite(node, art, size.width, size.height);
            if (b.level === 0) sprite.addComponent(UIOpacity).opacity = 110;
        } else {
            drawPanel(g, bw, bh, b.level === 0 ? new Color(70, 70, 70, 160) : new Color(96, 84, 66, 235), 14, b.level === 0 ? DIM : new Color(150, 130, 100), 2);
            addLabel(node, def.icon ?? '🏠', Math.round(46 * scale), TEXT, { width: bw }).node.setPosition(0, 8);
        }

        // 名字 + 等级
        const plateW = Math.max(120, bw - 10);
        const plate = makeNode('Plate', node, plateW, 30);
        plate.setPosition(0, -bh / 2 + 4);
        drawPanel(plate.addComponent(Graphics), plateW, 30, new Color(20, 22, 20, 210), 15);
        addLabel(plate, b.level > 0 ? `${def.name} Lv${b.level}` : `${def.name}（未建）`, 18, b.level > 0 ? TEXT : DIM, { width: plateW - 8 });

        // 状态角标：升级倒计时 / 可以升级 / 引导
        if (upgrading) {
            const tag = makeNode('Timer', node, 120, 28);
            tag.setPosition(0, bh / 2 + 4);
            drawPanel(tag.addComponent(Graphics), 120, 28, new Color(40, 70, 100, 230), 14);
            addLabel(tag, `🔨 ${formatTime(realSeconds(config, b.upgradeEndsAt! - now))}`, 18, ACCENT, { width: 116 });
        } else if (blocker === null) {
            const tag = makeNode('Up', node, 36, 36);
            tag.setPosition(bw / 2 - 10, bh / 2 - 6);
            const tg = tag.addComponent(Graphics);
            tg.fillColor = COLORS.button;
            tg.circle(0, 0, 17);
            tg.fill();
            tg.lineWidth = 2;
            tg.strokeColor = WIN;
            tg.circle(0, 0, 17);
            tg.stroke();
            addLabel(tag, '⏫', 18, TEXT, { width: 34 });
        }
        if (guided) addLabel(node, '👉', 34, TEXT, { width: 50 }).node.setPosition(-bw / 2 - 18, 0);

        // 在这里干活的人：一排小圆点（颜色是角色的主色）
        const workers = workersIn(state, def.id);
        const shown = Math.min(workers.length, 6);
        workers.slice(0, 6).forEach((s, i) => {
            g.fillColor = hexColor(portraitOf(config, state, s.id)?.color ?? '#7a8a7a');
            g.circle(-((shown - 1) * 16) / 2 + i * 16, -bh / 2 - 22, 7);
            g.fill();
        });

        node.on(Node.EventType.TOUCH_END, () => {
            if (this.dragDistance > DRAG_THRESHOLD) return;
            punch(node);
            this.selectedBuilding = def.id;
            this.sheet = 'building';
            this.resetScroll();
            this.render();
        });
    }

    /** 地图下面：剧情目标、下一步引导、提示、最近的日志 */
    private renderInfo(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const ep = currentEpisode(config, state);
        if (ep) {
            const goals = ep.objectives.map((o) => `${objectiveDone(config, state, o, now) ? '✅' : '⬜'}${o.text}`).join('  ');
            this.text(`第${ep.season}季第${ep.episode}集「${ep.title}」 ${goals}`, 20, ACCENT);
        } else {
            this.text('第一季完（未完待续）', 20, ACCENT);
        }
        if (this.guide) this.banner(`👉 下一步：${this.guide.text}`);
        if (this.toast && Date.now() < this.toastUntil) this.banner(this.toast, COLORS.panelLight);
        for (const entry of state.log.slice(-3).reverse()) this.text(entry.text, 18, DIM);
    }

    /** 面板：事件、页签内容、建筑详情、营地地点 */
    private renderSheet(camp: CampGame, now: number): void {
        const bg = makeNode('SheetBg', this.content!, 720, 2400);
        bg.setPosition(0, SHEET_TOP + 10 - 1200);
        drawPanel(bg.addComponent(Graphics), 720, 2400, COLORS.bg, 0);
        if (camp.currentEvent) {
            this.renderEvent(camp);
            return;
        }
        if (this.tab === 'camp') {
            // 建筑详情 / 营地地点，右上角可以关掉回到地图
            const top = this.cursorY;
            this.button('✕ 回到营地', 200, () => {
                this.sheet = null;
                this.render();
            }, LEFT + WIDTH - 200, 'normal', 22, 44);
            this.cursorY = top - 54;
            const def = this.selectedBuilding ? getBuildingDef(camp.config, this.selectedBuilding) : undefined;
            if (this.sheet === 'building' && def) this.renderBuildingDetail(camp, def, now);
            else if (this.sheet === 'trader') {
                this.renderTrader(camp, now);
                camp.markSeen('trader');
            } else if (this.sheet === 'props') {
                this.renderProps(camp, now);
                camp.markSeen('props');
            } else {
                this.renderSites(camp, now);
                camp.markSeen('sites');
            }
        } else if (this.tab === 'survivors') this.renderSurvivors(camp, now);
        else if (this.tab === 'explore') this.renderExplore(camp, now);
        else if (this.tab === 'bounties') this.renderBounties(camp, now);
        else if (this.tab === 'workshop') this.renderWorkshop(camp);
        else if (this.tab === 'achievements') this.renderAchievements(camp, now);
        else if (this.tab === 'rank') this.renderRanking(camp, now);
        else this.renderReports(camp);
        // 打开的页签：里面的新内容记为已读（红点下一次刷新时消失）
        if (this.tab !== 'camp' && this.tab !== 'rank') camp.markSeen(this.tab as BadgeGroup);
        if (this.toast && Date.now() < this.toastUntil) this.banner(this.toast, COLORS.panelLight);
    }

    /** 背包：每种道具一行，写清楚效果，点“使用” */
    private renderProps(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text('🎒 背包', 28, ACCENT);
        this.text('探索、守夜、拾荒、每日宝箱、商人和事件都会得到道具。', 20, DIM);
        this.gap(8);
        const owned = config.props.filter((p) => propCount(state, p.id) > 0);
        if (owned.length === 0) this.text('背包是空的。', 22, DIM);
        for (const def of owned) {
            const count = propCount(state, def.id);
            const blocker = propBlocker(config, state, def.id);
            let effect = def.description;
            if (def.type === 'resource') effect = `打开得到 ${formatBag(config, propReward(config, state, def))}`;
            if (def.type === 'speedup') effect = `正在升级的建筑加速 ${formatTime(realSeconds(config, (def.minutes ?? 0) * 60_000))}（在线时间）`;
            this.text(`${def.icon} ${def.name} ×${count}   ${effect}`, 22);
            const half = (WIDTH - 10) / 2;
            this.button(blocker ? `使用（${blocker}）` : '使用', half, () => {
                const res = camp.useProp(def.id, camp.now);
                if (res.ok) this.effect(`${def.icon} ${res.message ?? def.name}`, WIN, 28);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, blocker ? 'disabled' : 'normal', 22, 48);
            this.gap(12);
        }
    }

    /** 流浪商人：几笔以物易物的交易 + 看广告刷新货架 */
    private renderTrader(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const t = state.trader;
        if (!t || !traderPresent(state, now)) {
            this.text('商人已经走了。过一阵子还会再来。', 22, DIM);
            return;
        }
        this.text(`🚚 流浪商人（${formatTime(realSeconds(config, (t.leavesAt ?? now) - now))} 后离开）`, 26, ACCENT);
        this.text('“什么都能换，价格看心情。”每笔交易只能换一次。', 20, DIM);
        this.gap(8);
        t.offers.forEach((o, i) => {
            const affordable = RESOURCE_IDS.every((id) => state.resources[id] >= (o.give[id] ?? 0));
            const get = [formatBag(config, o.get), formatProps(config, o.props ?? {})].filter(Boolean).join(' ');
            const label = o.bought ? `✅ 已换：${formatBag(config, o.give)} → ${get}` : `给 ${formatBag(config, o.give)}  →  换 ${get}`;
            this.button(label, WIDTH, () => {
                const res = camp.trade(i, camp.now);
                if (res.ok) this.effect(`🤝 换到了 ${res.message ?? ''}`, WIN, 28);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, o.bought || !affordable ? 'disabled' : 'normal', 24, 60);
            this.gap(10);
        });
        this.button(`📺 看广告让商人换一批货（剩 ${t.refreshesLeft} 次）`, WIDTH, () => this.refreshTrader(), LEFT, t.refreshesLeft > 0 ? 'highlight' : 'disabled', 22, 52);
    }

    private refreshTrader(): void {
        this.ads.showRewarded().then((watched) => {
            if (!this.camp) return;
            if (watched) {
                const res = this.camp.refreshTrader(this.camp.now);
                if (!res.ok) this.showToast(res.reason);
            } else {
                this.showToast('需要看完广告才能刷新');
            }
            this.render();
        });
    }

    /** 记下内容高度，限制滚动范围 */
    private finishLayout(): void {
        this.contentHeight = this.viewTop - this.cursorY;
        this.applyScroll();
    }

    private onDrag(dy: number): void {
        this.dragDistance += Math.abs(dy);
        // 营地地图不滚动
        if (this.battleView || this.viewHeight <= 0) return;
        this.scrollY += dy;
        this.applyScroll();
    }

    private applyScroll(): void {
        const max = Math.max(0, this.contentHeight - this.viewHeight + 20);
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
            node.setPosition(0, -180);
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
        // 有头像图就放图（sprites/portraits/portrait_<id>.png），没有就写名字的第一个字
        const face = getSprite(SPRITE_DIRS.portraits + speaker.sprite);
        if (face) {
            const size = fitSize(face, 130, 130);
            addSprite(body, face, size.width, size.height).setPosition(faceX, faceY + 8);
        } else {
            addLabel(body, speaker.id === 'narrator' ? '📻' : speaker.name.slice(0, 1), 44, TEXT, { width: 100 }).node.setPosition(faceX, faceY);
        }
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

    /** 当前营地地点 + 可以搬去的地点（地图右上角“营地地点”打开） */
    private renderSites(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const here = currentSite(config, state);
        const targets = relocationTargets(config, state);
        if (here) this.text(`${here.icon} 当前营地：${here.name}　👍${here.pros}　👎${here.cons}`, 22);
        this.gap(8);
        if (targets.length === 0) this.text('还没有发现其他营地地点。探索中会找到新的地方。', 20, DIM);
        for (const site of targets) {
            this.text(`${site.icon}${site.name}：${site.description}`, 20);
            this.text(`👍 ${site.pros}　👎 ${site.cons}`, 20, DIM);
            const blocker = relocationBlocker(config, state, site.id, now);
            const label = `举营搬迁（路上 ${relocationFoodCost(config, state)} 食物，只能带走一半物资，栅栏要重建）`;
            this.button(blocker ? `${label}（${blocker}）` : label, WIDTH, () => {
                const res = camp.relocate(site.id, camp.now);
                if (res.ok) {
                    this.effect(`${site.icon} 搬到了${site.name}`, ACCENT, 30);
                    this.sheet = null;
                } else {
                    this.showToast(res.reason);
                }
                this.render();
            }, LEFT, blocker !== null ? 'disabled' : 'normal');
            this.gap(8);
        }
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

    /** 探索页：枫谷镇地图（迷雾、道路、地点、在路上的小队、侦察点）+ 下方选中地点的详情 */
    private renderExplore(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const map = makeNode('TownMap', this.content!, MAP_WIDTH, TOWN_HEIGHT);
        map.setPosition(0, TOWN_CENTER_Y);
        map.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        const bg = getSprite(SPRITE_DIRS.bg + 'bg_town');
        if (bg) {
            const scale = Math.max(MAP_WIDTH / (bg.rect.width || 1), TOWN_HEIGHT / (bg.rect.height || 1));
            addSprite(map, bg, bg.rect.width * scale, bg.rect.height * scale);
        } else {
            this.drawTownPlaceholder(map);
        }

        const camp0 = campPoint(config, state);
        const statusOf = new Map(config.locations.map((l) => [l.id, locationStatus(config, state, l, now)]));
        const visible = config.locations.filter((l) => l.map && statusOf.get(l.id) !== 'hidden');
        const guidedLoc = this.guide?.target?.startsWith('explore:') ? this.guide.target.slice('explore:'.length) : null;
        if (!this.selectedLocation || !visible.some((l) => l.id === this.selectedLocation)) {
            this.selectedLocation = guidedLoc ?? visible.find((l) => statusOf.get(l.id) === 'known')?.id ?? null;
        }

        // 道路：前置地点（没有前置就是营地）连到每个看得见的地点
        const roads = map.addComponent(Graphics);
        for (const loc of visible) {
            const from = prerequisiteOf(config, loc)?.map ?? camp0;
            const cleared = statusOf.get(loc.id) === 'cleared';
            dashedLine(roads, from, loc.map!, cleared ? new Color(210, 180, 120, 230) : new Color(200, 200, 190, 140), cleared ? 5 : 3, cleared ? 0 : 10);
        }

        // 战争迷雾：没亮起来的格子盖上一层深色
        const pts = revealers(config, state, now);
        const fogNode = makeNode('Fog', map, MAP_WIDTH, TOWN_HEIGHT);
        const fog = fogNode.addComponent(Graphics);
        fog.fillColor = new Color(10, 12, 10, 215);
        const cell = 30;
        for (let x = -MAP_WIDTH / 2; x < MAP_WIDTH / 2; x += cell) {
            for (let y = -TOWN_HEIGHT / 2; y < TOWN_HEIGHT / 2; y += cell) {
                if (!isRevealed(pts, x + cell / 2, y + cell / 2)) fog.rect(x, y, cell, cell);
            }
        }
        fog.fill();

        // 已经发现的其他营地地点（可以搬过去）
        for (const site of config.sites) {
            if (!site.map || site.id === state.siteId || !state.discoveredSites.includes(site.id)) continue;
            const node = this.mapMarker(map, site.map, site.icon, `${site.name}（可搬迁）`, new Color(70, 90, 120, 230), 22);
            node.on(Node.EventType.TOUCH_END, () => {
                this.tab = 'camp';
                this.sheet = 'sites';
                this.resetScroll();
                this.render();
            });
        }

        // 营地
        const site = currentSite(config, state);
        this.mapMarker(map, camp0, '🏕️', `营地·${site?.name ?? ''}`, new Color(214, 150, 40, 240), 30);

        // 地点
        for (const loc of visible) {
            const status = statusOf.get(loc.id)!;
            const rumor = status === 'rumor';
            const color = rumor ? new Color(70, 70, 70, 230) : status === 'cleared' ? new Color(80, 130, 90, 240) : new Color(170, 110, 50, 240);
            const ex = state.expeditions.find((e) => e.location === loc.id);
            const restock = restockSecondsLeft(state, loc.id, now);
            const sub = rumor ? '？？？' : ex ? '小队在路上' : restock > 0 ? `🔄 ${formatTime(realSeconds(config, restock * 1000))}` : status === 'cleared' ? '✅ 可以再去' : '⚔️ 未探索';
            const node = this.mapMarker(map, loc.map!, rumor ? '❓' : loc.icon ?? '📍', rumor ? '???' : loc.name, color, 28, sub);
            const g = node.getComponent(Graphics)!;
            if (this.selectedLocation === loc.id) {
                g.lineWidth = 4;
                g.strokeColor = ACCENT;
                g.circle(0, 0, 36);
                g.stroke();
            }
            if (guidedLoc === loc.id) addLabel(node, '👉', 30, TEXT, { width: 40 }).node.setPosition(-48, 0);
            node.on(Node.EventType.TOUCH_END, () => {
                punch(node);
                this.selectedLocation = loc.id;
                this.render();
            });
        }

        // 在路上的小队：出发走一半路到目的地，另一半路走回来
        const walker = (from: { x: number; y: number }, to: { x: number; y: number }, start: number, end: number, icon: string) => {
            const p = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
            const t = p < 0.5 ? p * 2 : (1 - p) * 2;
            const pos = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
            const node = makeNode('Walker', map, 44, 44);
            node.setPosition(pos.x, pos.y);
            const wg = node.addComponent(Graphics);
            wg.fillColor = new Color(40, 70, 100, 235);
            wg.circle(0, 0, 18);
            wg.fill();
            wg.lineWidth = 2;
            wg.strokeColor = TEXT;
            wg.circle(0, 0, 18);
            wg.stroke();
            addLabel(node, icon, 22, TEXT, { width: 40 });
        };
        for (const ex of state.expeditions) {
            const target = config.locations.find((l) => l.id === ex.location)?.map;
            if (target) walker(camp0, target, ex.startedAt, ex.returnsAt, '🚶');
        }
        for (const sc of state.scouts ?? []) walker(camp0, sc, sc.startedAt, sc.returnsAt, '🔭');

        // 侦察点
        for (const spot of activeScoutSpots(state, now)) {
            const kind = scoutKind(config, spot.kind);
            if (!kind) continue;
            const node = this.mapMarker(map, spot, kind.icon, kind.name, new Color(214, 150, 40, 235), 22, `🔭 ${formatTime(realSeconds(config, kind.travelMinutes * 60_000))}`);
            node.on(Node.EventType.TOUCH_END, () => {
                const res = camp.sendScout(spot.id, camp.now);
                if (res.ok) this.effect(`🔭 ${res.message}出发去侦察${kind.name}`, ACCENT);
                else this.showToast(res.reason);
                this.render();
            });
        }

        // 标题：已探索多少
        const title = makeNode('Title', map, 330, 38);
        title.setPosition(-MAP_WIDTH / 2 + 175, TOWN_HEIGHT / 2 - 26);
        drawPanel(title.addComponent(Graphics), 330, 38, new Color(20, 22, 20, 210), 19);
        addLabel(title, `🗺️ 枫谷镇 · 已探索 ${Math.round(exploredRatio(config, state, now) * 100)}%`, 20, ACCENT, { width: 320 });

        // 下方：选中地点的详情
        this.cursorY = TOWN_CENTER_Y - TOWN_HEIGHT / 2 - 8;
        this.renderLocationCard(camp, now, statusOf);
    }

    /** 地图上的一个标记：圆形底 + 图标 + 名字（+ 一行小字） */
    private mapMarker(parent: Node, at: { x: number; y: number }, icon: string, name: string, fill: Color, r: number, sub?: string): Node {
        const node = makeNode('Marker', parent, r * 2 + 20, r * 2 + 50);
        node.setPosition(at.x, at.y);
        const g = node.addComponent(Graphics);
        g.fillColor = fill;
        g.circle(0, 0, r);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = new Color(20, 20, 20, 200);
        g.circle(0, 0, r);
        g.stroke();
        addLabel(node, icon, Math.round(r * 1.1), TEXT, { width: r * 2 }).node.setPosition(0, 2);
        const plate = makeNode('Name', node, 150, 24);
        plate.setPosition(0, -r - 14);
        drawPanel(plate.addComponent(Graphics), 150, 24, new Color(15, 17, 15, 200), 12);
        addLabel(plate, name, 16, TEXT, { width: 146, height: 22 });
        if (sub) addLabel(node, sub, 15, ACCENT, { width: 150, height: 20 }).node.setPosition(0, -r - 36);
        return node;
    }

    /** 没有 bg_town 背景图时，画一个简单的小镇：草地、河、主路、树林 */
    private drawTownPlaceholder(map: Node): void {
        const g = map.addComponent(Graphics);
        const w = MAP_WIDTH;
        const h = TOWN_HEIGHT;
        g.fillColor = hexColor('#4a5a3e');
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        // 河
        g.strokeColor = hexColor('#4f7890');
        g.lineWidth = 26;
        g.moveTo(-w / 2, 120);
        g.lineTo(-180, 110);
        g.lineTo(-90, 150);
        g.lineTo(60, 120);
        g.lineTo(w / 2, 170);
        g.stroke();
        // 主路
        g.strokeColor = hexColor('#6b6558');
        g.lineWidth = 14;
        g.moveTo(-w / 2, -300);
        g.lineTo(0, -60);
        g.lineTo(w / 2, -140);
        g.moveTo(0, -60);
        g.lineTo(-20, h / 2);
        g.stroke();
        // 树林
        g.fillColor = hexColor('#34452e');
        for (const [x, y, r] of [[-300, 280, 50], [300, 300, 60], [290, -310, 45], [-60, -330, 40], [320, 40, 35]]) {
            g.circle(x, y, r);
            g.fill();
        }
    }

    /** 地图下面：选中地点的详情和按钮 */
    private renderLocationCard(camp: CampGame, now: number, statusOf: Map<string, string>): void {
        const { config, state } = camp;
        const loc = this.selectedLocation ? config.locations.find((l) => l.id === this.selectedLocation) : undefined;
        const scouting = (state.scouts ?? []).length;
        if (!loc) {
            this.text('点地图上的地点查看详情。金色的小圆点是侦察点，点一下派一个人去。', 20, DIM);
            if (scouting) this.text(`🔭 ${scouting} 个人在外面侦察`, 20, ACCENT);
            return;
        }
        const status = statusOf.get(loc.id);
        if (status === 'rumor') {
            this.text(`❓ 远处还有个地方……`, 24, ACCENT);
            this.text(`解锁条件：${unlockHint(config, state, loc, now)}`, 20, DIM);
            return;
        }
        const squad = suggestSquad(config, state);
        const names = squad.map((id) => survivorInfo(config, state, id)?.name ?? id);
        const drops = (loc.drops ?? []).map((d) => {
            const def = config.props.find((p) => p.id === d.prop);
            return `${def?.icon ?? ''}${def?.name ?? d.prop}`;
        });
        this.text(`${loc.icon ?? ''} ${loc.name}  ⏱${formatTime(realSeconds(config, loc.durationMinutes * 60_000))}  ${status === 'cleared' ? '✅ 已打下' : '⚔️ 未探索'}`, 24, ACCENT);
        this.text(loc.description, 18, DIM);
        this.text(`战利品 ${formatBag(config, expeditionLoot(config, state, loc))}${drops.length ? `   可能找到：${drops.join('、')}` : ''}`, 18);
        const ex = state.expeditions.find((e) => e.location === loc.id);
        if (ex) {
            const left = realSeconds(config, ex.returnsAt - now);
            this.button(`小队在路上，${formatTime(left)} 后回来 · 看广告立即返回`, WIDTH, () => this.speedUpExpedition(ex.id), LEFT, 'normal', 22, 50);
        } else if (restockSecondsLeft(state, loc.id, now) > 0) {
            const left = realSeconds(config, restockSecondsLeft(state, loc.id, now) * 1000);
            this.button(`刚搜刮过，${formatTime(left)} 后物资重新聚起来`, WIDTH, () => {}, LEFT, 'disabled', 22, 50);
        } else {
            const guided = this.isGuided(`explore:${loc.id}`);
            this.button(`${guided ? '👉 ' : ''}派出小队（${names.join('、') || '没有能出发的人'}）`, WIDTH, () => {
                const res = camp.explore(loc.id, camp.now);
                if (res.ok) this.effect(`🚶 小队出发前往${loc.name}`, ACCENT);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, squad.length === 0 ? 'disabled' : guided ? 'highlight' : 'normal', 22, 52);
        }
    }

    private renderReports(camp: CampGame): void {
        const { reports } = camp.state;
        this.button('🎬 看一场演示战斗（预览角色图片，不影响营地）', WIDTH, () => this.openDemo(), LEFT, 'highlight', 22, 52);
        this.gap(12);
        this.text('—— 战报（点“回放”重看整场战斗）——', 22, DIM);
        if (reports.length === 0) this.text('还没有战斗。', 22, DIM);
        for (const r of reports.slice(-6).reverse()) {
            const icon = r.kind === 'raid' ? '🧟' : '🎒';
            this.text(`${icon} ${r.result === 'win' ? '胜利' : '失败'}  ${r.summary}`, 22, r.result === 'win' ? WIN : LOSE);
            this.button('▶ 回放', 160, () => this.openReplay(r));
            this.gap(10);
        }
        this.gap(10);
        this.renderLog(camp);
    }

    private renderLog(camp: CampGame): void {
        this.text('—— 营地日志 ——', 22, DIM);
        for (const entry of camp.state.log.slice(-15).reverse()) this.text(entry.text, 20, DIM);
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
        this.fullScreenMode();
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
        const node = makeNode('Text', this.target!);
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
        const node = makeNode('Banner', this.target!, WIDTH, height);
        node.setPosition(0, this.cursorY - height / 2 - 4);
        drawPanel(node.addComponent(Graphics), WIDTH, height, fill, 10);
        addLabel(node, str, 22, TEXT, { width: WIDTH - 24, height });
        this.cursorY -= height + 8;
    }

    private button(
        str: string,
        width: number,
        onClick: () => void,
        x = LEFT,
        style: ButtonStyle = 'normal',
        size = 22,
        height = 44,
        clickableWhenDisabled = false,
        badge = 0,
    ): void {
        const node = makeNode('Button', this.target!, width, height);
        node.setPosition(x + width / 2, this.cursorY - height / 2);
        const fill = style === 'highlight' ? COLORS.highlight : style === 'disabled' ? COLORS.disabled : COLORS.button;
        drawPanel(node.addComponent(Graphics), width, height, fill, 8, style === 'highlight' ? ACCENT : undefined);
        addLabel(node, str, size, TEXT, { width: width - 12, height });
        addBadge(node, width / 2 - 8, height / 2 - 6, badge);
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

/** 虚线（gap = 0 时画实线） */
function dashedLine(g: Graphics, from: { x: number; y: number }, to: { x: number; y: number }, color: Color, width: number, gap: number): void {
    g.strokeColor = color;
    g.lineWidth = width;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (gap <= 0 || len === 0) {
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
    } else {
        for (let d = 0; d < len; d += gap * 2) {
            const e = Math.min(len, d + gap);
            g.moveTo(from.x + (dx * d) / len, from.y + (dy * d) / len);
            g.lineTo(from.x + (dx * e) / len, from.y + (dy * e) / len);
        }
    }
    g.stroke();
}
