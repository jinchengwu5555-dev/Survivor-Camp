// 原型阶段的界面：全部用代码生成（色块 + 文字 + emoji），先验证玩法，之后再换成正式美术。
// 用法：把这个组件挂到场景的 Canvas 节点上（见 README）。
//
// 结构：
//   Background  背景
//   Content     营地界面（每秒整体重画一次；内容太长时可以上下拖动）
//   Overlay     守夜 / 战斗回放画面（BattleView），打开时隐藏 Content
//   Fx          飘字特效（不会被重画清掉）

import { _decorator, BlockInputEvents, Color, Component, EventTouch, game, Game, Graphics, JsonAsset, Label, Mask, Node, resources, SubContextView, TTFFont, UIOpacity, UITransform } from 'cc';
import { CampGame } from '../core/CampGame';
import { buildingLabel, buildingLockReason, buildingStage, nextBuildingStage, upgradeBlocker } from '../core/buildings';
import {
    barricadeHp,
    battleRegistry,
    currentRaid,
    DOG_FLAG,
    expeditionLoot,
    formatBag,
    DANGER_LEVELS,
    expeditionEnemyBonus,
    expeditionOdds,
    GATE_NAMES,
    isOnExpedition,
    nextRaidIsBloodMoon,
    raidDefenders,
    raidEnemyBonus,
    raidSetup,
    availableFighters,
    locationTier,
    restockSecondsLeft,
    squadOf,
    suggestSquad,
} from '../core/combat';
import { choiceHints } from '../core/events';
import { bedCount, canAfford, economyRates, getBuildingDef, morale, safety, storageCap, survivorBattleLevel, survivorEfficiency, workerSlots } from '../core/economy';
import { availableBounties, bountyProgress, getBounty, hunterRankName } from '../core/bounties';
import { craftBlocker, itemCount, workshopLevel } from '../core/crafting';
import { isUnlocked } from '../core/achievements';
import { seasonAt } from '../core/seasons';
import { loadGame, saveGame } from '../core/save';
import { currentDay, hasFlag } from '../core/state';
import { currentEpisode, objectiveDone, objectiveProgress } from '../core/story';
import { CandidateState, GearSlot, LocationDef, PropDef, HuntingGround, BattleReport, BuildingDef, BuildingLevelDef, DistrictDef, GameConfig, GEAR_SLOTS, LootPiece, RESOURCE_IDS, ResourceBag, SurvivorRow, WatchMode } from '../core/types';
import { validateConfig } from '../core/validate';
import { carryOverAchievements, loadRecords, MetaRecords, recordRun, saveRecords } from '../core/records';
import { survivorInfo, survivorName } from '../core/roster';
import { currentSite } from '../core/siteMods';
import { relocationBlocker, relocationFoodCost, relocationTargets } from '../core/sites';
import { expandConfig } from '../core/configExpand';
import { realSeconds, timeOfDay } from '../core/clock';
import { GlobalRanking, scoreEntry } from '../core/leaderboard';
import { GuideHint, nextHint } from '../core/guide';
import { eventSpeaker, portraitOf } from '../core/portrait';
import { activePickups, pickupKind } from '../core/pickups';
import { activeStragglers } from '../core/stragglers';
import { campZones, clearingEndsAt, clearZoneBlocker, zoneCleared, zoneOfBuilding } from '../core/campzones';
import { dailyChest, dailyProgress, dailyTaskDef } from '../core/daily';
import { idleSurvivors, workersIn } from '../core/workers';
import { traderPresent } from '../core/trader';
import { combatMultiplier, sleepFactor, talentsOf, workMultiplier } from '../core/talents';
import { craftableGear, forgeBlocker, GEAR_SLOT_NAMES, gearInBag, gearOf, gearStatsText } from '../core/gear';
import { campStats } from '../core/campStats';
import { allDialogues } from '../core/chatter';
import { moodFactors, moodTier } from '../core/mood';
import { districtName, locationName, objectiveText, townName } from '../core/names';
import { candidateInfo, dismissBlocker, quirksOf } from '../core/recruits';
import { bondOf, bondPoints, bondTier, BOND_TIERS, daysWithLeader, isFounder, LEADER, prayBlocker, sharedBattles } from '../core/bonds';
import { ROW_NAMES, rowOf, squadSynergies, weaponRange } from '../core/formation';
import { phoenixReady } from '../core/roster';
import { groundLockReason, huntableGame, huntBlocker, huntingGrounds, suggestHunters } from '../core/hunting';
import { goldBlocker, goldOffer, goldValue } from '../core/gold';
import { districtAt, districtDef, districtExplored, suggestSurveyors, surveyBlocker } from '../core/districts';
import { buildVehicleBlocker, FUEL_PROP, haulSections, maxTierOwned, ownedVehicles, pickVehicle, TIER_NAMES, vehicleBlocker, vehicleDef } from '../core/vehicles';
import { occupancy, packedWeight, pieceOf, pieceText, totalCells } from '../core/packing';
import { planWatch, raidChanceTonight, WATCH_MODE_NAMES, watchersNeeded, watchersText } from '../core/watch';
import { statsAtLevel } from '../core/battle/units';
import { campPoint, exploredRatio, isRevealed, locationStatus, prerequisiteOf, revealers, unlockHint } from '../core/townMap';
import { activeScoutSpots, scoutKind } from '../core/scouting';
import { BadgeGroup, farmTodos } from '../core/badges';
import { latestEntries } from '../core/diary';
import { campGates, nextGateUnlock, repairBlocker, wallDurability, wallRepairCost } from '../core/wall';
import { todayIntel } from '../core/intel';
import { AnimalSpace, SPACE_NAMES, spaceOf, animalDef, gardenKeepers, cropDef, dailyFeed, foodGrowth, growMinutes, isGreenhouse, penCapacity, petBlocker, plantBlocker, produceFood, readyPlots } from '../core/farming';
import { formatProps, propBlocker, propCount, propDef, propReward, treasureValue } from '../core/props';
import { createAdService } from '../platform/AdService';
import { audio, initAudio, music, sfx, SfxName } from '../platform/Audio';
import { CocosStorage } from '../platform/CocosStorage';
import { createLeaderboard } from '../platform/Leaderboard';
import { createNetworkService } from '../platform/Network';
import { BattleView } from './BattleView';
import { addBadge, addLabel, COLORS, drawPanel, floatText, formatTime, hexColor, makeNode, punch, setUiFont, styleLabel, wrapText } from './widgets';
import { addSprite, fitSize, getSprite, SPRITE_DIRS } from './sprites';

const { ccclass } = _decorator;

/** 界面右上角显示的版本号：每次更新代码都改一下，方便确认游戏是不是最新的 */
const GAME_VERSION = 'v3.10 打仗时留着资源栏';

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
/** 闲聊气泡在营地地图上显示多久（游戏分钟） */
const CHAT_SHOW_MINUTES = 4;
/** 本地设置：闲聊气泡开关 */
const CHAT_SETTING_KEY = 'doomsday_camp_chat_bubbles';
const CHAT_KIND_ICON: Record<string, string> = { chat: '💬', gossip: '🤫', joke: '😂', warm: '💛', worry: '😟', quarrel: '💢' };
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
/** 小镇地图的迷雾：格子大小、浅雾宽度、深雾里“未知区域”字样的位置 */
const FOG_CELL = 24;
const FOG_EDGE = 44;
const FOG_LABELS = [
    { x: -250, y: 250 },
    { x: 230, y: 300 },
    { x: 270, y: -40 },
    { x: -270, y: -160 },
    { x: 180, y: -300 },
    { x: -40, y: 300 },
];
/** 探索页的小镇地图：占面板上部，下面是选中地点的详情 */
const TOWN_HEIGHT = 730;
const TOWN_CENTER_Y = SHEET_TOP - TOWN_HEIGHT / 2;
/** 建筑在地图上的默认大小（再乘 buildings.json 里 map.scale） */
const BUILDING_BOX = { width: 150, height: 118 };
/** 营地地图上围墙的位置（相对地图中心）：建筑都在墙里面，上面留出尸潮倒计时的位置 */
const CAMP_WALL = { left: -352, right: 352, bottom: -322, top: 282 };
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
const SPECIALTY_NAMES: Record<string, string> = {
    leader: '领袖',
    cook: '厨师',
    medic: '医生',
    mechanic: '机械师',
    scavenger: '拾荒者',
    fighter: '战士',
    farmer: '农夫',
    hunter: '猎人',
    carpenter: '木匠',
    herder: '牧民',
    engineer: '水工',
    scout: '斥候',
    guard: '守卫',
    police: '警察',
    singer: '歌手',
    teacher: '老师',
    official: '政府人员',
    office_worker: '上班族',
    high_schooler: '高中生',
    college_student: '大学生',
};
/** 专长有什么用（显示在候选人卡片和个人档案里） */
const SPECIALTY_TIPS: Record<string, string> = {
    leader: '大家更听指挥',
    cook: '在厨房产量更高',
    medic: '在医务室产量更高',
    mechanic: '在废料场、工坊产量更高',
    scavenger: '打猎更准，搜东西更在行',
    fighter: '打猎更准，能打',
    farmer: '在营地时菜长得更快，钓鱼有耐心',
    hunter: '打猎准得多，钓鱼也不错',
    carpenter: '在营地时建筑升级更快',
    herder: '在营地时牲口更容易生崽，照看牲口心情加更多',
    engineer: '在水站产量更高',
    scout: '侦察、勘察跑得更快',
    guard: '守夜不怎么累',
    police: '受过训练，打仗攻击 +10%',
    singer: '每晚睡前唱几首，大家心情 +1',
    teacher: '普通人，没有专长加成（会讲故事）',
    official: '普通人，没有专长加成（会写报告）',
    office_worker: '普通人，没有专长加成（会做表格）',
    high_schooler: '普通人，没有专长加成（年轻、跑得快）',
    college_student: '普通人，没有专长加成（读过很多书）',
};

/** 营地页上打开的面板：建筑详情、营地地点 */
type Sheet = 'building' | 'sites' | 'trader' | 'props' | 'stats' | 'settings' | 'graveyard' | 'diary' | null;

type ButtonStyle = 'normal' | 'disabled' | 'highlight' | 'danger';
/** 背包的分类页 */
type PropTab = 'all' | 'supply' | 'tool' | 'gear' | 'seed' | 'animal' | 'rare';
const PROP_TABS: { id: PropTab; name: string }[] = [
    { id: 'all', name: '📦 全部' },
    { id: 'supply', name: '🥫 物资' },
    { id: 'tool', name: '🧰 道具' },
    { id: 'gear', name: '⚔️ 装备' },
    { id: 'seed', name: '🌱 种子' },
    { id: 'animal', name: '🐔 牲口' },
    { id: 'rare', name: '🟥 稀有' },
];
/** 道具属于哪一类 */
function propTabOf(def: PropDef): PropTab {
    if (def.rare || def.type === 'treasure') return 'rare';
    if (def.type === 'gear') return 'gear';
    if (def.type === 'seed') return 'seed';
    if (def.type === 'animal') return 'animal';
    if (def.type === 'resource' || def.type === 'heal' || def.type === 'mood') return 'supply';
    return 'tool';
}

/** 工坊的分类页 */
type WorkshopTab = 'items' | 'trap' | 'weapon' | 'armor' | 'tool' | 'bag' | 'garage';
const WORKSHOP_TABS: { id: WorkshopTab; name: string }[] = [
    { id: 'items', name: '🧪 战斗物品' },
    { id: 'trap', name: '🪤 陷阱' },
    { id: 'weapon', name: '⚔️ 武器' },
    { id: 'armor', name: '🛡️ 护甲' },
    { id: 'tool', name: '🔧 工具' },
    { id: 'bag', name: '🎒 背包' },
    { id: 'garage', name: '🚗 车库' },
];

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
    /** 幸存者页选中的人（显示个人档案） */
    private selectedSurvivor: string | null = null;
    /** 刚做完的事件选择：结果卡片（点“继续”后才看下一个事件） */
    private eventResult: { title: string; choice: string; text: string; effects: string } | null = null;
    /** 探索时自己挑的队员（null = 自动编队） */
    private pickedSquad: string[] | null = null;
    /** 设置菜单里“重新开始”按了第一下，等第二下确认 */
    private confirmRestart = false;
    /** 探索页选中的分区（选中时下方显示分区详情和“勘察”） */
    private selectedDistrict: string | null = null;
    /** 出发时选的车：undefined = 自动挑，'walk' = 走路 */
    private selectedVehicle: string | undefined = undefined;
    /** 装背包：选中的战利品、要不要转 90 度 */
    private selectedPiece: number | null = null;
    private pieceRotated = false;
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
    private readonly seenStragglers = new Set<number>();

    onLoad(): void {
        try {
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
            this.chatBubbles = this.storage.getItem(CHAT_SETTING_KEY) !== '0';
            initAudio(makeNode('Audio', this.node), this.storage);
            this.loadFont();
            this.connect();
        } catch (e) {
            this.showCrash(e);
        }
    }

    /** 像素字体（几百 KB），加载完重画一次；失败就继续用系统字体 */
    private loadFont(): void {
        resources.load('fonts/camp_pixel', TTFFont, (err, font) => {
            if (err || !font) {
                console.warn('像素字体加载失败，使用系统字体', err);
                return;
            }
            setUiFont(font);
            this.render();
        });
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
        if (this.crashed) return;
        try {
            this.updateUnsafe(dt);
        } catch (e) {
            this.showCrash(e);
        }
    }

    private updateUnsafe(dt: number): void {
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
            // 打仗时资源栏照样每秒刷新（修门花木材，要看得到还剩多少）
            if (this.battleView) this.renderHud(this.camp, this.camp.now);
            music(this.battleView ? 'night' : 'day');
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
            try {
                this.onConfigLoaded(err, assets);
            } catch (e) {
                this.showCrash(e);
            }
        });
    }

    private onConfigLoaded(err: Error | null, assets: JsonAsset[]): void {
        {
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
                this.showFatal(`配置表有错误（代码版本 ${GAME_VERSION}）：\n${errors.slice(0, 10).join('\n')}\n\n如果刚更新过代码：代码版本不是最新的，说明编辑器还在用旧的脚本缓存。请在 Cocos 菜单“开发者 → 缓存 → 清除代码缓存”后重启编辑器，预览页面按 Ctrl+Shift+R 强制刷新。`);
                return;
            }
            this.config = config;
            const saved = loadGame(this.storage, config);
            this.setCamp(saved ? new CampGame(config, saved) : this.newRun(config, Date.now()));
            // 读到的是已经覆灭的存档：说明上次覆灭时已经记录过了
            this.runRecorded = !!saved?.gameOver;
            this.goOnline();
            this.render();
        }
    }

    private setCamp(camp: CampGame): void {
        // 界面开着：尸潮来了由玩家亲手守夜
        camp.liveRaids = true;
        this.camp = camp;
        this.seenLevels = {};
        this.rareCounts = null;
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
            if (b.level > before) {
                const bdef = getBuildingDef(config, b.id);
                const stage = bdef?.stages?.find((st) => st.level === b.level);
                if (bdef && stage && b.level > 1) this.effect(`✨ ${bdef.name}变成了${stage.icon}${stage.name}！`, WIN, 32, 'build');
                else this.effect(`⬆️ ${bdef ? buildingLabel(bdef, b.level) : ''} 升到 ${b.level} 级！`, WIN, 30, 'build');
            }
            this.seenLevels[b.id] = b.level;
        }
        for (const r of state.reports) {
            if (r.id <= this.seenReportId) continue;
            this.seenReportId = r.id;
            if (r.kind === 'expedition') this.effect(`${r.result === 'win' ? '🎒' : '🏃'} ${r.summary}`, r.result === 'win' ? WIN : LOSE, 24, r.result === 'win' ? 'coin' : 'lose');
            else if (r.title === '游荡的丧尸') this.effect(`🧟 ${r.summary}`, r.result === 'win' ? ACCENT : LOSE, 22, 'hit');
        }
        for (const g of activeStragglers(state)) {
            if (this.seenStragglers.has(g.id)) continue;
            this.seenStragglers.add(g.id);
            this.effect('🧟 有一小群丧尸朝营地晃过来了！点门口的牌子迎战（和守夜一样打）', LOSE, 26, 'alarm');
        }
        const raidLeft = realSeconds(config, state.nextRaidAt - camp.now);
        if (currentRaid(config, state, camp.now) && raidLeft <= 15 && !state.pendingRaid) {
            if (!this.raidWarned) this.effect('🧟 尸潮快到了！准备守夜！', LOSE, 32, 'alarm');
            this.raidWarned = true;
        } else {
            this.raidWarned = false;
        }
        for (const f of camp.newUnlocks.splice(0)) {
            this.effect(`🔓 新功能：${f.icon}${f.name}`, ACCENT, 32, 'win');
            this.toast = f.text;
            this.toastUntil = Date.now() + 6000;
        }
        if (camp.newAchievements.length > 0) {
            const names = camp.newAchievements.map((a) => `${a.icon}${a.name}`).join('、');
            camp.newAchievements.length = 0;
            this.effect(`🏆 解锁成就：${names}`, ACCENT, 28, 'win');
        }
    }

    /** 屏幕中间飘一行字 */
    private effect(text: string, color: Color, size = 26, sound: SfxName = color === LOSE ? 'error' : 'confirm'): void {
        sfx(sound);
        if (this.fx) floatText(this.fx, text, 0, 80, color, size, 120, 2.2);
    }

    // ---------- 守夜 / 回放 ----------

    private openLiveRaid(): void {
        const camp = this.camp;
        const live = camp?.liveRaid();
        if (!camp || !live || !this.overlay) return;
        this.openBattle(
            new BattleView(this.overlay, {
                title: live.pending.stragglers ? `☀️ 白天：${live.pending.title}` : `🌙 守夜：${live.pending.title}`,
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
        if (this.camp) this.renderHud(this.camp, this.camp.now);
    }

    private closeBattle(): void {
        this.battleView?.destroy();
        this.battleView = null;
        this.setMainVisible(true);
        this.render();
    }

    /** 战斗画面打开时隐藏主界面（否则点击会穿透到下面的地图和按钮）；上面的资源栏一直留着 */
    private setMainVisible(visible: boolean): void {
        for (const node of [this.content, this.mapLayer, this.nav]) if (node) node.active = visible;
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

    /** 正在处理事件（或者在看事件选择的结果） */
    private eventShowing(camp: CampGame): boolean {
        return !!camp.currentEvent || this.eventResult !== null || !!camp.currentHaul || camp.pendingCandidates.length > 0;
    }

    /** 有没有打开的面板（事件、页签、建筑详情……）；没有就显示营地地图 */
    private sheetOpen(camp: CampGame): boolean {
        return this.eventShowing(camp) || this.tab !== 'camp' || this.sheet !== null;
    }

    /** 背包的分类页 */
    private propTab: PropTab = 'all';
    /** 探索页：小镇地图，还是狩猎钓鱼页 */
    private exploreMode: 'map' | 'hunt' = 'map';
    /** 换人要点两次：候选人 id:要离开的人 id */
    private confirmSwap: string | null = null;
    /** 宰杀要点两次：第一次点记下是哪一种 */
    private confirmSlaughter: string | null = null;
    /** 闲聊气泡：开关（设置里改，存在本地）、是否展开 */
    private chatBubbles = true;
    private chatExpanded = false;

    /** 稀有品（出大红）的数量：背包里的 + 等着装包的；变多了就全屏提示 */
    private rareCounts: Record<string, number> | null = null;

    private checkRareLoot(camp: CampGame): void {
        const { config, state } = camp;
        const counts: Record<string, number> = {};
        for (const p of config.props) {
            if (!p.rare) continue;
            const inHauls = (state.pendingHauls ?? []).reduce((n, h) => n + h.pieces.filter((x) => x.kind === 'prop' && x.item === p.id).reduce((m, x) => m + x.amount, 0), 0);
            counts[p.id] = propCount(state, p.id) + inHauls;
        }
        const before = this.rareCounts;
        this.rareCounts = counts;
        if (!before) return;
        const gained = config.props.filter((p) => p.rare && (counts[p.id] ?? 0) > (before[p.id] ?? 0));
        if (!gained.length || !this.fx) return;
        const names = gained.map((p) => `${p.icon}${p.name}`).join('、');
        floatText(this.fx, '🟥 出大红了！', 0, 160, hexColor('#ff4040'), 52, 60, 3);
        floatText(this.fx, names, 0, 90, COLORS.crit, 36, 60, 3);
    }

    /** 出错时不要留一块空白屏：把错误显示出来，方便截图反馈 */
    private crashed: string | null = null;

    private showCrash(e: unknown): void {
        const err = e instanceof Error ? e : new Error(String(e));
        this.crashed = `${err.message}\n${(err.stack ?? '').split('\n').slice(1, 6).join('\n')}`;
        console.error('游戏出错了', err);
        try {
            if (!this.content) return;
            this.fullScreenMode();
            this.text(`😵 游戏出错了（${GAME_VERSION}）`, 30, LOSE);
            this.text('请把这个画面截图发给开发者：', 20, DIM);
            this.text(this.crashed, 18, TEXT);
        } catch (inner) {
            console.error('连错误画面都画不出来', inner);
        }
    }

    private render(): void {
        if (this.crashed) return;
        try {
            this.renderUnsafe();
        } catch (e) {
            this.showCrash(e);
        }
    }

    private renderUnsafe(): void {
        const camp = this.camp;
        if (!camp || !this.content || this.battleView) return;
        this.checkRareLoot(camp);
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
        this.setFriendView(this.tab === 'rank' && !this.eventShowing(camp));
        this.renderHud(camp, now);
        this.renderNav(camp);

        this.content.destroyAllChildren();
        this.mapLayer!.destroyAllChildren();
        this.target = this.content;
        if (this.sheetOpen(camp)) {
            // 面板：状态栏和导航之间，可以上下拖动（探索页上面是地图，往上拖能看到下面选中地点的详情和出发按钮）
            this.viewTop = SHEET_TOP;
            this.viewHeight = SHEET_TOP - NAV_TOP;
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
        const fighting = !!this.battleView;
        const { season, dayInSeason } = seasonAt(config, state, now);
        const site = currentSite(config, state);
        // 左边的文字只占到右边按钮前面，按钮不会压住文字
        const line = (text: string, size: number, color: Color, y: number, width = WIDTH) =>
            addLabel(bar, text, size, color, { width, align: 'left' }).node.setPosition(-WIDTH / 2 + width / 2, y - centerY);
        line(`${GAME_VERSION}${camp.paused ? '   ⏸ 已暂停' : ''}${camp.speed > 1 ? `   ⏩×${camp.speed}` : ''}`, 14, camp.paused ? LOSE : DIM, 628, WIDTH - 260);
        // 右上角：设置（暂停、倍速、重新开始、玩法说明），放在背包左边，不贴着屏幕顶
        const gear = makeNode('Settings', bar, 56, 46);
        gear.setPosition(WIDTH / 2 - 158, 603 - centerY);
        drawPanel(gear.addComponent(Graphics), 56, 46, this.sheet === 'settings' ? COLORS.highlight : COLORS.button, 10, ACCENT, 2);
        addLabel(gear, camp.paused ? '▶' : '⚙️', 22, TEXT, { width: 52 });
        gear.on(Node.EventType.TOUCH_END, () => {
            punch(gear);
            this.tab = 'camp';
            this.sheet = this.sheet === 'settings' ? null : 'settings';
            this.confirmRestart = false;
            this.resetScroll();
            this.render();
        });
        // 第几天、几点、离入夜还有多久（入夜 = 尸潮可能来的时候）
        const tod = timeOfDay(config, state, now);
        const clock = `${String(tod.hour).padStart(2, '0')}:${String(tod.minute).padStart(2, '0')}`;
        const nightSoon = tod.nightInMs !== null && tod.nightInMs < 15 * 60_000;
        const nightText = tod.nightInMs === null ? '' : tod.nightInMs <= 0 ? '  🌙 夜里' : `  🌙 ${formatTime(realSeconds(config, tod.nightInMs))} 后入夜`;
        line(`第 ${currentDay(config, state, now)} 天  🕗${clock}${nightText}`, 24, nightSoon ? LOSE : ACCENT, 603, WIDTH - 196);
        line(this.resourceLine(config, camp, now), 20, TEXT, 570);
        line(`${season.icon}${season.name}·第${dayInSeason}天 ${site?.icon ?? ''}${site?.name ?? ''}  士气 ${Math.round(morale(state))}  安全 ${safety(config, state)}  人数 ${state.survivors.length}/${bedCount(config, state)}  战斗 Lv${survivorBattleLevel(config, state)}  🏆${this.records.bestDays}天`, 17, DIM, 538, WIDTH - 230);

        // 跳到晚上（数值按钮左边）
        const skip = makeNode('Skip', bar, 100, 34);
        skip.setPosition(WIDTH / 2 - 172, 538 - centerY);
        drawPanel(skip.addComponent(Graphics), 100, 34, nightSoon ? COLORS.highlight : COLORS.button, 8, ACCENT, 2);
        addLabel(skip, tod.nightInMs === null ? '⏩ 下一天' : '⏩ 跳到晚上', 16, TEXT, { width: 96 });
        skip.on(Node.EventType.TOUCH_END, () => {
            if (this.eventShowing(camp)) return;
            punch(skip);
            const res = camp.skipToNight(camp.now);
            if (res.ok) this.effect(`🌙 ${res.message ?? ''}`, ACCENT, 30);
            else this.showToast(res.reason);
            this.save();
            this.render();
        });

        // 右下角：全部数值
        const statsBtn = makeNode('Stats', bar, 110, 34);
        statsBtn.setPosition(WIDTH / 2 - 55, 538 - centerY);
        drawPanel(statsBtn.addComponent(Graphics), 110, 34, this.sheet === 'stats' ? COLORS.highlight : COLORS.button, 8, ACCENT, 2);
        addLabel(statsBtn, '📊 数值', 18, TEXT, { width: 104 });
        statsBtn.on(Node.EventType.TOUCH_END, () => {
            if (this.eventShowing(camp)) return;
            punch(statsBtn);
            this.tab = 'camp';
            this.sheet = this.sheet === 'stats' ? null : 'stats';
            this.resetScroll();
            this.render();
        });

        // 右上角：背包
        const totalProps = Object.values(state.props ?? {}).reduce((sum, n) => sum + n, 0);
        const bag = makeNode('Bag', bar, 120, 46);
        bag.setPosition(WIDTH / 2 - 60, 603 - centerY);
        drawPanel(bag.addComponent(Graphics), 120, 46, this.sheet === 'props' ? COLORS.highlight : COLORS.button, 10, ACCENT, 2);
        addLabel(bag, `🎒背包 ${totalProps}`, 20, TEXT, { width: 112 });
        addBadge(bag, 54, 18, camp.badges().props);
        bag.on(Node.EventType.TOUCH_END, () => {
            if (this.eventShowing(camp)) return;
            punch(bag);
            this.tab = 'camp';
            this.sheet = this.sheet === 'props' ? null : 'props';
            this.resetScroll();
            this.render();
        });
        // 打仗时资源栏只看不点（设置、背包这些按钮会跳走）
        if (fighting) {
            const block = makeNode('HudBlock', hud, 720, height);
            block.setPosition(0, centerY);
            block.addComponent(BlockInputEvents);
        }
    }

    private renderNav(camp: CampGame): void {
        const nav = this.nav!;
        nav.destroyAllChildren();
        const height = NAV_TOP - NAV_BOTTOM;
        const bar = makeNode('NavBar', nav, 720, height);
        bar.setPosition(0, (NAV_TOP + NAV_BOTTOM) / 2);
        bar.addComponent(BlockInputEvents);
        drawPanel(bar.addComponent(Graphics), 720, height, COLORS.panel, 0);
        // 有事件要处理时，先处理事件
        const event = this.eventShowing(camp);
        const w = (WIDTH - 10 * (TABS_PER_ROW - 1)) / TABS_PER_ROW;
        const badges = camp.badges();
        this.target = nav;
        // 新手节奏：还没解锁的页签不显示
        const tabs = TABS.filter(([tab]) => camp.unlocked(tab));
        if (!tabs.some(([tab]) => tab === this.tab)) this.tab = 'camp';
        tabs.forEach(([tab, name], i) => {
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
                this.selectedSurvivor = null;
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

        this.drawCampFence(map, camp, state.buildings.wall?.level ?? 0, wallDurability(state));
        const guided = this.guide?.target?.match(/^(upgrade|speedup):(.+)$/)?.[2];
        config.buildings.forEach((def, i) => {
            // 还没清理的地上不画建筑（那里是一堆瓦砾）
            const zone = zoneOfBuilding(config, def);
            if (zone && !zoneCleared(config, state, zone.id)) return;
            this.renderMapBuilding(map, camp, def, i, now, guided === def.id);
        });
        this.renderZones(map, camp, now);
        this.drawIdlePeople(map, camp, now);
        this.renderStragglers(map, camp, now);

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
            const chance = Math.round(raidChanceTonight(config, state, now) * 100);
            addLabel(pill, `🌙 ${formatTime(left)} 后入夜：${chance}% 会有${name}`, left <= 15 ? 21 : 18, LOSE, { width: 440 });
        }

        // 营地闲聊：默认只显示一条细细的气泡（不挡建筑），点一下展开整段，再点收起；设置里可以关掉
        const talk = (state.chatter ?? [])[(state.chatter ?? []).length - 1];
        if (this.chatBubbles && talk && now - talk.at < CHAT_SHOW_MINUTES * 60_000) {
            const tag = CHAT_KIND_ICON[talk.kind] ?? '💬';
            const all = talk.lines.slice(0, 4).map((l, i) => `${i === 0 ? tag : '　'} ${survivorName(config, state, l.who)}：${l.text}`);
            const lines = this.chatExpanded ? all : [`${all[0]}${all.length > 1 ? '  ▼' : ''}`];
            const h = 12 + lines.length * 26;
            const bw = this.chatExpanded ? 640 : 520;
            const bubble = makeNode('Chat', map, bw, h);
            bubble.setPosition(0, MAP_HEIGHT / 2 - 62 - h / 2);
            drawPanel(bubble.addComponent(Graphics), bw, h, new Color(250, 246, 232, this.chatExpanded ? 230 : 170), 12, new Color(120, 100, 70), 2);
            lines.forEach((text, i) => {
                addLabel(bubble, text, 17, new Color(50, 40, 30), { width: bw - 20, align: 'left' }).node.setPosition(0, h / 2 - 19 - i * 26);
            });
            bubble.on(Node.EventType.TOUCH_END, () => {
                if (this.dragDistance > DRAG_THRESHOLD) return;
                this.chatExpanded = !this.chatExpanded;
                this.render();
            });
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

        // 日记：营地右下角，有新的一篇时带红点
        const diaryEntries = state.diary ?? [];
        if (diaryEntries.length > 0) {
            const book = makeNode('Diary', map, 110, 64);
            book.setPosition(-150, -292);
            drawPanel(book.addComponent(Graphics), 106, 60, new Color(80, 64, 44, 230), 12, new Color(180, 150, 110), 2);
            addLabel(book, '📖', 26, TEXT, { width: 100 }).node.setPosition(0, 10);
            addLabel(book, `日记 ${diaryEntries.length}`, 16, TEXT, { width: 100 }).node.setPosition(0, -18);
            const unread = camp.badges().diary;
            if (unread > 0) addBadge(book, 48, 24, unread);
            book.on(Node.EventType.TOUCH_END, () => {
                if (this.dragDistance > DRAG_THRESHOLD) return;
                punch(book);
                this.sheet = 'diary';
                this.resetScroll();
                this.render();
            });
        }

        // 墓地：有人死了才出现，在营地左下角
        const graves = state.graveyard ?? [];
        if (graves.length > 0) {
            const yard = makeNode('Graveyard', map, 120, 70);
            yard.setPosition(-270, -245);
            drawPanel(yard.addComponent(Graphics), 116, 64, new Color(60, 66, 60, 230), 12, new Color(150, 160, 150), 2);
            addLabel(yard, '🪦'.repeat(Math.min(3, graves.length)), 26, TEXT, { width: 110 }).node.setPosition(0, 10);
            addLabel(yard, `墓地 ${graves.length}`, 16, TEXT, { width: 110 }).node.setPosition(0, -20);
            yard.on(Node.EventType.TOUCH_END, () => {
                punch(yard);
                this.sheet = 'graveyard';
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
     * 营地的围墙（俯视，和守夜画面一样）：方形围墙四面各一个门，建筑都在墙里面。
     * 墙的厚度和颜色随栅栏等级变化：0 级只有散落的货架，越往后越厚越结实；门的颜色随耐久变暗。
     */
    private drawCampFence(map: Node, camp: CampGame, level: number, durability: number): void {
        const node = makeNode('Fence', map, MAP_WIDTH, MAP_HEIGHT);
        const g = node.addComponent(Graphics);
        const { left, right, bottom, top } = this.campWall(camp);
        const style =
            level >= 13
                ? { color: hexColor('#6a7a86'), edge: hexColor('#a0b0bc'), width: 14 }
                : level >= 8
                  ? { color: hexColor('#4e5e6c'), edge: hexColor('#8a9eae'), width: 12 }
                  : level >= 4
                    ? { color: hexColor('#3a4a58'), edge: hexColor('#6a7e8e'), width: 10 }
                    : level >= 1
                      ? { color: hexColor('#5a4a34'), edge: hexColor('#8a7050'), width: 7 }
                      : { color: new Color(90, 80, 60, 150), edge: new Color(120, 100, 70, 150), width: 4 };
        const gap = 46;
        const cx = (left + right) / 2;
        const cy = (bottom + top) / 2;
        const w = style.width;
        // 四条墙，中间留门
        // 只有开了的门才在墙上留缺口（0 北、1 东、2 南、3 西，随栅栏等级一个个开）
        const open = campGates(camp.config, camp.state);
        const gN = open.includes(0) ? gap : 0;
        const gS = open.includes(2) ? gap : 0;
        const gW = open.includes(3) ? gap : 0;
        const gE = open.includes(1) ? gap : 0;
        const segs: [number, number, number, number][] = [
            [left, top - w / 2, cx - gN - left, w],
            [cx + gN, top - w / 2, right - cx - gN, w],
            [left, bottom - w / 2, cx - gS - left, w],
            [cx + gS, bottom - w / 2, right - cx - gS, w],
            [left - w / 2, bottom, w, cy - gW - bottom],
            [left - w / 2, cy + gW, w, top - cy - gW],
            [right - w / 2, bottom, w, cy - gE - bottom],
            [right - w / 2, cy + gE, w, top - cy - gE],
        ];
        for (const [x, y, sw, sh] of segs) {
            g.fillColor = style.color;
            g.rect(x, y, sw, sh);
            g.fill();
            g.strokeColor = style.edge;
            g.lineWidth = 1;
            g.rect(x, y, sw, sh);
            g.stroke();
        }
        if (level <= 0) return;
        // 四个木门：耐久越低颜色越暗
        const k = 0.45 + 0.55 * Math.max(0, Math.min(1, durability / 100));
        const gateFill = new Color(Math.round(122 * k), Math.round(90 * k), Math.round(52 * k));
        const gates: [number, number, number, number][] = [
            ...(gN ? [[cx - gap, top - w / 2 - 3, gap * 2, w + 6] as [number, number, number, number]] : []),
            ...(gS ? [[cx - gap, bottom - w / 2 - 3, gap * 2, w + 6] as [number, number, number, number]] : []),
            ...(gW ? [[left - w / 2 - 3, cy - gap, w + 6, gap * 2] as [number, number, number, number]] : []),
            ...(gE ? [[right - w / 2 - 3, cy - gap, w + 6, gap * 2] as [number, number, number, number]] : []),
        ];
        for (const [x, y, gw, gh] of gates) {
            g.fillColor = gateFill;
            g.rect(x, y, gw, gh);
            g.fill();
            g.strokeColor = hexColor('#c09a5a');
            g.lineWidth = 2;
            g.rect(x, y, gw, gh);
            g.stroke();
        }
    }

    /** 没有 bg_camp 背景图时：俯视的营地地面（墙外深色，墙里稍亮） */
    private drawMapPlaceholder(map: Node, camp: CampGame): void {
        const g = map.addComponent(Graphics);
        const w = MAP_WIDTH;
        const h = MAP_HEIGHT;
        g.fillColor = hexColor('#141a1c');
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        const { left, right, bottom, top } = this.campWall(camp);
        g.fillColor = hexColor('#1b2326');
        g.rect(left, bottom, right - left, top - bottom);
        g.fill();
        // 还没清理的地：一堆堆的货架、废车、瓦砾
        for (const z of campZones(camp.config)) {
            if (zoneCleared(camp.config, camp.state, z.id)) continue;
            const { x1, x2, y1, y2 } = z.rect;
            g.fillColor = hexColor('#171d20');
            g.rect(x1 + 4, y1 + 4, x2 - x1 - 8, y2 - y1 - 8);
            g.fill();
            for (let k = 0; k < 26; k++) {
                const rx = x1 + 14 + ((k * 53) % Math.max(1, x2 - x1 - 40));
                const ry = y1 + 14 + ((k * 97) % Math.max(1, y2 - y1 - 40));
                const shade = 40 + ((k * 17) % 30);
                g.fillColor = new Color(shade + 10, shade, shade - 8);
                g.rect(rx, ry, 14 + (k % 4) * 8, 8 + (k % 3) * 6);
                g.fill();
            }
        }
        // 地上淡淡的格子
        g.strokeColor = new Color(255, 255, 255, 10);
        g.lineWidth = 1;
        for (let x = left + 60; x < right; x += 60) {
            g.moveTo(x, bottom);
            g.lineTo(x, top);
        }
        for (let y = bottom + 60; y < top; y += 60) {
            g.moveTo(left, y);
            g.lineTo(right, y);
        }
        g.stroke();
        const site = currentSite(camp.config, camp.state);
        addLabel(map, `${site?.icon ?? ''} ${site?.name ?? ''}`, 18, new Color(255, 220, 150, 120), { width: 300 }).node.setPosition(-200, bottom - 22);
    }

    /** 围墙围住的范围：清理出来的地合在一起（没有空地配置就是整张地图） */
    private campWall(camp: CampGame): { left: number; right: number; bottom: number; top: number } {
        const zones = campZones(camp.config).filter((z) => zoneCleared(camp.config, camp.state, z.id));
        if (!zones.length) return CAMP_WALL;
        return {
            left: Math.max(CAMP_WALL.left, Math.min(...zones.map((z) => z.rect.x1))),
            right: Math.min(CAMP_WALL.right, Math.max(...zones.map((z) => z.rect.x2))),
            bottom: Math.max(CAMP_WALL.bottom, Math.min(...zones.map((z) => z.rect.y1))),
            top: Math.min(CAMP_WALL.top, Math.max(...zones.map((z) => z.rect.y2))),
        };
    }

    /** 没清理的地：中间一块牌子（要什么条件 / 花多少清理 / 还要多久），点了开始清理 */
    private renderZones(map: Node, camp: CampGame, now: number): void {
        const { config, state } = camp;
        for (const z of campZones(config)) {
            if (zoneCleared(config, state, z.id)) continue;
            const cx = (z.rect.x1 + z.rect.x2) / 2;
            const cy = (z.rect.y1 + z.rect.y2) / 2;
            const w = Math.min(170, z.rect.x2 - z.rect.x1 - 12);
            const node = makeNode('Zone', map, w, 96);
            node.setPosition(cx, cy);
            const ends = clearingEndsAt(state, z.id);
            const blocker = clearZoneBlocker(config, state, z.id);
            const ready = blocker === null;
            drawPanel(node.addComponent(Graphics), w, 96, new Color(30, 34, 36, 235), 12, ready ? WIN : ends !== null ? ACCENT : new Color(110, 110, 110), 2);
            addLabel(node, `${z.icon} ${z.name}`, 18, TEXT, { width: w - 10 }).node.setPosition(0, 28);
            const line =
                ends !== null
                    ? `🧹 清理中 ${formatTime(realSeconds(config, ends - now))}`
                    : z.requires?.hq && blocker === `需要指挥部 ${z.requires.hq} 级`
                      ? `🔒 指挥部 ${z.requires.hq} 级`
                      : `🧹 清理 ${formatCost(config, z.cost ?? {})}`;
            addLabel(node, line, 16, ready ? WIN : ends !== null ? ACCENT : DIM, { width: w - 10 }).node.setPosition(0, 2);
            addLabel(node, ends !== null ? '' : `⏱ ${formatTime(realSeconds(config, (z.minutes ?? 0) * 60_000))}`, 15, DIM, { width: w - 10 }).node.setPosition(0, -24);
            node.on(Node.EventType.TOUCH_END, () => {
                if (this.dragDistance > DRAG_THRESHOLD) return;
                punch(node);
                const res = camp.clearZone(z.id, camp.now);
                if (res.ok) this.effect(`🧹 ${res.message ?? ''}`, ACCENT, 26);
                else this.showToast(`${z.name}：${res.reason}。${z.description}`);
                this.save();
                this.render();
            });
        }
    }

    /** 白天晃到门外的丧尸：门口一团紫色小点 + “点我清理”的牌子，点了打一场小仗并回放 */
    private renderStragglers(map: Node, camp: CampGame, now: number): void {
        const { config, state } = camp;
        const { left, right, bottom, top } = this.campWall(camp);
        const cx = (left + right) / 2;
        const cy = (bottom + top) / 2;
        // 北、东、南、西：门的位置和朝外的方向
        const gates = [
            { x: cx, y: top, nx: 0, ny: 1 },
            { x: right, y: cy, nx: 1, ny: 0 },
            { x: cx, y: bottom, nx: 0, ny: -1 },
            { x: left, y: cy, nx: -1, ny: 0 },
        ];
        for (const group of activeStragglers(state)) {
            const gate = gates[group.gate] ?? gates[0];
            const node = makeNode('Stragglers', map, 10, 10);
            const g = node.addComponent(Graphics);
            // 门外一团紫色小点（越接近门口越挤）
            const t = now / 600;
            group.enemies.forEach((_, i) => {
                const along = ((i % 4) - 1.5) * 16 + Math.sin(t + i) * 3;
                const out = 10 + Math.floor(i / 4) * 14;
                g.fillColor = hexColor('#9a5ad0');
                g.circle(gate.x + gate.nx * out - gate.ny * along, gate.y + gate.ny * out + gate.nx * along, 7);
                g.fill();
            });
            const left2 = realSeconds(config, group.arriveAt - now);
            const pw = 230;
            const pill = makeNode('StragglerPill', map, pw, 40);
            pill.setPosition(gate.x - gate.nx * 130, gate.y - gate.ny * 46);
            drawPanel(pill.addComponent(Graphics), pw, 40, new Color(60, 24, 70, 235), 20, hexColor('#d090ff'), 2);
            addLabel(pill, `🧟×${group.enemies.length} ${formatTime(left2)} 点我迎战`, 19, TEXT, { width: pw - 10 });
            pill.on(Node.EventType.TOUCH_END, () => {
                if (this.dragDistance > DRAG_THRESHOLD) return;
                punch(pill);
                const res = camp.clearStragglers(group.id, camp.now);
                if (!res.ok) this.showToast(res.reason);
                else if (camp.liveRaid()) this.openLiveRaid();
                this.save();
            });
        }
    }

    /** 闲着的人：营地中间走来走去的小圆点（颜色是角色的主色） */
    private drawIdlePeople(map: Node, camp: CampGame, now: number): void {
        const { config, state } = camp;
        const idle = state.survivors.filter((s) => !s.assignment && !isOnExpedition(state, s.id));
        if (!idle.length) return;
        const node = makeNode('Idle', map, 10, 10);
        const g = node.addComponent(Graphics);
        const t = now / 4000;
        idle.slice(0, 10).forEach((s, i) => {
            const a = i * 2.1 + t * (0.6 + (i % 3) * 0.2);
            const x = Math.cos(a) * (40 + (i % 4) * 16);
            const y = -35 + Math.sin(a * 1.3) * 26;
            g.fillColor = hexColor(portraitOf(config, state, s.id)?.color ?? '#7a8a7a');
            g.circle(x, y, 8);
            g.fill();
            g.strokeColor = new Color(20, 20, 20, 220);
            g.lineWidth = 2;
            g.circle(x, y, 8);
            g.stroke();
        });
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
        // 每个升级阶段可以有自己的图（building_kitchen_2 = 第 2 个阶段“烤架”），没有就用 building_kitchen
        const stageIndex = (def.stages ?? []).filter((st) => b.level >= st.level).length || 1;
        const art = getSprite(`${SPRITE_DIRS.buildings}building_${def.id}_${stageIndex}`) || getSprite(`${SPRITE_DIRS.buildings}building_${def.id}`);
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
            // 俯视的房顶：深色方块，建好的描亮边，没建的是虚影
            drawPanel(g, bw, bh, b.level === 0 ? new Color(40, 46, 50, 140) : hexColor('#2c383e'), 8, b.level === 0 ? new Color(90, 100, 106, 160) : hexColor('#6a8290'), 2);
            addLabel(node, buildingStage(def, b.level).icon, Math.round(46 * scale), TEXT, { width: bw }).node.setPosition(0, 8);
        }

        // 名字 + 等级
        const plateW = Math.max(120, bw - 10);
        const plate = makeNode('Plate', node, plateW, 30);
        plate.setPosition(0, -bh / 2 + 4);
        drawPanel(plate.addComponent(Graphics), plateW, 30, new Color(20, 22, 20, 210), 15);
        const lockReason = buildingLockReason(def, state);
        addLabel(plate, b.level > 0 ? `${buildingStage(def, b.level).name} Lv${b.level}` : lockReason ? `🔒${buildingStage(def, 0).name}` : `${buildingStage(def, 0).name}（未建）`, 18, b.level > 0 ? TEXT : DIM, { width: plateW - 8 });
        if (lockReason) addLabel(node, lockReason.replace('才能建', ''), 15, DIM, { width: bw + 30 }).node.setPosition(0, -bh / 2 - 22);
        // 栅栏带伤：名牌下面写耐久
        if (def.id === 'wall' && b.level > 0 && wallDurability(state) < 100) {
            addLabel(node, `🧱 耐久 ${wallDurability(state)}% 点我修`, 16, wallDurability(state) < 60 ? LOSE : ACCENT, { width: bw + 40 }).node.setPosition(0, -bh / 2 - 22);
        }

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

        // 菜园、畜栏有事可做：左上角一个小气泡（🧺 收菜、🌱 能种、🥚 收蛋、🤗 照看、⚠️ 挨饿）
        if (def.id === 'garden' || def.id === 'pen') {
            const todos = farmTodos(config, state, now)[def.id];
            if (todos.length) {
                const tw = 20 + todos.length * 28;
                const tag = makeNode('FarmTodo', node, tw, 32);
                tag.setPosition(-bw / 2 + tw / 2 - 4, bh / 2 - 6);
                drawPanel(tag.addComponent(Graphics), tw, 32, new Color(30, 60, 30, 230), 16, WIN, 2);
                addLabel(tag, todos.join(''), 20, TEXT, { width: tw - 4 });
            }
        }

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
            const goals = ep.objectives.map((o) => `${objectiveDone(config, state, o, now) ? '✅' : '⬜'}${objectiveText(config, state, o)}`).join('  ');
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
        if (this.eventResult) {
            this.renderEventResult(camp);
            return;
        }
        if (camp.currentHaul) {
            this.renderHaul(camp);
            return;
        }
        if (camp.pendingCandidates.length > 0) {
            this.renderCandidates(camp, camp.pendingCandidates);
            return;
        }
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
            } else if (this.sheet === 'stats') {
                this.renderCampStats(camp, now);
            } else if (this.sheet === 'settings') {
                this.renderSettings(camp, now);
            } else if (this.sheet === 'graveyard') {
                this.renderGraveyard(camp, now);
            } else if (this.sheet === 'diary') {
                this.renderDiary(camp);
                camp.markSeen('diary');
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

    /** 设置：暂停 / 继续、重新开始（要按两次确认）、玩法说明、版本 */
    private renderSettings(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text('⚙️ 设置', 28, ACCENT);
        this.text(`${townName(state)} · 第 ${currentDay(config, state, now)} 天 · ${state.survivors.length} 人 · ${GAME_VERSION}`, 18, DIM);
        this.gap(10);
        this.button('📖 伊森的日记', WIDTH, () => {
            this.sheet = 'diary';
            this.resetScroll();
            this.render();
        }, LEFT, 'normal', 24, 56);
        this.gap(10);
        // 倍速：时间走得更快（尸潮、产出、探索都一起变快）
        this.text(`⏩ 时间倍速：现在 ×${camp.speed}（加速玩的天数，排行榜可能按真实时长截断）`, 20, DIM);
        const third = (WIDTH - 20) / 3;
        const speedRow = this.cursorY;
        [1, 2, 4].forEach((sp, i) => {
            this.cursorY = speedRow;
            this.button(`×${sp}`, third, () => {
                camp.setSpeed(sp);
                this.save();
                this.render();
            }, LEFT + i * (third + 10), camp.speed === sp ? 'highlight' : 'normal', 24, 50);
        });
        this.gap(10);
        this.button('🌙 直接跳到晚上', WIDTH, () => {
            const res = camp.skipToNight(camp.now);
            if (res.ok) {
                this.sheet = null;
                this.effect(`🌙 ${res.message ?? ''}`, ACCENT, 30);
            } else this.showToast(res.reason);
            this.save();
            this.render();
        }, LEFT, 'normal', 24, 56);
        this.gap(10);
        this.button(this.chatBubbles ? '💬 营地闲聊气泡：开（点一下关掉）' : '💬 营地闲聊气泡：关（点一下打开）', WIDTH, () => {
            this.chatBubbles = !this.chatBubbles;
            try {
                this.storage.setItem(CHAT_SETTING_KEY, this.chatBubbles ? '1' : '0');
            } catch {
                // 存不了也没关系
            }
            this.render();
        }, LEFT, 'normal', 22, 52);
        this.gap(10);
        const half = (WIDTH - 10) / 2;
        const soundRow = this.cursorY;
        const au = audio();
        this.button(`🔊 音效：${au?.sfxOn !== false ? '开' : '关'}`, half, () => {
            au?.setSfx(!au.sfxOn);
            sfx('click');
            this.render();
        }, LEFT, au?.sfxOn !== false ? 'normal' : 'disabled', 22, 52, true);
        this.cursorY = soundRow;
        this.button(`🎵 音乐：${au?.musicOn !== false ? '开' : '关'}`, half, () => {
            au?.setMusic(!au.musicOn);
            this.render();
        }, LEFT + half + 10, au?.musicOn !== false ? 'normal' : 'disabled', 22, 52, true);
        this.gap(10);
        this.button(camp.paused ? '▶ 继续游戏' : '⏸ 暂停游戏（时间停住，尸潮也不会来）', WIDTH, () => {
            camp.setPaused(!camp.paused, Date.now());
            this.save();
            this.render();
        }, LEFT, camp.paused ? 'highlight' : 'normal', 24, 56);
        this.gap(10);
        this.button(this.confirmRestart ? '⚠️ 真的要放弃这个营地吗？再点一次确认' : '🔄 重新开始（放弃现在的营地，开一局新的）', WIDTH, () => {
            if (!this.confirmRestart) {
                this.confirmRestart = true;
                this.render();
                return;
            }
            this.confirmRestart = false;
            this.setCamp(this.newRun(config, Date.now()));
            this.runRecorded = false;
            this.newBest = false;
            this.tab = 'camp';
            this.sheet = null;
            this.selectedSurvivor = null;
            this.selectedLocation = null;
            this.selectedDistrict = null;
            this.save();
            this.effect('🏕️ 新的营地，新的小镇', ACCENT, 30);
            this.render();
        }, LEFT, this.confirmRestart ? 'highlight' : 'normal', 22, 56);
        if (this.confirmRestart) {
            this.gap(6);
            this.button('算了，不重新开始', WIDTH, () => {
                this.confirmRestart = false;
                this.render();
            }, LEFT, 'normal', 22, 48);
        }
        this.gap(14);
        this.text('📖 玩法说明', 24, ACCENT);
        for (const line of HELP_LINES) this.text(line, 18);
        this.gap(10);
        this.text(`🏆 最长纪录 ${this.records.bestDays} 天 · 已经建过 ${this.records.runs} 个营地`, 18, DIM);
    }

    /** 营地数值总览（HUD 右下角“📊 数值”） */
    private renderCampStats(camp: CampGame, now: number): void {
        this.text('📊 营地数值', 28, ACCENT);
        for (const group of campStats(camp.config, camp.state, now)) {
            this.gap(8);
            this.text(group.title, 22, ACCENT);
            for (const row of group.rows) {
                const top = this.cursorY;
                const node = makeNode('StatRow', this.content!, WIDTH, 32);
                node.setPosition(0, top - 16);
                addLabel(node, row.label, 20, DIM, { width: WIDTH / 2 - 10, align: 'left' }).node.setPosition(-WIDTH / 4, 0);
                addLabel(node, row.value, 20, row.warn ? LOSE : TEXT, { width: WIDTH / 2 + 60, align: 'right' }).node.setPosition(WIDTH / 4 - 30, 0);
                this.cursorY = top - 34;
            }
        }
        // 最近的闲聊
        const chats = [...(camp.state.chatter ?? [])].reverse();
        if (chats.length) {
            this.gap(8);
            this.text(`💬 营地里的闲聊（已听过 ${camp.state.chatterSeen?.length ?? 0}/${allDialogues(camp.config).length} 段）`, 22, ACCENT);
            for (const c of chats) {
                for (const l of c.lines) this.text(`${survivorName(camp.config, camp.state, l.who)}：${l.text}`, 18, TEXT);
                this.gap(8);
            }
        }
    }

    /** 黄金：前期能换物资，越往后越不值钱 */
    private renderGold(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const g = config.balance.gold;
        if (!g) return;
        const value = goldValue(config, state, now);
        const note = value >= 1 ? '镇上还有人认钱' : value > 0 ? `越来越没人要了（现在只值 ${Math.round(value * 100)}%，第 ${g.worthlessDay} 天后一文不值）` : '已经没人要黄金了，它现在只是块金属';
        this.text(`💰 黄金 ${state.gold ?? 0} 两 · ${note}`, 22, value > 0 ? ACCENT : DIM);
        if (value <= 0 || (state.gold ?? 0) <= 0) {
            this.gap(10);
            return;
        }
        const ids = RESOURCE_IDS.filter((id) => (g.rates[id] ?? 0) > 0);
        const w = (WIDTH - 10 * (ids.length - 1)) / ids.length;
        const top = this.cursorY;
        ids.forEach((id, i) => {
            this.cursorY = top;
            const icon = config.resources.find((r) => r.id === id)?.icon ?? id;
            const blocker = goldBlocker(config, state, id, now);
            this.button(`${g.lot}两→${icon}${goldOffer(config, state, id, now)}`, w, () => {
                const res = camp.spendGold(id, camp.now);
                if (res.ok) this.effect(`💰 换到 ${res.message}`, WIN);
                else this.showToast(res.reason);
                this.render();
            }, LEFT + i * (w + 10), blocker ? 'disabled' : 'normal', 16, 44);
        });
        this.gap(14);
    }

    /** 背包：每种道具一行，写清楚效果，点“使用” */
    private renderProps(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text('🎒 背包', 28, ACCENT);
        this.text('探索、守夜、拾荒、每日宝箱、商人和事件都会得到道具。', 20, DIM);
        this.gap(8);
        this.renderGold(camp, now);
        const allOwned = config.props.filter((p) => propCount(state, p.id) > 0);
        // 分类页：每类显示有几样
        const per = 4;
        const w = (WIDTH - 10 * (per - 1)) / per;
        PROP_TABS.forEach((t, i) => {
            if (i % per === 0 && i > 0) this.gap(8);
            const row = this.cursorY;
            const n = allOwned.filter((p) => propTabOf(p) === t.id).reduce((sum, p) => sum + propCount(state, p.id), 0);
            this.button(`${t.name}${n ? ` ${n}` : ''}`, w, () => {
                this.propTab = t.id;
                this.resetScroll();
                this.render();
            }, LEFT + (i % per) * (w + 10), this.propTab === t.id ? 'highlight' : 'normal', 18, 42);
            if (i % per !== per - 1 && i !== PROP_TABS.length - 1) this.cursorY = row;
        });
        this.gap(12);
        const owned = this.propTab === 'all' ? allOwned : allOwned.filter((p) => propTabOf(p) === this.propTab);
        if (owned.length === 0) this.text(allOwned.length ? '这一类是空的。' : '背包是空的。', 22, DIM);
        for (const def of owned) {
            const count = propCount(state, def.id);
            const blocker = propBlocker(config, state, def.id);
            let effect = def.description;
            if (def.type === 'resource') effect = `打开得到 ${formatBag(config, propReward(config, state, def))}`;
            if (def.type === 'speedup') effect = `正在升级的建筑加速 ${formatTime(realSeconds(config, (def.minutes ?? 0) * 60_000))}（在线时间）`;
            if (def.type === 'gear') effect = `${GEAR_SLOT_NAMES[def.slot!]}：${gearStatsText(config, def)}。${def.description}`;
            if (def.type === 'treasure') effect = `🟥稀有 · 卖掉得到 ${formatBag(config, treasureValue(config, state, def, now))}${traderPresent(state, now) ? '（商人在营地，卖得更贵）' : '（商人来的时候卖更值钱）'}。${def.description}`;
            this.text(`${def.icon} ${def.name} ×${count}   ${effect}`, 22);
            const half = (WIDTH - 10) / 2;
            if (def.type === 'gear') {
                this.button('去幸存者档案里给人穿上', half, () => {
                    this.sheet = null;
                    this.tab = 'survivors';
                    this.resetScroll();
                    this.render();
                }, LEFT, 'normal', 22, 48);
                this.gap(12);
                continue;
            }
            const verb = def.type === 'seed' ? '种下' : def.type === 'animal' ? '放进畜栏' : def.type === 'flare' ? '🎆 发射' : def.type === 'treasure' ? '💰 卖掉' : '使用';
            this.button(blocker ? `${verb}（${blocker}）` : verb, half, () => {
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
            .join('  ') + ((state.gold ?? 0) > 0 && goldValue(config, state, now) > 0 ? `  💰${state.gold}` : '');
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
        // 左上角对齐：不管 Cocos 算出来的框多宽，文字都从头像右边开始
        const bodyTf = bodyLabel.node.getComponent(UITransform)!;
        bodyTf.setAnchorPoint(0, 1);
        bodyTf.width = textWidth;
        bodyLabel.node.setPosition(-WIDTH / 2 + 160, cardHeight / 2 - 70);

        this.cursorY = top - cardHeight - 16;
        // 有人上门：先看看他们的表面信息（隐藏的毛病看不出来，只有一个印象）
        const visitors = state.visitors?.event === event.id ? state.visitors.people : [];
        for (const v of visitors) {
            const info = candidateInfo(config, v);
            this.text(`🚪 ${info.name} · ${info.title} · 专长：${SPECIALTY_NAMES[info.specialty] ?? '—'}（${SPECIALTY_TIPS[info.specialty] ?? ''}）${info.traits.length ? ` · 性格：${info.traits.join('、')}` : ''}`, 20, ACCENT);
            const looks = quirksOf(config, v.survivor).map((q) => (q.hidden ? `❓${q.hint}` : `${q.icon}${q.name}（${q.hint}）`));
            this.text(`　印象：${looks.length ? looks.join('；') : '看起来是个普通人'}`, 18, DIM);
        }
        if (visitors.length) this.gap(6);
        event.choices.forEach((choice, i) => {
            const affordable = canAfford(state, choice.cost);
            this.button(choice.text, WIDTH, () => {
                const res = camp.choose(i, camp.now);
                if (!res.ok) {
                    this.showToast(res.reason ?? '');
                } else {
                    this.eventResult = { title: event.title, choice: choice.text, text: res.outcomeText ?? '', effects: res.effectsText ?? '' };
                    this.resetScroll();
                }
                this.render();
            }, LEFT, affordable ? 'normal' : 'disabled', 24, 60);
            // 选项提示：花费、结果随机、有风险、可能有收获
            const hints = choiceHints(config, choice);
            if (hints.length) this.text(`　${hints.join('　')}${affordable ? '' : '　（资源不够）'}`, 18, affordable ? DIM : COLORS.danger);
            this.gap(12);
        });
    }

    /** 事件选择的结果：发生了什么 + 实际得失，点“继续”再看下一个事件 */
    private renderEventResult(camp: CampGame): void {
        const r = this.eventResult!;
        this.text(`【${r.title}】`, 30, ACCENT);
        this.text(`你选择了：${r.choice}`, 20, DIM);
        this.gap(8);
        if (r.text) this.text(r.text, 24);
        this.gap(10);
        this.banner(r.effects ? `结果：${r.effects}` : '结果：没有什么变化', COLORS.panelLight);
        this.gap(10);
        const more = camp.currentEvent ? '继续（还有事件）' : '继续';
        this.button(more, WIDTH, () => {
            this.eventResult = null;
            this.resetScroll();
            this.render();
        }, LEFT, 'highlight', 26, 64);
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
        const stage = buildingStage(def, b.level);
        this.text(`${stage.icon} ${stage.name}（${def.name} Lv${b.level}）`, 26, ACCENT);
        this.text(`${stage.description ?? ''} ${def.description}`, 20);
        const upcoming = nextBuildingStage(def, b.level);
        if (upcoming) this.text(`⬆️ 升到 ${upcoming.level} 级会变成 ${upcoming.icon}${upcoming.name}`, 20, WIN);
        if (def.stages?.length) this.text(`阶段：${def.stages.map((st) => `${b.level >= st.level ? '' : '🔒'}${st.icon}${st.name}(${st.level})`).join(' → ')}`, 18, DIM);
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
            const label = `${b.level === 0 ? '建造' : '升级'}  ${formatCostHave(config, state.resources, next.cost)}`;
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
        if (def.id === 'wall' && b.level > 0) this.renderWallRepair(camp);
        if (def.id === 'garden' && b.level > 0) this.renderGarden(camp, now);
        if (def.id === 'pen' && b.level > 0) this.renderPen(camp, now, 'pen');
        if (def.id === 'pond' && b.level > 0) this.renderPen(camp, now, 'pond');
    }

    /** 栅栏：耐久和修补（守夜打坏的部分会留到下一晚） */
    private renderWallRepair(camp: CampGame): void {
        const { config, state } = camp;
        const gates = campGates(config, state).map((g) => GATE_NAMES[g]).join('、');
        const next = nextGateUnlock(config, state);
        this.text(`🚪 现在的门：${gates}${next ? `（栅栏升到 ${next.level} 级开${GATE_NAMES[next.gate]}）` : '（四面都有门了）'}。门越多尸群越分散，但要守的口子也越多`, 20, ACCENT);
        const durability = wallDurability(state);
        this.text(`🧱 耐久 ${durability}%${durability < 100 ? '：守夜时被打坏了，不修的话下一晚栅栏会带着伤出场' : '：完好'}`, 22, durability < 60 ? LOSE : durability < 100 ? ACCENT : WIN);
        if (durability < 100) {
            const blocker = repairBlocker(config, state);
            const cost = wallRepairCost(config, state);
            this.button(blocker ? `🔨 修补栅栏 🪵${Math.floor(state.resources.wood)}/${cost}（${blocker}）` : `🔨 修补栅栏（🪵${cost}）`, WIDTH, () => {
                const res = camp.repairWall(camp.now);
                if (res.ok) this.effect(`🔨 ${res.message}`, WIN);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, blocker ? 'disabled' : 'highlight', 22, 52);
        }
        this.gap(8);
    }

    /** 菜园：每块地种着什么、还要多久；收获；用种子种下 */
    private renderGarden(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const f = config.farming;
        const farm = state.farm;
        if (!f || !farm) return;
        const season = seasonAt(config, state, now).season;
        const growth = f.seasonGrowth[season.id] ?? 1;
        const greenhouse = isGreenhouse(config, state);
        this.text(`—— 菜地 ${farm.plots.length} 块 ——`, 22, DIM);
        this.text(
            growth <= 0 && !greenhouse
                ? `${season.icon}${season.name}天地冻住了，露天种不了（菜园升到 ${f.greenhouseLevel} 级变成温室大棚就能种）`
                : `${season.icon}${season.name}天：生长速度 ×${(greenhouse && growth <= 0 ? f.greenhouseWinter : growth).toFixed(2)}${greenhouse ? '（温室大棚）' : ''}；农夫在营地时长得更快`,
            18,
            DIM,
        );
        farm.plots.forEach((p, i) => {
            if (!p) {
                this.text(`第 ${i + 1} 块：空地`, 20, DIM);
                return;
            }
            const crop = cropDef(config, p.crop);
            const name = `${crop?.icon ?? ''}${crop?.name ?? p.crop}`;
            const more = p.left ? `（之后还能收 ${p.left} 次）` : '';
            if (p.readyAt > now) this.text(`第 ${i + 1} 块：${name} · 还要 ${formatTime(realSeconds(config, p.readyAt - now))}${more}`, 20);
            else this.text(`第 ${i + 1} 块：${name} ✅ 熟了！${formatTime(realSeconds(config, p.readyAt + f.witherMinutes * 60_000 - now))} 后会烂在地里`, 20, WIN);
        });
        const keepers = gardenKeepers(state);
        this.text(
            keepers.length
                ? `👷 ${keepers.map((id) => survivorName(config, state, id)).join('、')}在看守菜园：熟了自动收，空地自动种上最划算的种子`
                : '💡 在上面“派一个人来”看守菜园，就不用每次自己种、自己收了',
            18,
            keepers.length ? WIN : DIM,
        );
        const ready = readyPlots(config, state, now);
        this.button(ready > 0 ? `🧺 收获（${ready} 块熟了）` : '🧺 还没有熟的', WIDTH, () => {
            const res = camp.harvest(camp.now);
            if (res.ok) this.effect(`🧺 ${res.message}`, WIN, 24);
            else this.showToast(res.reason);
            this.render();
        }, LEFT, ready > 0 ? 'highlight' : 'disabled', 22, 52);
        this.gap(6);
        this.text('种什么（种子用掉一颗，收获时会拿回 1～3 颗）：', 20, DIM);
        const growthBonus = foodGrowth(config, state);
        const noSeeds: string[] = [];
        for (const crop of f.crops) {
            const seeds = state.props?.[crop.seed] ?? 0;
            if (seeds <= 0) {
                noSeeds.push(`${crop.icon}${crop.name}`);
                continue;
            }
            const blocker = plantBlocker(config, state, crop.id, now);
            const yieldText = RESOURCE_IDS.filter((id) => crop.yield[id])
                .map((id) => `${config.resources.find((r) => r.id === id)?.icon ?? id}${Math.round(crop.yield[id]! * (id === 'food' ? growthBonus : 1))}`)
                .join(' ');
            const minutes = growMinutes(config, state, crop, now);
            const time = Number.isFinite(minutes) ? formatTime(realSeconds(config, minutes * 60_000)) : '—';
            const label = `${crop.icon}种${crop.name}（种子×${seeds} · ${time} · ${yieldText}${crop.harvests && crop.harvests > 1 ? ` · 能收 ${crop.harvests} 次` : ''}）`;
            this.button(blocker ? `${label} ${blocker}` : label, WIDTH, () => {
                const res = camp.plant(crop.id, camp.now);
                if (res.ok) this.effect(`🌱 ${res.message}`, WIN);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, blocker ? 'disabled' : 'normal', 20, 46);
            this.gap(4);
        }
        if (noSeeds.length) this.text(`没有种子：${noSeeds.join(' ')}。种子可以在探索、勘察中找到，也能跟商人换。`, 18, DIM);
        this.gap(8);
    }

    /** 畜栏：养了什么、每天吃多少；收蛋、照看、宰杀 */
    private renderPen(camp: CampGame, now: number, space: AnimalSpace = 'pen'): void {
        const { config, state } = camp;
        const f = config.farming;
        const farm = state.farm;
        if (!f || !farm) return;
        const place = SPACE_NAMES[space];
        const level = state.buildings[space]?.level ?? 0;
        const kinds = f.animals.filter((a) => spaceOf(a) === space);
        const mine = Object.entries(farm.animals).filter(([id, n]) => n > 0 && spaceOf(animalDef(config, id)) === space);
        const total = mine.reduce((sum, [, n]) => sum + n, 0);
        this.text(`—— ${place} ${total}/${penCapacity(config, state, space)} ——`, 22, DIM);
        // 能养什么：先养小的，升级后能养大的
        this.text(
            `能养：${kinds.map((a) => (level >= (a.minLevel ?? 1) ? `${a.icon}${a.name}` : `🔒${a.name}(${a.minLevel}级)`)).join('  ')}`,
            18,
            TEXT,
        );
        if (total === 0) {
            this.text(
                space === 'pond'
                    ? '还没有鱼。钓鱼时有机会带活鱼回来（鲫鱼、草鱼、鲶鱼），商人和河边码头有鱼苗。'
                    : '还没有牲口。打猎时有机会活捉（走失的鸡、野兔、山羊……），商人有时也卖小鸡、兔子。',
                20,
                DIM,
            );
        } else {
            const feed = dailyFeed(config, state);
            this.text(`每天换日时喂一次（畜栏和鱼塘一起）：🍞${feed}${farm.hunger > 0 ? `  ⚠️ 已经饿了 ${farm.hunger} 天，再饿下去会饿死！` : ''}`, 20, farm.hunger > 0 ? LOSE : TEXT);
            const growth = foodGrowth(config, state);
            for (const [id, n] of mine) {
                const a = animalDef(config, id)!;
                const product = a.product ? `每只每天 ${a.product.icon}${a.product.name}` : '不产东西';
                this.text(`${a.icon}${a.name} ×${n}  · 每只吃🍞${a.feed} · ${product} · 两只以上会${space === 'pond' ? '产卵' : '生崽'}`, 20);
            }
            void growth;
        }
        if (space === 'pen') this.renderPenCare(camp, now, mine);
        // 宰杀放在最下面，而且要点两次确认，免得点错
        if (mine.length) {
            this.gap(16);
            this.text(space === 'pond' ? '—— 🎣 捞鱼（捞上来就吃掉了）——' : '—— 🔪 宰杀（宰了就没了，点两次确认）——', 18, LOSE);
            const growth = foodGrowth(config, state);
            for (const [id] of mine) {
                const a = animalDef(config, id)!;
                const key = `${space}:${id}`;
                const confirming = this.confirmSlaughter === key;
                this.button(
                    confirming ? `⚠️ 真的要${space === 'pond' ? '捞' : '宰'}一只${a.name}吗？再点一次确认` : `${space === 'pond' ? '🎣 捞一条' : '🔪 宰一只'}${a.name}（🍞+${Math.round(a.meat * growth)}）`,
                    WIDTH,
                    () => {
                        if (!confirming) {
                            this.confirmSlaughter = key;
                            this.render();
                            return;
                        }
                        this.confirmSlaughter = null;
                        const res = camp.slaughter(id, camp.now);
                        if (res.ok) this.effect(`🔪 ${res.message}`, ACCENT);
                        else this.showToast(res.reason);
                        this.render();
                    },
                    LEFT,
                    confirming ? 'danger' : 'disabled',
                    18,
                    40,
                    true,
                );
                this.gap(4);
            }
        }
        this.gap(8);
    }

    /** 畜栏：收蛋奶、照看 */
    private renderPenCare(camp: CampGame, now: number, mine: [string, number][]): void {
        const { config, state } = camp;
        const f = config.farming!;
        const farm = state.farm!;
        // 收蛋 / 奶：只有养了会下蛋、产奶的牲口才显示
        if (mine.some(([id]) => animalDef(config, id)?.product)) {
            const produce = produceFood(config, state);
            const items = Object.entries(farm.produce)
                .filter(([, n]) => n > 0)
                .map(([id, n]) => `${animalDef(config, id)?.product?.icon ?? ''}${animalDef(config, id)?.product?.name ?? ''}×${n}`)
                .join(' ');
            this.button(produce > 0 ? `🧺 收 ${items}（🍞+${produce}）` : '🧺 还没有可以收的（吃饱了每天换日时下蛋、产奶）', WIDTH, () => {
                const res = camp.collectProduce(camp.now);
                if (res.ok) this.effect(`🧺 ${res.message}`, WIN, 24);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, produce > 0 ? 'highlight' : 'disabled', 22, 52);
            this.gap(6);
        }
        const petBlock = petBlocker(config, state, now);
        this.button(petBlock ? `🤗 照看牲口（${petBlock}）` : `🤗 照看牲口（全员心情 +${f.petMood}，每天一次）`, WIDTH, () => {
            const res = camp.petAnimals(camp.now);
            if (res.ok) this.effect(`🤗 ${res.message}`, WIN);
            else this.showToast(res.reason);
            this.render();
        }, LEFT, petBlock ? 'disabled' : 'normal', 22, 52);
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

    /** 工坊：分类，每一类一个页面（战斗物品、武器、护甲、工具、背包、车库） */
    private workshopTab: WorkshopTab = 'items';

    private renderWorkshop(camp: CampGame): void {
        const { config, state } = camp;
        const level = workshopLevel(config, state);
        this.text(level > 0 ? `🔧 工坊 ${level} 级` : '🔧 工坊（先在营地里建造工坊）', 24, ACCENT);
        // 分类按钮：两行，每行四个
        const per = 4;
        const w = (WIDTH - 10 * (per - 1)) / per;
        WORKSHOP_TABS.forEach((t, i) => {
            if (i % per === 0 && i > 0) this.gap(8);
            const row = this.cursorY;
            this.button(t.name, w, () => {
                this.workshopTab = t.id;
                this.resetScroll();
                this.render();
            }, LEFT + (i % per) * (w + 10), this.workshopTab === t.id ? 'highlight' : 'normal', 20, 44);
            if (i % per !== per - 1 && i !== WORKSHOP_TABS.length - 1) this.cursorY = row;
        });
        this.gap(12);
        const tab = this.workshopTab;
        if (tab === 'items' || tab === 'trap') {
            this.text(tab === 'trap' ? '陷阱：守夜时装在栅栏上，丧尸冲到栅栏下自动触发一次，每种每晚带一个，触发了才扣。' : '战斗物品：守夜和探索时自动使用，用掉才扣。', 18, DIM);
            this.gap(4);
            for (const item of config.items.filter((x) => !!x.trap === (tab === 'trap'))) {
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
            return;
        }
        if (tab === 'garage') {
            this.text(`交通工具决定能去多远、背包多大。⛽ 汽油 ${propCount(state, FUEL_PROP)} 桶`, 18, DIM);
            this.gap(4);
            const owned = new Set(ownedVehicles(config, state).map((v) => v.id));
            for (const v of config.vehicles ?? []) {
                const has = owned.has(v.id);
                this.text(`${v.icon}${v.name}${has ? ' ✅' : ''}  能到：${TIER_NAMES[v.tier]}能去的地方 · 背包 ${v.grid[0]}×${v.grid[1]} · 多装 ${v.cargo} 重 · ${v.fuel ? `每趟 ⛽${v.fuel}` : '不用油'}`, 20, has ? WIN : TEXT);
                this.text(v.description, 17, DIM);
                if (!has && v.obtain) {
                    const blocker = buildVehicleBlocker(config, state, v.id);
                    this.button(`🔧 修好它 ${formatCost(config, v.obtain.cost)}${blocker ? `（${blocker}）` : ''}`, WIDTH, () => {
                        const res = camp.buildVehicle(v.id, camp.now);
                        if (res.ok) this.effect(`🔧 修好了${res.message}！`, WIN, 30);
                        else this.showToast(res.reason);
                        this.render();
                    }, LEFT, blocker ? 'disabled' : 'normal', 20, 46);
                } else if (!has && v.comesWith) {
                    this.text(`（${survivorName(config, state, v.comesWith)}加入营地时会开过来）`, 17, DIM);
                }
                this.gap(8);
            }

            return;
        }
        // 装备：按位置分页（做好放进背包，到幸存者档案里穿上）
        const slot = tab as GearSlot;
        this.text(`${GEAR_SLOT_NAMES[slot]}：做好放进背包，到幸存者档案里给人穿上。`, 18, DIM);
        this.gap(4);
        const list = craftableGear(config).filter((d) => d.slot === slot);
        if (!list.length) this.text('这一类暂时没有能打造的，只能在外面找到。', 20, DIM);
        for (const def of craftableGear(config).filter((d) => d.slot === slot)) {
            this.text(`${def.icon}${def.name} ×${propCount(state, def.id)}  ${GEAR_SLOT_NAMES[def.slot!]}：${gearStatsText(config, def)}`, 22);
            const blocker = forgeBlocker(config, state, def.id);
            this.button(`打造 ${formatCost(config, def.craft!.cost)}${blocker ? `（${blocker}）` : ''}`, WIDTH, () => {
                const res = camp.forge(def.id, camp.now);
                if (res.ok) this.effect(`${def.icon} 打造了${def.name}`, WIN);
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

    /** 幸存者页：名单（卡片），点一个人看他的档案、安排他去哪里干活 */
    private renderSurvivors(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const picked = this.selectedSurvivor ? state.survivors.find((s) => s.id === this.selectedSurvivor) : undefined;
        // 门口等着的人（营地满了让他们先等）：有空床位就能留下
        const waiting = camp.candidates.filter((c) => c.waiting);
        if (!picked && waiting.length) {
            this.renderCandidates(camp, waiting, true);
            this.gap(10);
        }
        if (picked) {
            this.renderSurvivorDetail(camp, picked.id, now);
            return;
        }
        this.selectedSurvivor = null;
        this.text(`—— 幸存者 ${state.survivors.length}/${bedCount(config, state)}（点人物看档案、安排工作）——`, 22, DIM);
        // 新手引导“安排人手”：高亮“一键安排工作”
        const idle = idleSurvivors(state).length;
        this.button(`${this.isGuided('assign') ? '👉 ' : ''}一键安排工作（闲着 ${idle} 人）`, WIDTH, () => {
            const res = camp.autoAssign(camp.now);
            if (res.ok) this.effect(`👷 ${res.message}`, WIN);
            else this.showToast(res.reason);
            this.render();
        }, LEFT, idle === 0 ? 'disabled' : this.isGuided('assign') ? 'highlight' : 'normal', 24, 56);
        this.gap(10);
        // 今晚的守夜安排
        const watchers = planWatch(config, state);
        const needed = watchersNeeded(config, state);
        this.text(
            `🌙 今晚守夜（需要 ${needed} 人）：${watchersText(config, state, watchers)}${watchers.length < needed ? '  ⚠️人手不够' : ''}   尸潮概率 ${Math.round(raidChanceTonight(config, state, now) * 100)}%`,
            20,
            watchers.length < needed ? LOSE : DIM,
        );
        this.gap(6);
        const cardW = (WIDTH - 10) / 2;
        const cardH = 132;
        state.survivors.forEach((s, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const top = this.cursorY - row * (cardH + 10);
            const info = survivorInfo(config, state, s.id);
            const node = makeNode('SurvivorCard', this.content!, cardW, cardH);
            node.setPosition(LEFT + col * (cardW + 10) + cardW / 2, top - cardH / 2);
            drawPanel(node.addComponent(Graphics), cardW, cardH, COLORS.panelLight, 12, s.injured ? LOSE : undefined, 2);
            this.drawPortrait(node, camp, s.id, -cardW / 2 + 48, 8, 36);
            const textX = 40;
            const textW = cardW - 100;
            const bond = bondOf(config, state, s, now);
            addLabel(node, `${isFounder(state, s) && s.id !== LEADER ? '⚜️' : ''}${info?.name ?? s.id}`, 24, s.id === LEADER ? ACCENT : hexColor(bond.color), { width: textW, align: 'left' }).node.setPosition(textX, 38);
            addLabel(node, `${info?.title ?? ''} · ${SPECIALTY_NAMES[info?.specialty ?? ''] ?? ''}`, 16, DIM, { width: textW, align: 'left' }).node.setPosition(textX, 14);
            addLabel(node, this.survivorStatus(camp, s.id, now), 18, s.injured ? LOSE : ACCENT, { width: textW, align: 'left' }).node.setPosition(textX, -12);
            const talents = talentsOf(config, state, s.id).map((t) => t.icon + t.name).join(' ');
            const gear = gearOf(config, state, s.id).map((g) => g.icon).join('');
            addLabel(node, `${moodTier(s.mood).icon}${Math.round(s.mood)} ${sleepText(s.sleep)}${watchers.includes(s.id) ? ' 🌙' : ''} ${gear}`, 16, (s.sleep ?? 100) < 50 ? LOSE : TEXT, { width: textW, align: 'left' }).node.setPosition(textX, -38);
            addLabel(node, talents, 15, DIM, { width: textW, align: 'left' }).node.setPosition(textX, -58);
            node.on(Node.EventType.TOUCH_END, () => {
                if (this.dragDistance > DRAG_THRESHOLD) return;
                punch(node);
                this.selectedSurvivor = s.id;
                this.resetScroll();
                this.render();
            });
        });
        this.cursorY -= Math.ceil(state.survivors.length / 2) * (cardH + 10) + 6;
    }

    /** 一个人现在在干什么 */
    private survivorStatus(camp: CampGame, id: string, now: number): string {
        const { config, state } = camp;
        const s = state.survivors.find((x) => x.id === id)!;
        if (s.injured) return `🩹 养伤 ${s.recoverAt !== null ? formatTime(realSeconds(config, s.recoverAt - now)) : ''}`;
        if (state.expeditions.some((e) => e.squad.includes(id))) return '🚶 外出探索';
        if ((state.scouts ?? []).some((x) => x.survivor === id)) return '🔭 外出侦察';
        if ((state.hunts ?? []).some((x) => x.squad.includes(id))) return '🏹 外出打猎';
        if ((state.surveys ?? []).some((x) => x.squad.includes(id))) return '🗺️ 外出勘察';
        if (s.assignment) return `👷 ${getBuildingDef(config, s.assignment)?.name ?? ''}`;
        return '💤 空闲';
    }

    /** 头像：有图用图（sprites/portraits/portrait_<id>），没图画角色颜色的圆 + 名字首字 */
    private drawPortrait(parent: Node, camp: CampGame, id: string, x: number, y: number, r: number): void {
        const p = portraitOf(camp.config, camp.state, id);
        const node = makeNode('Portrait', parent, r * 2, r * 2);
        node.setPosition(x, y);
        const g = node.addComponent(Graphics);
        g.fillColor = hexColor(p?.color ?? '#6a6a6a');
        g.circle(0, 0, r);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = TEXT;
        g.circle(0, 0, r);
        g.stroke();
        const face = p ? getSprite(SPRITE_DIRS.portraits + p.sprite) : null;
        if (face) {
            const size = fitSize(face, r * 2.4, r * 2.4);
            addSprite(node, face, size.width, size.height).setPosition(0, r * 0.15);
        } else {
            addLabel(node, (p?.name ?? '?').slice(0, 1), Math.round(r * 0.9), TEXT, { width: r * 2 });
        }
    }

    /** 个人档案：介绍、性格、天赋、战斗能力，以及安排工作 */
    private renderSurvivorDetail(camp: CampGame, id: string, now: number): void {
        const { config, state } = camp;
        const s = state.survivors.find((x) => x.id === id)!;
        const info = survivorInfo(config, state, id);
        this.button('← 返回名单', 200, () => {
            this.selectedSurvivor = null;
            this.resetScroll();
            this.render();
        }, LEFT, 'normal', 22, 44);
        this.gap(10);

        // 头部：大头像 + 名字、身份、专长
        const headH = 150;
        const head = makeNode('Head', this.content!, WIDTH, headH);
        head.setPosition(0, this.cursorY - headH / 2);
        drawPanel(head.addComponent(Graphics), WIDTH, headH, COLORS.panel, 14, ACCENT, 2);
        this.drawPortrait(head, camp, id, -WIDTH / 2 + 80, 0, 58);
        const hx = 70;
        const hw = WIDTH - 180;
        addLabel(head, `${info?.name ?? id}${info?.isHero ? ' ⭐' : ''}`, 34, ACCENT, { width: hw, align: 'left' }).node.setPosition(hx, 42);
        addLabel(head, `${info?.title ?? ''}   专长：${SPECIALTY_NAMES[info?.specialty ?? ''] ?? '—'}`, 20, TEXT, { width: hw, align: 'left' }).node.setPosition(hx, 6);
        addLabel(head, `${this.survivorStatus(camp, id, now)}   ${moodTier(s.mood).icon} ${moodTier(s.mood).name} ${Math.round(s.mood)}   ${sleepText(s.sleep)}`, 20, s.injured ? LOSE : DIM, { width: hw, align: 'left' }).node.setPosition(hx, -28);
        const unitId = info?.battleUnit;
        if (unitId && battleRegistry(config).hasUnit(unitId)) {
            const base = statsAtLevel(battleRegistry(config).unit(unitId), survivorBattleLevel(config, state));
            const m = combatMultiplier(config, state, id);
            addLabel(head, `⚔️ 战斗 Lv${survivorBattleLevel(config, state)}  生命 ${Math.round(base.maxHp * m.hp)}  攻击 ${Math.round(base.atk * m.atk)}`, 18, DIM, { width: hw, align: 'left' }).node.setPosition(hx, -58);
        }
        this.cursorY -= headH + 12;

        // 专长、性格、天赋、介绍
        if (info?.specialty && SPECIALTY_TIPS[info.specialty]) this.text(`🛠️ ${SPECIALTY_NAMES[info.specialty]}：${SPECIALTY_TIPS[info.specialty]}`, 20, WIN);
        this.text(`🧠 性格：${(info?.traits ?? []).join('、') || '—'}`, 22);
        const talents = talentsOf(config, state, id);
        this.text('✨ 天赋', 22, ACCENT);
        if (talents.length === 0) this.text('（没有）', 20, DIM);
        for (const t of talents) this.text(`${t.icon} ${t.name}：${t.description}`, 20);
        this.gap(4);
        this.text(`📖 ${info?.bio ?? ''}`, 20, DIM);
        const quirks = quirksOf(config, s);
        if (quirks.length) {
            this.text('🎭 特质', 22, ACCENT);
            for (const q of quirks) {
                const shown = !q.hidden || (s.revealed ?? []).includes(q.id);
                if (shown) this.text(`${q.icon} ${q.name}：${q.description}`, 20, q.good ? WIN : LOSE);
                else this.text(`❓ 印象：${q.hint}`, 20, DIM);
            }
        }
        this.gap(10);

        this.renderBond(camp, id, now);
        this.renderRow(camp, id);
        this.renderMood(camp, id, now);
        this.renderGearSlots(camp, id);
        this.renderWatchMode(camp, id);

        // 伤员：可以用药品治疗
        if (s.injured) {
            this.button(`💊 在医务室用药品治疗（${formatCost(config, config.balance.healCost)}）`, WIDTH, () => {
                const res = camp.treat(id, camp.now);
                if (res.ok) this.effect(`💊 ${info?.name}的伤治好了`, WIN);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, 'normal', 22, 52);
            this.gap(10);
        }

        // 安排工作：每个有岗位的建筑一个按钮，写清楚他在这里的产量倍率
        const away = isOnExpedition(state, id);
        this.text(away ? '—— 安排工作（人在外面，回来后才能安排）——' : '—— 安排工作（产量倍率 = 专长 × 天赋 × 装备 × 精力）——', 22, DIM);
        for (const def of config.buildings) {
            const slots = workerSlots(config, state, def.id);
            if (slots <= 0) continue;
            const workers = workersIn(state, def.id).length;
            const here = s.assignment === def.id;
            const mult = survivorEfficiency(config, { ...s, injured: false }, def) * workMultiplier(config, state, id, def.id);
            const perks: string[] = [];
            if (survivorEfficiency(config, { ...s, injured: false }, def) > 1) perks.push('专长对口');
            for (const t of talents) if (t.effects.work && (!t.effects.work.building || t.effects.work.building === def.id)) perks.push(t.name);
            for (const g of gearOf(config, state, id)) if (g.gear?.work && (!g.gear.work.building || g.gear.work.building === def.id)) perks.push(g.name);
            if (sleepFactor(config, s) < 1) perks.push('太累了');
            const label = `${here ? '✅ ' : ''}${def.icon ?? ''} ${def.name}  ${workers}/${slots}  产量 ×${mult.toFixed(2)}${perks.length ? `（${perks.join('、')}）` : ''}`;
            const blocked = s.injured || away || (!here && workers >= slots);
            this.button(label, WIDTH, () => {
                const res = camp.assign(id, def.id, camp.now);
                if (res.ok) this.effect(`👷 ${info?.name}去${def.name}干活了`, WIN);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, here ? 'highlight' : blocked ? 'disabled' : 'normal', 22, 50);
            this.gap(8);
        }
        this.button(`${!s.assignment ? '✅ ' : ''}💤 休息（不干活，可以出去探索、侦察）`, WIDTH, () => {
            camp.assign(id, null, camp.now);
            this.render();
        }, LEFT, !s.assignment ? 'highlight' : 'normal', 22, 50);
    }

    /** 个人档案里和伊森的羁绊：跟随天数、并肩作战次数、档位颜色 */
    private renderBond(camp: CampGame, id: string, now: number): void {
        const { config, state } = camp;
        const s = state.survivors.find((x) => x.id === id)!;
        if (id === LEADER) {
            const rebirths = state.phoenix?.rebirths ?? 0;
            const ready = phoenixReady(config, state, now);
            this.text(`🔥 浴火重生：已涅槃 ${rebirths} 次（攻击 +${rebirths * 5}%）· ${ready ? '现在倒下也能再站起来' : '刚涅槃过，这几天要小心'}`, 20, ready ? WIN : LOSE);
            this.gap(6);
            return;
        }
        const tier = bondOf(config, state, s, now);
        const next = BOND_TIERS.slice().reverse().find((t) => t.min > bondPoints(config, state, s, now));
        this.text(`❤️ 和伊森：${tier.name}${isFounder(state, s) ? ' · ⚜️最初的伙伴' : ''}`, 22, hexColor(tier.color));
        this.text(
            `跟着伊森 ${daysWithLeader(config, state, s, now)} 天，并肩作战 ${sharedBattles(state, id, LEADER)} 次${tier.atk > 1 ? `，和伊森同队攻击 +${Math.round((tier.atk - 1) * 100)}%` : ''}${next ? `；再深一点就是「${next.name}」` : ''}`,
            18,
            DIM,
        );
        this.gap(6);
    }

    /** 个人档案里的站位：自动 / 前排 / 后排 */
    private renderRow(camp: CampGame, id: string): void {
        const { config, state } = camp;
        const s = state.survivors.find((x) => x.id === id)!;
        const range = weaponRange(config, state, id);
        this.text(`⚔️ 站位：${ROW_NAMES[rowOf(config, state, id)]}${range ? `（手里有远程武器，射程 ${range}）` : '（近战）'}`, 22, ACCENT);
        this.text('前排先挨打、生命 +10%；后排靠后，拿枪的攻击 +10%。', 17, DIM);
        const top = this.cursorY;
        const w = (WIDTH - 20) / 3;
        ([[null, '自动'], ['front', '前排'], ['back', '后排']] as [SurvivorRow | null, string][]).forEach(([row, label], i) => {
            this.cursorY = top;
            const current = (s.row ?? null) === row;
            this.button(`${current ? '✅ ' : ''}${label}`, w, () => {
                camp.setRow(id, row, camp.now);
                this.render();
            }, LEFT + i * (w + 10), current ? 'highlight' : 'normal', 20, 44);
        });
        this.gap(10);
    }

    /** 墓地：记着每一个死去的人，颜色是他和伊森的感情；每座墓每天可以祷告一次 */
    private renderGraveyard(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const graves = [...(state.graveyard ?? [])].reverse();
        this.text(`🪦 墓地（${graves.length} 人长眠于此）`, 28, ACCENT);
        this.text('每座墓每天可以来祷告一次。感情越深的人，大家越想念他。', 18, DIM);
        this.gap(8);
        for (const g of graves) {
            const tier = bondTier(g.bond);
            this.text(`${g.founder ? '⚜️' : '✝'} ${g.name}  ${g.title}`, 24, hexColor(tier.color));
            this.text(`${g.cause} · 第 ${g.diedDay} 天 · 跟着伊森 ${g.days} 天 · 并肩作战 ${g.battles} 次 · ${tier.name}${g.prayers ? ` · 祷告过 ${g.prayers} 次` : ''}`, 18, DIM);
            if (g.lost && !g.returned) this.text(`🕳️ 尸骨未归${g.sightings ? `：在尸群里见过 ${g.sightings} 次，下次守夜打倒就能带回来` : '：遗体还留在外面，也许哪天会在尸群里见到'}`, 18, LOSE);
            else if (g.returned) this.text('🪦 从尸群里认出来、带回营地安葬了', 18, WIN);
            const blocker = prayBlocker(config, state, g.id, now);
            this.button(blocker ? `🕯️ ${blocker}` : '🕯️ 在墓前祷告', WIDTH, () => {
                const res = camp.pray(g.id, camp.now);
                if (res.ok) this.effect(`🕯️ ${res.message}`, WIN);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, blocker ? 'disabled' : 'normal', 20, 44);
            this.gap(10);
        }
    }

    /** 伊森的日记：每天一篇，新的在前 */
    private renderDiary(camp: CampGame): void {
        const entries = latestEntries(camp.state);
        this.text('📖 伊森的日记', 28, ACCENT);
        this.text('每过一天，伊森会把这一天发生的事写下来。可以截图分享给朋友。', 18, DIM);
        this.gap(8);
        if (!entries.length) this.text('还是空白的一页。过完第一天再来看看吧。', 22, DIM);
        for (const e of entries) {
            this.text(`—— 第 ${e.day} 天${e.author !== '伊森' ? `（${e.author}）` : ''} ——`, 22, ACCENT);
            this.text(e.text, 22);
            this.gap(10);
        }
    }

    /** 个人档案里的心情：档位、效果、最近为什么变了、正在影响心情的事 */
    private renderMood(camp: CampGame, id: string, now: number): void {
        const { config, state } = camp;
        const s = state.survivors.find((x) => x.id === id)!;
        const tier = moodTier(s.mood);
        this.text(`${tier.icon} 心情：${tier.name} ${Math.round(s.mood)}/100（${tier.effect}）`, 22, tier.work < 1 ? LOSE : ACCENT);
        // 心情条：五档的分界线
        const barTop = this.cursorY - 4;
        const bar = makeNode('MoodBar', this.content!, WIDTH, 14);
        bar.setPosition(0, barTop - 7);
        const g = bar.addComponent(Graphics);
        drawPanel(g, WIDTH, 14, new Color(50, 50, 50, 220), 7);
        g.fillColor = tier.work < 1 ? LOSE : WIN;
        g.roundRect(-WIDTH / 2, -7, (WIDTH * Math.max(2, s.mood)) / 100, 14, 7);
        g.fill();
        this.cursorY = barTop - 22;
        for (const f of moodFactors(config, state, s)) this.text(`　${f}`, 18, DIM);
        const notes = [...(s.moodNotes ?? [])].reverse();
        if (notes.length) this.text('最近：', 18, DIM);
        for (const n of notes) {
            this.text(`　${n.amount > 0 ? '⬆️' : '⬇️'} ${n.text} ${n.amount > 0 ? '+' : ''}${n.amount}（${formatTime(realSeconds(config, Math.max(0, now - n.at)))}前）`, 18, n.amount > 0 ? WIN : LOSE);
        }
        this.gap(10);
    }

    /** 个人档案里的装备：三个位置，穿着的可以脱下，背包里同位置的装备可以换上 */
    private renderGearSlots(camp: CampGame, id: string): void {
        const { config, state } = camp;
        const s = state.survivors.find((x) => x.id === id)!;
        this.text('🎒 装备（武器加攻击，护甲加生命，工具加干活 / 侦察）', 22, ACCENT);
        for (const slot of GEAR_SLOTS) {
            const worn = s.gear?.[slot] ? propDef(config, s.gear[slot]!) : undefined;
            if (worn) {
                this.button(`${GEAR_SLOT_NAMES[slot]}：${worn.icon}${worn.name}（${gearStatsText(config, worn)}）  点击脱下`, WIDTH, () => {
                    camp.unequip(id, slot, camp.now);
                    this.render();
                }, LEFT, 'highlight', 20, 46);
            } else {
                this.text(`${GEAR_SLOT_NAMES[slot]}：空`, 20, DIM);
            }
            this.gap(4);
            for (const def of gearInBag(config, state, slot)) {
                this.button(`  ↳ 换上 ${def.icon}${def.name} ×${propCount(state, def.id)}（${gearStatsText(config, def)}）`, WIDTH, () => {
                    const res = camp.equip(id, def.id, camp.now);
                    if (res.ok) this.effect(`🎒 装备了${res.message}`, WIN);
                    else this.showToast(res.reason);
                    this.render();
                }, LEFT, 'normal', 20, 42);
                this.gap(4);
            }
        }
        this.gap(8);
    }

    /** 个人档案里的守夜安排：轮班 / 固定守夜 / 不守夜 */
    private renderWatchMode(camp: CampGame, id: string): void {
        const { config, state } = camp;
        const s = state.survivors.find((x) => x.id === id)!;
        const tonight = planWatch(config, state).includes(id);
        this.text(`🌙 守夜安排（${sleepText(s.sleep)}${tonight ? '，今晚轮到他守夜' : ''}）`, 22, ACCENT);
        this.text('守夜的人精力会下降，太累了干活、打仗都会变差。轮班最省心。', 18, DIM);
        const top = this.cursorY;
        const w = (WIDTH - 20) / 3;
        (['auto', 'always', 'never'] as WatchMode[]).forEach((mode, i) => {
            this.cursorY = top;
            const current = (s.watch ?? 'auto') === mode;
            this.button(`${current ? '✅ ' : ''}${WATCH_MODE_NAMES[mode]}`, w, () => {
                camp.setWatch(id, mode, camp.now);
                this.render();
            }, LEFT + i * (w + 10), current ? 'highlight' : 'normal', 22, 48);
        });
        this.gap(14);
    }

    /** 探索页：枫谷镇地图（迷雾、道路、地点、在路上的小队、侦察点）+ 下方选中地点的详情 */
    private renderExplore(camp: CampGame, now: number): void {
        const { config, state } = camp;
        if (this.exploreMode === 'hunt' && camp.unlocked('hunting')) {
            this.renderHunting(camp, now);
            return;
        }
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
        if (guidedLoc) this.selectedDistrict = null;
        if (!this.selectedDistrict && (!this.selectedLocation || !visible.some((l) => l.id === this.selectedLocation))) {
            this.selectedLocation = guidedLoc ?? visible.find((l) => statusOf.get(l.id) === 'known')?.id ?? null;
        }

        // 道路：前置地点（没有前置就是营地）连到每个看得见的地点
        const roads = map.addComponent(Graphics);
        for (const loc of visible) {
            const from = prerequisiteOf(config, loc)?.map ?? camp0;
            const cleared = statusOf.get(loc.id) === 'cleared';
            dashedLine(roads, from, loc.map!, cleared ? new Color(210, 180, 120, 230) : new Color(200, 200, 190, 140), cleared ? 5 : 3, cleared ? 0 : 10);
        }

        // 战争迷雾：没探索的地方完全看不见（深雾），边缘一圈半透明（浅雾），深雾里写着“未知区域”
        const pts = revealers(config, state, now);
        const edge = pts.map((p) => ({ ...p, r: p.r + FOG_EDGE }));
        const fogNode = makeNode('Fog', map, MAP_WIDTH, TOWN_HEIGHT);
        const fog = fogNode.addComponent(Graphics);
        const deep: [number, number][] = [];
        const soft: [number, number][] = [];
        for (let x = -MAP_WIDTH / 2; x < MAP_WIDTH / 2; x += FOG_CELL) {
            for (let y = -TOWN_HEIGHT / 2; y < TOWN_HEIGHT / 2; y += FOG_CELL) {
                const cx = x + FOG_CELL / 2;
                const cy = y + FOG_CELL / 2;
                if (isRevealed(pts, cx, cy)) continue;
                (isRevealed(edge, cx, cy) ? soft : deep).push([x, y]);
            }
        }
        fog.fillColor = new Color(14, 16, 18, 150);
        for (const [x, y] of soft) fog.rect(x, y, FOG_CELL, FOG_CELL);
        fog.fill();
        fog.fillColor = new Color(8, 9, 11, 248);
        for (const [x, y] of deep) fog.rect(x, y, FOG_CELL, FOG_CELL);
        fog.fill();
        // 深雾里零星写几个“未知区域”（位置固定，不会每秒乱跳）
        for (const spot of FOG_LABELS) {
            if (!isRevealed(edge, spot.x, spot.y)) addLabel(fogNode, '🌫️ 未知区域', 18, new Color(120, 125, 130), { width: 160 }).node.setPosition(spot.x, spot.y);
        }

        // 分区：边界虚线 + 左上角的区名牌（点一下选中这个区，可以派人去勘察）
        const border = fogNode.addComponent(Graphics);
        const maxTier = maxTierOwned(config, state);
        for (const d of config.districts?.districts ?? []) {
            const { x1, y1, x2, y2 } = d.rect;
            const col = this.selectedDistrict === d.id ? ACCENT : new Color(200, 190, 160, 110);
            const corners = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
            corners.forEach((c, i) => dashedLine(border, c, corners[(i + 1) % 4], col, this.selectedDistrict === d.id ? 3 : 2, 8));
            const explored = Math.round(districtExplored(config, state, d, now) * 100);
            const locked = d.tier > maxTier;
            const plate = makeNode('District', map, 150, 26);
            plate.setPosition(Math.max(-MAP_WIDTH / 2 + 78, x1 + 78), Math.min(TOWN_HEIGHT / 2 - 60, y2 - 16));
            drawPanel(plate.addComponent(Graphics), 150, 26, this.selectedDistrict === d.id ? COLORS.highlight : new Color(20, 22, 20, 190), 13);
            addLabel(plate, `${locked ? '🔒' : d.icon}${districtName(state, d)} ${explored}%`, 15, locked ? DIM : TEXT, { width: 146, height: 24 });
            plate.on(Node.EventType.TOUCH_END, () => {
                punch(plate);
                this.selectedDistrict = d.id;
                this.selectedLocation = null;
                this.render();
            });
        }

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
            const fallenGear = state.droppedGear?.[loc.id] ? '💀' : '';
            const sub = fallenGear + (rumor ? '？？？' : ex ? '小队在路上' : restock > 0 ? `🔄 ${formatTime(realSeconds(config, restock * 1000))}` : status === 'cleared' ? '✅ 可以再去' : '⚔️ 未探索');
            const node = this.mapMarker(map, loc.map!, rumor ? '❓' : loc.icon ?? '📍', rumor ? '???' : locationName(config, state, loc), color, 28, sub);
            const g = node.getComponent(Graphics)!;
            if (this.selectedLocation === loc.id) {
                g.lineWidth = 4;
                g.strokeColor = ACCENT;
                g.circle(0, 0, 36);
                g.stroke();
            }
            if (guidedLoc === loc.id) addLabel(node, '👉', 30, TEXT, { width: 40 }).node.setPosition(-48, 0);
            // 难度：按现在最强的小队估计的胜率，标颜色圈和角标
            if (!rumor) {
                const danger = DANGER_LEVELS[this.odds(camp, loc.id).level];
                g.lineWidth = 4;
                g.strokeColor = hexColor(danger.color);
                g.circle(0, 0, 31);
                g.stroke();
                const tag = makeNode('Danger', node, 64, 22);
                tag.setPosition(30, 26);
                drawPanel(tag.addComponent(Graphics), 64, 22, new Color(15, 17, 15, 220), 11, hexColor(danger.color), 2);
                addLabel(tag, danger.name, 14, hexColor(danger.color), { width: 60, height: 20 });
            }
            node.on(Node.EventType.TOUCH_END, () => {
                punch(node);
                this.selectedLocation = loc.id;
                this.selectedDistrict = null;
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
            if (target) walker(camp0, target, ex.startedAt, ex.returnsAt, vehicleDef(config, ex.vehicle)?.icon ?? '🚶');
        }
        for (const sc of state.scouts ?? []) walker(camp0, sc, sc.startedAt, sc.returnsAt, '🔭');
        for (const hv of state.hunts ?? []) {
            const d = districtDef(config, hv.district);
            if (d) walker(camp0, { x: (d.rect.x1 + d.rect.x2) / 2 + 30, y: (d.rect.y1 + d.rect.y2) / 2 - 30 }, hv.startedAt, hv.returnsAt, '🏹');
        }
        for (const sv of state.surveys ?? []) {
            const d = districtDef(config, sv.district);
            if (d) walker(camp0, { x: (d.rect.x1 + d.rect.x2) / 2, y: (d.rect.y1 + d.rect.y2) / 2 }, sv.startedAt, sv.returnsAt, vehicleDef(config, sv.vehicle)?.icon ?? '🗺️');
        }

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
        addLabel(title, `🗺️ ${townName(state)} · 已探索 ${Math.round(exploredRatio(config, state, now) * 100)}%`, 20, ACCENT, { width: 320 });
        // 右上角：去狩猎钓鱼页（猎场和探索地点分开；新手第二天才开放）
        const huntBtn = makeNode('HuntBtn', map, 190, 44);
        huntBtn.active = camp.unlocked('hunting');
        huntBtn.setPosition(MAP_WIDTH / 2 - 105, TOWN_HEIGHT / 2 - 28);
        drawPanel(huntBtn.addComponent(Graphics), 190, 44, COLORS.button, 12, ACCENT, 2);
        const huntingNow = (state.hunts ?? []).length;
        addLabel(huntBtn, `🏹 狩猎钓鱼${huntingNow ? ` (${huntingNow})` : ''}`, 20, TEXT, { width: 180 });
        huntBtn.on(Node.EventType.TOUCH_END, () => {
            if (this.dragDistance > DRAG_THRESHOLD) return;
            punch(huntBtn);
            this.exploreMode = 'hunt';
            this.resetScroll();
            this.render();
        });

        // 地图底部：选中的地点 / 分区 + “去出发”按钮（点一下把下面的详情卷上来）
        const picked = this.selectedDistrict
            ? (() => {
                  const d = districtDef(config, this.selectedDistrict!);
                  return d ? `${d.icon} ${districtName(state, d)}：勘察 / 打猎` : null;
              })()
            : this.selectedLocation
              ? (() => {
                    const l = config.locations.find((x) => x.id === this.selectedLocation);
                    return l && statusOf.get(l.id) !== 'rumor' ? `${l.icon ?? '📍'} ${locationName(config, state, l)}` : null;
                })()
              : null;
        const actionBar = makeNode('PickedBar', map, MAP_WIDTH - 40, 56);
        actionBar.setPosition(0, -TOWN_HEIGHT / 2 + 40);
        drawPanel(actionBar.addComponent(Graphics), MAP_WIDTH - 40, 56, new Color(20, 22, 20, 225), 14, picked ? ACCENT : DIM, 2);
        addLabel(actionBar, picked ? `${picked}   👇 点这里去出发` : '点地图上的地点或分区名牌，选一个要去的地方', 20, picked ? ACCENT : DIM, { width: MAP_WIDTH - 60 });
        actionBar.on(Node.EventType.TOUCH_END, () => {
            if (this.dragDistance > DRAG_THRESHOLD || !picked) return;
            punch(actionBar);
            this.scrollY = TOWN_HEIGHT - 40;
            this.applyScroll();
        });

        // 下方：今日情报 + 选中地点的详情（往上拖，或者点上面的条）
        this.cursorY = TOWN_CENTER_Y - TOWN_HEIGHT / 2 - 8;
        const intel = todayIntel(config, state, now);
        if (intel.length) {
            this.text('📻 今日情报（今天出发的打猎、钓鱼、勘察有效）', 20, ACCENT);
            for (const x of intel) this.text(`${x.kind.icon} ${x.text}`, 18, TEXT);
            this.gap(6);
        }
        this.renderLocationCard(camp, now, statusOf);
    }

    /** 地图上的一个标记：圆形底 + 图标 + 名字（+ 一行小字） */
    /** 地点难度（估计胜率）：营地的人、装备、等级不变就用缓存，不每帧都模拟 */
    private oddsKey = '';
    private oddsCache = new Map<string, { winRate: number; level: number }>();
    private odds(camp: CampGame, locationId: string): { winRate: number; level: number } {
        const { config, state } = camp;
        const key = [
            state.survivors.map((s) => `${s.id}${s.injured ? '!' : ''}${s.gear ? JSON.stringify(s.gear) : ''}${Math.round((s.sleep ?? 100) / 25)}${Math.round(s.mood / 25)}`).join(','),
            survivorBattleLevel(config, state),
            expeditionEnemyBonus(config, state),
            state.expeditions.length,
        ].join('|');
        if (key !== this.oddsKey) {
            this.oddsKey = key;
            this.oddsCache.clear();
        }
        let o = this.oddsCache.get(locationId);
        if (!o) {
            o = expeditionOdds(config, state, locationId);
            this.oddsCache.set(locationId, o);
        }
        return o;
    }

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
        const district = this.selectedDistrict ? districtDef(config, this.selectedDistrict) : undefined;
        if (district) {
            this.renderDistrictCard(camp, district, now);
            return;
        }
        const loc = this.selectedLocation ? config.locations.find((l) => l.id === this.selectedLocation) : undefined;
        const scouting = (state.scouts ?? []).length;
        if (!loc) {
            this.text('点地图上的地点查看详情；点分区的名牌可以派人去勘察，驱散迷雾。金色的小圆点是侦察点。', 20, DIM);
            if (scouting) this.text(`🔭 ${scouting} 个人在外面侦察`, 20, ACCENT);
            return;
        }
        const status = statusOf.get(loc.id);
        if (status === 'rumor') {
            this.text(`❓ 远处还有个地方……`, 24, ACCENT);
            this.text(`解锁条件：${unlockHint(config, state, loc, now)}`, 20, DIM);
            return;
        }
        const squad = this.currentSquad(camp);
        const names = squad.map((id) => survivorInfo(config, state, id)?.name ?? id);
        const drops = (loc.drops ?? []).map((d) => {
            const def = config.props.find((p) => p.id === d.prop);
            return `${def?.icon ?? ''}${def?.name ?? d.prop}`;
        });
        this.text(`${loc.icon ?? ''} ${locationName(config, state, loc)}  ⏱${formatTime(realSeconds(config, loc.durationMinutes * 60_000))}  ${status === 'cleared' ? '✅ 已打下' : '⚔️ 未探索'}`, 24, ACCENT);
        this.text(loc.description, 18, DIM);
        const lostGear = state.droppedGear?.[loc.id];
        if (lostGear) this.text(`💀 牺牲的战友把装备留在了这里：${formatProps(config, lostGear)}（打下这里才能捡回来）`, 18, LOSE);
        this.text(`战利品 ${formatBag(config, expeditionLoot(config, state, loc))}${drops.length ? `   可能找到：${drops.join('、')}` : ''}`, 18);
        this.text(`🧟 可能遇到：${enemyHint(config, loc)}`, 18, LOSE);
        const odds = this.odds(camp, loc.id);
        const danger = DANGER_LEVELS[odds.level];
        this.text(`${danger.icon} 难度：${danger.name}（派现在最强的小队，估计胜率 ${Math.round(odds.winRate * 100)}%）`, 18, hexColor(danger.color));
        const ex = state.expeditions.find((e) => e.location === loc.id);
        if (ex) {
            const left = realSeconds(config, ex.returnsAt - now);
            this.button(`小队在路上，${formatTime(left)} 后回来 · 看广告立即返回`, WIDTH, () => this.speedUpExpedition(ex.id), LEFT, 'normal', 22, 50);
        } else if (restockSecondsLeft(state, loc.id, now) > 0) {
            const left = realSeconds(config, restockSecondsLeft(state, loc.id, now) * 1000);
            this.button(`刚搜刮过，${formatTime(left)} 后物资重新聚起来`, WIDTH, () => {}, LEFT, 'disabled', 22, 50);
        } else {
            const tier = locationTier(config, loc);
            const d = districtAt(config, loc.map);
            this.text(`${d ? `${d.icon}${districtName(state, d)} · ` : ''}要${TIER_NAMES[tier]}才能到`, 18, tier > maxTierOwned(config, state) ? LOSE : DIM);
            const guided = this.isGuided(`explore:${loc.id}`);
            this.button(`${guided ? '👉 ' : ''}⚔️ 出发探索（${names.join('、') || '没有能出发的人'}）`, WIDTH, () => {
                const res = camp.explore(loc.id, camp.now, squad, this.selectedVehicle);
                if (res.ok) this.pickedSquad = null;
                if (res.ok) this.effect(`🚶 小队出发前往${locationName(config, state, loc)}`, ACCENT);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, squad.length === 0 ? 'disabled' : guided ? 'highlight' : 'normal', 24, 56);
            this.text('下面可以自己挑队员、选交通工具（不挑就自动编队）：', 17, DIM);
            this.renderSquadPicker(camp, now);
            this.renderVehiclePicker(camp, tier, squad);
        }
    }

    /** 这次要派出去的人：自己挑过就用自己挑的（去掉已经不能出发的），否则自动编队 */
    private currentSquad(camp: CampGame): string[] {
        const { config, state } = camp;
        if (!this.pickedSquad) return suggestSquad(config, state);
        const ok = new Set(availableFighters(config, state).map((s) => s.id));
        return this.pickedSquad.filter((id) => ok.has(id));
    }

    /** 自己挑队员：每个能出发的人一个按钮，点一下加入 / 移出；下面显示站位和搭配效果 */
    private renderSquadPicker(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const max = config.balance.maxSquadSize;
        const squad = this.currentSquad(camp);
        const pool = availableFighters(config, state);
        this.text(`👥 小队 ${squad.length}/${max}（${this.pickedSquad ? '自己挑的' : '自动编队'}，点名字加入 / 移出）`, 18, ACCENT);
        const perRow = 4;
        const w = (WIDTH - 10 * (perRow - 1)) / perRow;
        for (let i = 0; i < pool.length; i += perRow) {
            const top = this.cursorY;
            pool.slice(i, i + perRow).forEach((s, k) => {
                this.cursorY = top;
                const inSquad = squad.includes(s.id);
                const tier = bondOf(config, state, s, now);
                const row = rowOf(config, state, s.id) === 'back' ? '后' : '前';
                this.button(`${inSquad ? '✅' : ''}${survivorName(config, state, s.id)}·${row}`, w, () => {
                    const next = inSquad ? squad.filter((x) => x !== s.id) : squad.length < max ? [...squad, s.id] : squad;
                    if (!inSquad && squad.length >= max) this.showToast(`小队最多 ${max} 人`);
                    this.pickedSquad = next;
                    this.render();
                }, LEFT + k * (w + 10), inSquad ? 'highlight' : 'normal', 16, 40, false, 0, s.id === 'ethan' ? undefined : hexColor(tier.color));
            });
            this.cursorY = top - 40;
            this.gap(6);
        }
        if (this.pickedSquad) {
            this.button('↺ 恢复自动编队', WIDTH, () => {
                this.pickedSquad = null;
                this.render();
            }, LEFT, 'normal', 16, 36);
            this.gap(4);
        }
        const front = squad.filter((id) => rowOf(config, state, id) === 'front').map((id) => survivorName(config, state, id));
        const back = squad.filter((id) => rowOf(config, state, id) === 'back').map((id) => survivorName(config, state, id));
        this.text(`🛡️ 前排：${front.join('、') || '没人'}　🎯 后排：${back.join('、') || '没人'}`, 17, DIM);
        for (const syn of squadSynergies(config, state, squad, now)) this.text(`${syn.icon} ${syn.name}：${syn.text}`, 17, syn.icon === '⚠️' ? LOSE : WIN);
        this.gap(4);
    }

    /** 探索时遇到的人、上门的人：看介绍、专长、天赋和印象，决定留下谁；营地满了可以换掉一个人，或者让他在门口等 */
    private renderCandidates(camp: CampGame, list: CandidateState[], waitingList = false): void {
        const { config, state } = camp;
        const full = state.survivors.length >= bedCount(config, state);
        this.text(waitingList ? `🚪 门口有 ${list.length} 个人在等` : `🙋 遇到了 ${list.length} 个幸存者`, 28, ACCENT);
        this.text(`床位 ${state.survivors.length}/${bedCount(config, state)}。${full ? '营地满了：可以请一个人离开换他进来，或者让他先在门口等（去升级宿舍）。' : '留下谁由你决定——有人带着好本事，也有人藏着坏毛病。'}`, 18, full ? LOSE : DIM);
        this.gap(8);
        for (const c of list) {
            const info = candidateInfo(config, c);
            this.text(`${info.name}  ·  ${info.title}  ·  专长：${SPECIALTY_NAMES[info.specialty] ?? '—'}`, 24, ACCENT);
            if (SPECIALTY_TIPS[info.specialty]) this.text(`🛠️ ${SPECIALTY_NAMES[info.specialty]}：${SPECIALTY_TIPS[info.specialty]}`, 18, WIN);
            this.text(c.intro, 18, TEXT);
            const talents = info.talents.map((id) => config.talents.find((t) => t.id === id)).filter(Boolean).map((t) => `${t!.icon}${t!.name}`);
            if (talents.length) this.text(`✨ 天赋：${talents.join('、')}`, 18, WIN);
            if (info.traits.length) this.text(`🧠 性格：${info.traits.join('、')}`, 18, DIM);
            for (const q of quirksOf(config, c.survivor)) {
                if (q.hidden) this.text(`❓ 印象：${q.hint}`, 18, DIM);
                else this.text(`${q.icon} ${q.name}：${q.description}（${q.hint}）`, 18, q.good ? WIN : LOSE);
            }
            if (!(c.survivor.quirks ?? []).length) this.text('❓ 印象：看起来是个普通人', 18, DIM);
            const half = (WIDTH - 10) / 2;
            const row = this.cursorY - 6;
            this.cursorY = row;
            this.button(full ? '✅ 留下（没床位）' : '✅ 留下', half, () => {
                const res = camp.decideCandidate(c.id, true, camp.now);
                if (res.ok) this.effect(`🙋 ${res.message}`, WIN, 28);
                else this.showToast(res.reason);
                this.render();
            }, LEFT, full ? 'disabled' : 'highlight', 22, 50);
            this.cursorY = row;
            this.button('👋 让他走', half, () => {
                camp.decideCandidate(c.id, false, camp.now);
                this.render();
            }, LEFT + half + 10, 'normal', 22, 50);
            if (full) {
                this.gap(8);
                if (!waitingList) {
                    this.button('🛏️ 让他先在门口等（去升级宿舍，回头在“幸存者”页决定）', WIDTH, () => {
                        camp.waitCandidate(c.id, camp.now);
                        this.render();
                    }, LEFT, 'normal', 20, 46);
                    this.gap(6);
                }
                // 换掉一个人：点名字，再点一次确认
                this.text('🔁 或者请一个人离开，换他进来：', 18, DIM);
                const others = state.survivors.filter((s) => !dismissBlocker(config, state, s.id));
                const per = 3;
                const w = (WIDTH - 10 * (per - 1)) / per;
                others.forEach((s, i) => {
                    if (i % per === 0 && i > 0) this.gap(6);
                    const r = this.cursorY;
                    const key = `${c.id}:${s.id}`;
                    const confirming = this.confirmSwap === key;
                    this.button(confirming ? `确认请${survivorName(config, state, s.id)}走？` : `👋 ${survivorName(config, state, s.id)}`, w, () => {
                        if (!confirming) {
                            this.confirmSwap = key;
                            this.render();
                            return;
                        }
                        this.confirmSwap = null;
                        const res = camp.dismiss(s.id, camp.now);
                        if (res.ok) {
                            const kept = camp.decideCandidate(c.id, true, camp.now);
                            this.effect(`🔁 ${res.message}，${kept.ok ? kept.message : ''}`, ACCENT, 26);
                        } else this.showToast(res.reason);
                        this.render();
                    }, LEFT + (i % per) * (w + 10), confirming ? 'danger' : 'normal', 18, 42);
                    if (i % per !== per - 1 && i !== others.length - 1) this.cursorY = r;
                });
            }
            this.gap(18);
        }
    }

    /**
     * 装背包：战利品摊在地上，玩家把它们摆进背包格子里。
     * 点下面的东西选中（或点“放进去”自动找位置），再点格子放到那里；点背包里的东西拿出来。
     */
    private renderHaul(camp: CampGame): void {
        const { config } = camp;
        const haul = camp.currentHaul!;
        const weight = packedWeight(haul);
        this.text(`🎒 从${haul.title}带回什么？`, 28, ACCENT);
        this.text(`${haul.sections.length} 块格子 共 ${totalCells(haul)} 格 · 负重 ${weight}/${haul.maxWeight}${(camp.state.pendingHauls?.length ?? 0) > 1 ? ` · 还有 ${camp.state.pendingHauls!.length - 1} 包等着装` : ''}`, 20, weight > haul.maxWeight * 0.9 ? LOSE : TEXT);
        this.text('点下面的东西选中，再点格子放进去；点装好的东西可以拿出来。每件东西只能放在一块区里。', 17, DIM);
        this.gap(6);
        const selected = this.selectedPiece !== null ? pieceOf(haul, this.selectedPiece) : undefined;

        // 每一块格子区（每个人的包、车的后备箱），两块一排
        const maxW = Math.max(...haul.sections.map((sec) => sec.w));
        const cell = Math.min(64, Math.floor((WIDTH / 2 - 20) / Math.max(1, maxW)));
        const colW = WIDTH / 2;
        for (let i = 0; i < haul.sections.length; i += 2) {
            const rowTop = this.cursorY;
            let rowH = 0;
            for (let k = 0; k < 2 && i + k < haul.sections.length; k++) {
                const section = i + k;
                const sec = haul.sections[section];
                const gridW = cell * sec.w;
                const gridH = cell * sec.h;
                const cx = LEFT + colW * k + colW / 2;
                addLabel(this.content!, sec.label, 16, ACCENT, { width: colW - 10 }).node.setPosition(cx, rowTop - 12);
                const grid = makeNode('Bag', this.content!, gridW, gridH);
                grid.setPosition(cx, rowTop - 28 - gridH / 2);
                drawPanel(grid.addComponent(Graphics), gridW + 8, gridH + 8, new Color(60, 48, 36, 240), 8, new Color(150, 120, 80), 3);
                const occ = occupancy(haul, section);
                for (let y = 0; y < sec.h; y++) {
                    for (let x = 0; x < sec.w; x++) {
                        const node = makeNode('Cell', grid, cell - 4, cell - 4);
                        node.setPosition(-gridW / 2 + x * cell + cell / 2, gridH / 2 - y * cell - cell / 2);
                        drawPanel(node.addComponent(Graphics), cell - 4, cell - 4, new Color(90, 74, 56, 230), 6);
                        if (occ[y][x]) continue;
                        node.on(Node.EventType.TOUCH_END, () => {
                            if (this.selectedPiece === null) return;
                            const res = camp.placeLoot(this.selectedPiece, section, x, y, this.pieceRotated);
                            if (!res.ok) this.showToast(res.reason);
                            else this.selectedPiece = null;
                            this.render();
                        });
                    }
                }
                for (const pk of haul.packed) {
                    if ((pk.section ?? 0) !== section) continue;
                    const piece = pieceOf(haul, pk.piece);
                    if (!piece) continue;
                    const w = pk.rotated ? piece.h : piece.w;
                    const h = pk.rotated ? piece.w : piece.h;
                    const node = makeNode('Piece', grid, w * cell - 6, h * cell - 6);
                    node.setPosition(-gridW / 2 + (pk.x + w / 2) * cell, gridH / 2 - (pk.y + h / 2) * cell);
                    drawPanel(node.addComponent(Graphics), w * cell - 6, h * cell - 6, pieceColor(piece), 8, TEXT, 2);
                    addLabel(node, pieceText(config, piece), Math.min(18, Math.floor(cell / 3.2)), TEXT, { width: w * cell - 10, wrap: true });
                    node.on(Node.EventType.TOUCH_END, () => {
                        punch(node);
                        camp.unpackLoot(piece.id);
                        this.render();
                    });
                }
                rowH = Math.max(rowH, gridH + 40);
            }
            this.cursorY = rowTop - rowH - 8;
        }

        // 操作
        const third = (WIDTH - 20) / 3;
        const row = this.cursorY;
        this.button(`🔄 旋转${this.pieceRotated ? '（已转）' : ''}`, third, () => {
            this.pieceRotated = !this.pieceRotated;
            this.render();
        }, LEFT, this.pieceRotated ? 'highlight' : 'normal', 20, 50);
        this.cursorY = row;
        this.button('✨ 自动整理', third, () => {
            camp.autoPackLoot();
            this.selectedPiece = null;
            this.render();
        }, LEFT + third + 10, 'normal', 20, 50);
        this.cursorY = row;
        this.button('✅ 带回营地', third, () => {
            const res = camp.carryHaul(camp.now);
            if (res.ok) this.effect(`🎒 带回 ${res.message || '一点杂物'}`, WIN, 28);
            else this.showToast(res.reason);
            this.selectedPiece = null;
            this.resetScroll();
            this.render();
        }, LEFT + (third + 10) * 2, 'highlight', 20, 50);
        this.gap(12);

        // 地上还没装的东西
        const packed = new Set(haul.packed.map((pk) => pk.piece));
        const loose = haul.pieces.filter((p) => !packed.has(p.id));
        this.text(loose.length ? `地上还有 ${loose.length} 件没装：` : '全都装进去了！', 20, loose.length ? TEXT : WIN);
        const half = (WIDTH - 10) / 2;
        for (const p of loose) {
            const r = this.cursorY;
            const isSel = selected?.id === p.id;
            this.button(`${isSel ? '👉 ' : ''}${pieceText(config, p)}  ${p.w}×${p.h}格 重${p.weight}`, half, () => {
                this.selectedPiece = isSel ? null : p.id;
                this.render();
            }, LEFT, isSel ? 'highlight' : 'normal', 18, 44);
            this.cursorY = r;
            this.button('放进去', half, () => {
                const res = camp.autoPlaceLoot(p.id);
                if (!res.ok) this.showToast(res.reason);
                this.render();
            }, LEFT + half + 10, 'normal', 18, 44);
            this.gap(6);
        }
    }

    /** 选车：走路 / 每辆车一个按钮，写清楚背包大小、负重、汽油 */
    private renderVehiclePicker(camp: CampGame, tier: number, squad: string[]): void {
        const { config, state } = camp;
        const owned = ownedVehicles(config, state);
        if (owned.length === 0 && tier === 0) return;
        const auto = pickVehicle(config, state, tier, this.selectedVehicle).vehicle;
        const chosen = this.selectedVehicle === 'walk' ? undefined : this.selectedVehicle ? vehicleDef(config, this.selectedVehicle) : auto;
        const cap = haulSections(config, state, squad, chosen);
        const cells = cap.sections.reduce((n, sec) => n + sec.w * sec.h, 0);
        this.text(`🎒 ${cap.sections.map((sec) => `${sec.w}×${sec.h}`).join(' + ')}（共 ${cells} 格）· 能背 ${cap.maxWeight} 重 · ⛽汽油 ${propCount(state, FUEL_PROP)} 桶`, 18, ACCENT);
        const options: { id: string | undefined; label: string; blocker: string | null }[] = [
            { id: undefined, label: '自动', blocker: null },
            { id: 'walk', label: '🚶走路', blocker: tier > 0 ? '太远' : null },
            ...owned.map((v) => ({
                id: v.id,
                label: `${v.icon}${v.name.slice(-3)}${v.fuel ? `⛽${v.fuel}` : ''}`,
                blocker: v.tier < tier ? '到不了' : vehicleBlocker(state, v),
            })),
        ];
        const perRow = 3;
        const w = (WIDTH - 10 * (perRow - 1)) / perRow;
        for (let row = 0; row * perRow < options.length; row++) {
            const top = this.cursorY;
            options.slice(row * perRow, row * perRow + perRow).forEach((o, i) => {
                this.cursorY = top;
                const current = this.selectedVehicle === o.id;
                this.button(o.blocker ? `${o.label}（${o.blocker}）` : o.label, w, () => {
                    this.selectedVehicle = o.id;
                    this.render();
                }, LEFT + i * (w + 10), current ? 'highlight' : o.blocker ? 'disabled' : 'normal', 16, 44, true);
            });
            this.cursorY = top - 44;
            this.gap(8);
        }
    }

    /** 分区里的打猎 / 钓鱼：适不适合、能打到什么、派人去 */
    /** 狩猎钓鱼页：所有猎场一张张列出来（和探索地图分开） */
    private renderHunting(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.button('🗺️ 回到探索地图', WIDTH, () => {
            this.exploreMode = 'map';
            this.resetScroll();
            this.render();
        }, LEFT, 'normal', 22, 48);
        this.gap(6);
        this.text('🏹 狩猎和钓鱼：派 1～3 个人去，过一阵带回猎物（食物），有机会活捉回去养。远的地方要交通工具。', 18, DIM);
        const tips = todayIntel(config, state, now).filter((x) => x.target === 'ground');
        for (const t of tips) this.text(`📻 ${t.kind.icon} ${t.text}`, 18, WIN);
        this.gap(6);
        for (const g of huntingGrounds(config)) this.renderGroundCard(camp, g, now);
    }

    private renderGroundCard(camp: CampGame, g: HuntingGround, now: number): void {
        const { config, state } = camp;
        const locked = groundLockReason(state, g);
        const far = g.tier > maxTierOwned(config, state);
        this.text(`${g.icon} ${g.name}  ${g.fishing ? '🎣' : '🏹'}${g.rating}${locked ? `  🔒${locked}` : ''}`, 22, locked ? DIM : ACCENT);
        this.text(`${g.note}（要${TIER_NAMES[g.tier]}才能到）`, 17, far ? LOSE : DIM);
        const game = huntableGame(config, state, g, now);
        this.text(game.length ? `这个季节能打到：${game.map((x) => `${x.icon}${x.name}${x.risk >= 0.2 ? '⚠️' : ''}${x.capture ? '🪤' : ''}`).join(' ')}` : '这个季节这里打不到什么', 17, TEXT);
        const busy = (state.hunts ?? []).find((h) => h.district === g.id);
        if (busy) {
            this.text(`🏹 ${busy.squad.map((id) => survivorName(config, state, id)).join('、')}在这里，${formatTime(realSeconds(config, busy.returnsAt - now))} 后回来`, 18, ACCENT);
            this.gap(12);
            return;
        }
        if (locked) {
            this.gap(12);
            return;
        }
        const hunters = suggestHunters(config, state);
        const blocker = huntBlocker(config, state, g.id, hunters, now, this.selectedVehicle);
        const names = hunters.map((id) => survivorName(config, state, id)).join('、') || '没有能派的人';
        const verb = g.fishing ? '钓鱼' : '打猎';
        this.button(blocker ? `${g.fishing ? '🎣' : '🏹'} ${verb}（${blocker}）` : `${g.fishing ? '🎣' : '🏹'} 派 ${names} 去${verb}`, WIDTH, () => {
            const res = camp.hunt(g.id, camp.now, hunters, this.selectedVehicle);
            if (res.ok) this.effect(`${g.fishing ? '🎣' : '🏹'} 出发去${g.name}${verb}`, ACCENT);
            else this.showToast(res.reason);
            this.render();
        }, LEFT, blocker ? 'disabled' : 'normal', 20, 48);
        this.gap(14);
    }

    /** 分区详情：探索进度、要什么车、危险程度、派人勘察 */
    private renderDistrictCard(camp: CampGame, d: DistrictDef, now: number): void {
        const { config, state } = camp;
        const explored = districtExplored(config, state, d, now);
        this.text(`${d.icon} ${districtName(state, d)}  已探索 ${Math.round(explored * 100)}%${state.districtsCompleted?.includes(d.id) ? ' ✅' : ''}`, 24, ACCENT);
        this.text(d.description, 18, DIM);
        const tip = todayIntel(config, state, now).find((x) => x.id === d.id);
        if (tip) this.text(`📻 今日情报：${tip.kind.icon} ${tip.text}`, 18, WIN);
        this.text(`要${TIER_NAMES[d.tier]}才能到 · 勘察一趟 ${formatTime(realSeconds(config, d.surveyMinutes * 60_000))} · 受伤概率 ${Math.round(d.danger * 100)}%`, 18, d.tier > maxTierOwned(config, state) ? LOSE : TEXT);
        const reward = [formatBag(config, d.complete?.resources ?? {}), formatProps(config, d.complete?.props ?? {})].filter(Boolean).join(' ');
        if (reward) this.text(`全部探索完奖励：${reward}`, 18, WIN);
        const busy = (state.surveys ?? []).find((s) => s.district === d.id);
        if (busy) {
            this.text(`🗺️ ${busy.squad.map((id) => survivorName(config, state, id)).join('、')}正在勘察，${formatTime(realSeconds(config, busy.returnsAt - now))} 后回来`, 20, ACCENT);
            return;
        }
        const who = suggestSurveyors(state);
        this.renderVehiclePicker(camp, d.tier, who);
        const blocker = surveyBlocker(config, state, d.id, who, now, this.selectedVehicle);
        const names = who.map((id) => survivorName(config, state, id)).join('、') || '没有能派的人';
        this.button(blocker ? `勘察（${blocker}）` : `🗺️ 派 ${names} 去勘察，驱散一片迷雾`, WIDTH, () => {
            const res = camp.survey(d.id, camp.now, who, this.selectedVehicle);
            if (res.ok) this.effect(`🗺️ 出发勘察${districtName(state, d)}`, ACCENT);
            else this.showToast(res.reason);
            this.render();
        }, LEFT, blocker ? 'disabled' : 'normal', 22, 52);
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
                this.tab = this.camp.unlocked('reports') ? 'reports' : 'explore';
            } else {
                this.showToast('需要看完广告才能加速');
            }
            this.render();
        });
    }

    private showToast(message: string): void {
        if (!message) return;
        sfx('error');
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
        label.string = wrapText(str, width - 4, size);
        styleLabel(label, size);
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
        textColor: Color = TEXT,
    ): void {
        const node = makeNode('Button', this.target!, width, height);
        node.setPosition(x + width / 2, this.cursorY - height / 2);
        const fill = style === 'highlight' ? COLORS.highlight : style === 'disabled' ? COLORS.disabled : style === 'danger' ? COLORS.danger : COLORS.button;
        drawPanel(node.addComponent(Graphics), width, height, fill, 8, style === 'highlight' ? ACCENT : undefined);
        addLabel(node, str, size, textColor, { width: width - 12, height });
        addBadge(node, width / 2 - 8, height / 2 - 6, badge);
        node.on(Node.EventType.TOUCH_END, () => {
            // 拖动滚动时不算点击；禁用的按钮不响应（页签除外，灰色只表示没选中）
            if (this.dragDistance > DRAG_THRESHOLD || (style === 'disabled' && !clickableWhenDisabled)) return;
            sfx('click');
            punch(node);
            onClick();
        });
        this.cursorY -= height;
    }

    private gap(px: number): void {
        this.cursorY -= px;
    }
}

const HELP_LINES = [
    '· 时间只在你在线时走，离线时营地暂停，只攒一点挂机收益。',
    '· 开局只有伊森一个人。去“探索”派人搜刮，第一次回来会遇到别的幸存者，留谁由你决定。',
    '· 每个人有专长、天赋、特质（有好有坏，有的坏毛病藏着）、心情和精力。',
    '· 晚上要有人轮流守夜；不是每晚都有尸潮，来了就守住营地的四个门：点人再点门调人，直接点门花木材修门。',
    '· 打赢探索后要把战利品装进背包，装不下的只能留下。背包、车越大，能带的越多。',
    '· 地图分区勘察能驱散迷雾；远的区要自行车、摩托或汽车才能去。',
    '· 黄金只在前期值钱，早点花掉。',
    '· 人会死，全死光营地就覆灭。比的是你能坚持多少天。',
];

/** 地点里可能遇到的敌人：种类 + 大概的数量（1 只 / 几只 / 一群），特殊的排前面 */
function enemyHint(config: GameConfig, loc: LocationDef): string {
    const reg = battleRegistry(config);
    const counts = new Map<string, number>();
    for (const e of loc.enemies) counts.set(e.unit, (counts.get(e.unit) ?? 0) + 1);
    const parts = [...counts.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([id, n]) => `${reg.hasUnit(id) ? reg.unit(id).name : id}${n === 1 ? ' 1 只' : n <= 3 ? ' 几只' : ' 一群'}`);
    return parts.join('、') || '看不出来';
}

/** 背包里每种东西一个颜色 */
function pieceColor(p: LootPiece): Color {
    if (p.kind === 'prop') return new Color(120, 80, 140, 240);
    const colors: Record<string, string> = { food: '#a8743a', wood: '#7a5a34', parts: '#5a6a78', medicine: '#3a8a6a', cans: '#9a8a3a' };
    return hexColor(colors[p.item] ?? '#666666');
}

/** 精力：😴 越低越累 */
function sleepText(sleep: number | undefined): string {
    const v = Math.round(sleep ?? 100);
    return `${v < 50 ? '🥱' : '⚡'} 精力 ${v}`;
}

/** 花费和现有：🪵19/150 ⚙️23/60（不够的打个 ✗） */
function formatCostHave(config: GameConfig, have: Record<string, number>, cost: ResourceBag): string {
    const parts = RESOURCE_IDS.filter((id) => cost[id]).map((id) => {
        const icon = config.resources.find((r) => r.id === id)?.icon ?? id;
        const own = Math.floor(have[id] ?? 0);
        return `${icon}${own}/${cost[id]}${own < cost[id]! ? '✗' : ''}`;
    });
    return parts.length > 0 ? parts.join(' ') : '免费';
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
    if (lv.plots) parts.push(`菜地 ${lv.plots} 块`);
    if (lv.pens) parts.push(`能养 ${lv.pens} 只牲口`);
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
