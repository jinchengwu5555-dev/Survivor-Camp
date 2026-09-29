// 游戏核心类型定义。
// core/ 目录下的代码不依赖 Cocos（不 import 'cc'），可以直接在 Node 里跑单元测试。

import type { BattleResult, SkillDef, StatusDef, UnitDef } from './battle/types';
import type { BattleSetup, UnitSetup } from './battle/Battle';
import type { ClockState } from './clock';

export type ResourceId = 'food' | 'wood' | 'parts' | 'medicine' | 'cans';
export const RESOURCE_IDS: ResourceId[] = ['food', 'wood', 'parts', 'medicine', 'cans'];

export type ResourceBag = Partial<Record<ResourceId, number>>;

export type Specialty = 'leader' | 'cook' | 'medic' | 'mechanic' | 'scavenger' | 'fighter' | 'farmer';

// ---------- 配置（来自 assets/resources/config/*.json） ----------

export interface BalanceDef {
    /** 每个幸存者每分钟吃掉的食物 */
    foodPerSurvivorPerMinute: number;
    /**
     * 在线时钟：游戏时间只在在线时走，1 秒真实时间 = onlineTimeScale 秒游戏时间；
     * 两次心跳间隔超过 onlineGapSeconds 秒就算离线（见 core/clock.ts）
     */
    clock: { onlineTimeScale: number; onlineGapSeconds: number };
    /**
     * 离线挂机收益：离线 1 分钟 = gameMinutesPerRealMinute 分钟的产量，只发 resources 里的资源，
     * 最多算 capHours 小时，不足 minMinutes 分钟不发（见 core/offline.ts）
     */
    offline: { capHours: number; minMinutes: number; gameMinutesPerRealMinute: number; resources: ResourceId[] };
    /** 专长对口时的产量倍率 */
    specialtyBonus: number;
    /** 吃饱时心情每分钟恢复多少（最高到 moodRecoveryMax） */
    moodRecoveryPerMinute: number;
    moodRecoveryMax: number;
    /** 挨饿时心情每分钟下降多少 */
    hungerMoodPenaltyPerMinute: number;
    /** 新加入幸存者的初始心情 */
    newSurvivorMood: number;
    /** 随机事件间隔（分钟） */
    eventIntervalMinutes: number;
    /** 游戏里的一天有多少（游戏）分钟；在线时按 clock.onlineTimeScale 倍速走 */
    dayLengthMinutes: number;
    /** 同时能进行几个建造 */
    buildQueueSize: number;
    startingResources: ResourceBag;
    startingSurvivors: string[];
    /** 资源基础上限；不写的资源没有上限 */
    baseStorage: ResourceBag;
    /** 探索打赢后，这个地点要过多少分钟才能再去（物资重新聚起来） */
    locationRestockMinutes: number;
    /** 探索小队最多几个人 */
    maxSquadSize: number;
    /** 受伤后自然恢复需要的分钟数 */
    injuryRecoveryMinutes: number;
    /** 在医务室立即治好一个伤员的花费 */
    healCost: ResourceBag;
    /** 尸潮夜袭的间隔（分钟） */
    raidIntervalMinutes: number;
    /** 第 1 集结束后，第一次尸潮多少分钟后就来（新手尽早体验守夜） */
    firstRaidMinutes: number;
    /** 守夜时花木材修补栅栏：每次回 hpRatio 的栅栏生命，花费 = 回的生命 × woodPerHp（至少 minWood），每场最多 maxUses 次 */
    raidRepair: { hpRatio: number; woodPerHp: number; minWood: number; maxUses: number };
    /** 守夜时最多几个人上阵 */
    maxDefenders: number;
    /** 栅栏在战斗中的生命 = 安全值 × 这个数 */
    barricadeHpPerSafety: number;
    /** 守夜失败时损失的资源比例 */
    raidLossRatio: number;
    /** 新鲜食物每分钟腐烂的比例（0.001 = 每分钟 0.1%）；罐头不会坏 */
    foodSpoilPerMinute: number;
    /** 冬天没柴取暖时，心情每分钟下降多少 */
    coldMoodPenaltyPerMinute: number;
    /** 每第几次尸潮是血月夜；0 = 关闭 */
    bloodMoonEvery: number;
    /** 血月夜击退后奖励的倍数 */
    bloodMoonRewardMultiplier: number;
    /** 最多同时接几个悬赏 */
    maxActiveBounties: number;
    /** 猎人等级：累计悬赏经验达到 xp 就升到这一级 */
    hunterRanks: { name: string; xp: number }[];
    /** 看一次广告加速：剩余时间减少 fraction（至少 minMinutes 分钟），不够就直接完成 */
    adSpeedUp: { minMinutes: number; fraction: number };
    /**
     * 无尽尸潮：从 startDay 开始，每过 daysPerLevel 天所有尸潮丧尸 +1 级，奖励 ×rewardGrowth。
     * 喘息机制：每输一次，之后的尸潮加成 -reliefPerLoss；每赢一次恢复 reliefRecoverPerWin，避免越输越穷的死循环。
     */
    raidScaling: { startDay: number; daysPerLevel: number; rewardGrowth: number; reliefPerLoss: number; reliefRecoverPerWin: number };
    /** 探索随指挥部成长：指挥部每高一级，敌人 +enemyLevelPerHq 级（向下取整），战利品 ×lootGrowth */
    expeditionScaling: { enemyLevelPerHq: number; lootGrowth: number };
    /** 战斗中倒下后死亡的概率（否则只是重伤） */
    deathChanceOnFall: number;
    /** 医务室每一级让死亡概率降低多少（比例），最多降 70% */
    deathReductionPerInfirmaryLevel: number;
    /** 新手保护：前几天不会死人 */
    deathGraceDays: number;
    /** 守夜失败、尸群冲进营地时被咬死的人数 */
    raidBreachDeaths: number;
    /** 连续挨饿 / 挨冻累计多少分钟会死一个人 */
    hardshipDeathMinutes: number;
    /** 开局的营地 */
    startingSite: string;
    /** 镇地图的战争迷雾：营地、已解锁地点、已打下的地点、已发现的营地地点周围多大范围可见 */
    townMap: { revealCamp: number; revealKnown: number; revealCleared: number; revealSite: number };
    /**
     * 不是每晚都有尸潮：每晚来的概率 = base + perDay × 天数，最多 max。第一次尸潮必来。
     */
    raidChance?: { base: number; perDay: number; max: number };
    /**
     * 轮流守夜：每 survivorsPerWatcher 个人要 1 个人守夜（至少 1 个）。
     * 守夜的人精力 -watchCost，其他人睡一觉 +restGain。精力低于 tiredBelow 时干活和攻击打折扣，精力 0 时只剩 minFactor。
     * 守夜人手不够时，尸潮来了栅栏生命只有 understaffedWallFactor。
     */
    nightWatch?: {
        survivorsPerWatcher: number;
        watchCost: number;
        restGain: number;
        tiredBelow: number;
        minFactor: number;
        understaffedWallFactor: number;
    };
    /** 开局送的背包道具 */
    startingProps?: Record<string, number>;
    /** 搬迁：只能带走 carryRatio 的物资，每人路上吃 foodPerSurvivor 食物，搬完后 cooldownDays 天内不能再搬 */
    relocation: { carryRatio: number; foodPerSurvivor: number; cooldownDays: number };
}

export interface ResourceDef {
    id: ResourceId;
    name: string;
    icon: string;
}

export interface BuildingLevelDef {
    /** 升到这一级的花费 */
    cost: ResourceBag;
    /** 升到这一级需要的秒数 */
    buildSeconds: number;
    /** 需要指挥部达到的等级 */
    requiresHq?: number;
    /** 每个工人每分钟的产量 */
    production?: ResourceBag;
    workerSlots?: number;
    /** 增加的资源上限 */
    storage?: ResourceBag;
    /** 提供的床位 */
    beds?: number;
    /** 提供的安全值 */
    safety?: number;
    /** 所有幸存者的战斗等级 +N */
    battleLevel?: number;
    /** 食物腐烂速度降低的比例（0.3 = 慢 30%），多个建筑相加，最多 90% */
    spoilReduction?: number;
    /** 工坊等级：决定能做哪些物品 */
    workshopLevel?: number;
}

/**
 * 建筑的成长公式：手写的 levels 之后，按公式自动生成到 maxLevel 级（见 core/configExpand.ts）。
 * 每一级都在上一级的基础上乘以 xxxGrowth 或加上 xxxPerLevel。
 */
export interface BuildingScaling {
    maxLevel: number;
    /** 升级花费倍率 */
    costGrowth: number;
    /** 建造时间倍率 */
    timeGrowth: number;
    productionGrowth?: number;
    storageGrowth?: number;
    safetyGrowth?: number;
    bedsPerLevel?: number;
    /** 每升几级多一个工人岗位 */
    slotsEvery?: number;
    battleLevelPerLevel?: number;
    spoilPerLevel?: number;
}

export interface BuildingDef {
    id: string;
    name: string;
    /** 营地画面上的图标（还没有美术时用 emoji） */
    icon?: string;
    /** 在营地地图上的位置（相对地图中心，单位是设计分辨率的像素），scale 是显示大小倍率 */
    map?: { x: number; y: number; scale?: number };
    description: string;
    /** 对口专长，分配对口的幸存者产量更高 */
    specialty?: Specialty;
    /** 开局等级（0 = 未建造） */
    startLevel: number;
    /** levels[i] 表示第 i+1 级 */
    levels: BuildingLevelDef[];
    /** 可选：手写等级之后按公式自动生成更多等级 */
    scaling?: BuildingScaling;
    /** 升级阶段：到了 level 级换一个样子（篝火 → 烤架 → 厨房），按 level 从小到大写 */
    stages?: BuildingStage[];
    /** 什么时候能建：指挥部等级、营地人数（没写 = 一开始就能建） */
    unlock?: { hq?: number; survivors?: number };
}

export interface BuildingStage {
    level: number;
    name: string;
    icon: string;
    description?: string;
}

export interface SurvivorDef {
    id: string;
    name: string;
    title: string;
    specialty: Specialty;
    traits: string[];
    /** 天赋（talents.json 的 id） */
    talents?: string[];
    /** 核心角色不会因为随机事件离开或死亡 */
    isHero: boolean;
    /** 战斗中使用的角色（units.json 的 id） */
    battleUnit?: string;
    bio: string;
}

export type SurvivorTarget = string | 'random' | 'all';

export type Effect =
    | { type: 'resource'; resource: ResourceId; amount: number }
    | { type: 'mood'; amount: number; target?: SurvivorTarget }
    | { type: 'addSurvivor'; survivor: string }
    /** 随机生成一个流浪者加入（可以指定专长） */
    | { type: 'addWanderer'; specialty?: Specialty }
    /** 发现一个新的营地地点 */
    | { type: 'discoverSite'; site: string }
    | { type: 'removeSurvivor'; survivor: string | 'random' }
    | { type: 'injure'; survivor: string | 'random' }
    /** 在危险里倒下：按死亡概率牺牲或重伤（新手保护期内只会受伤） */
    | { type: 'fall'; survivor: string | 'random'; cause?: string }
    | { type: 'heal'; survivor: string | 'all' }
    | { type: 'flag'; flag: string }
    | { type: 'triggerEvent'; event: string }
    /** 累计统计数据（成就、悬赏会用到），amount 默认 1 */
    | { type: 'stat'; stat: string; amount?: number }
    /** 获得背包道具，amount 默认 1 */
    | { type: 'prop'; prop: string; amount?: number };

export interface Condition {
    minDay?: number;
    minSurvivors?: number;
    /** 这些 flag 都必须存在 */
    flags?: string[];
    /** 这些 flag 都不能存在 */
    notFlags?: string[];
    /** 这些幸存者必须在营地里 */
    hasSurvivors?: string[];
    /** 指挥部至少几级（营地变大了才会发生的事） */
    minHq?: number;
}

export interface EventOutcomeDef {
    weight: number;
    text: string;
    effects: Effect[];
}

export interface EventChoiceDef {
    text: string;
    /** 选这个选项要先付出的资源 */
    cost?: ResourceBag;
    outcomes: EventOutcomeDef[];
}

export interface GameEventDef {
    id: string;
    title: string;
    text: string;
    /** 随机抽取权重；0 = 只能由剧情或其他事件触发 */
    weight: number;
    /** 只会发生一次 */
    once?: boolean;
    conditions?: Condition;
    choices: EventChoiceDef[];
    /** 事件卡上显示谁的立绘（幸存者 id）；不写就用正文里第一个提到的人 */
    speaker?: string;
}

export type Objective =
    | { type: 'buildingLevel'; building: string; level: number; text: string }
    | { type: 'resource'; resource: ResourceId; amount: number; text: string }
    | { type: 'flag'; flag: string; text: string }
    | { type: 'survivors'; count: number; text: string }
    /** 统计数据达到 amount，比如击杀数、守夜胜利次数 */
    | { type: 'stat'; stat: string; amount: number; text: string }
    /** 营地存活到第 day 天 */
    | { type: 'day'; day: number; text: string };

export interface EpisodeDef {
    id: string;
    season: number;
    episode: number;
    title: string;
    /** 本集开始时触发的剧情事件 */
    startEvent?: string;
    objectives: Objective[];
    rewards?: ResourceBag;
    /** 本集完成时触发的剧情事件（悬念结尾） */
    endEvent?: string;
}

/** 镇地图上的坐标（地图中心为原点，大约 -330～330） */
export interface MapPoint {
    x: number;
    y: number;
}

export interface LocationDef {
    id: string;
    name: string;
    /** 在镇地图上的位置 */
    map?: MapPoint;
    /** 镇地图上的图标（还没有美术时用 emoji） */
    icon?: string;
    description: string;
    /** 往返需要的分钟数 */
    durationMinutes: number;
    /** 满足条件才会出现在地图上 */
    conditions?: Condition;
    enemies: UnitSetup[];
    /** 战斗时间上限（秒） */
    timeLimit: number;
    /** 打赢后的战利品 */
    loot: ResourceBag;
    /** 第一次打赢时记下的剧情标记 */
    firstClearFlag?: string;
    /** 第一次打赢时触发的事件 */
    firstClearEvent?: string;
    /** 第一次打赢时发现的营地地点 */
    discoversSite?: string;
    /** 打赢后救回一个流浪者的概率 */
    recruitChance?: number;
    /** 打赢后可能找到的道具 */
    drops?: PropDrop[];
}

export interface RaidDef {
    id: string;
    name: string;
    /** 满足条件的尸潮里，取列表中最后一个（越往后越难） */
    conditions?: Condition;
    enemies: UnitSetup[];
    /** 撑过多少秒就算守住 */
    timeLimit: number;
    reward: ResourceBag;
    /** 守住后可能得到的道具 */
    drops?: PropDrop[];
}

export interface SeasonDef {
    id: string;
    name: string;
    icon: string;
    /** 这个季节持续几天 */
    days: number;
    /** 食物产量倍率 */
    foodProduction: number;
    /** 每个幸存者每分钟烧掉多少木材取暖 */
    heatingWoodPerSurvivorPerMinute: number;
    /** 食物腐烂速度倍率（冬天冷，坏得慢） */
    spoilMultiplier: number;
    description: string;
    /** 进入这个季节时触发的事件 */
    startEvent?: string;
}

export interface ItemDef {
    id: string;
    name: string;
    icon: string;
    description: string;
    /** 需要的工坊等级 */
    workshopLevel: number;
    cost: ResourceBag;
    /** 战斗中携带者获得的技能（skills.json），用掉才消耗 */
    battleSkill: string;
}

export interface BountyDef {
    id: string;
    title: string;
    description: string;
    /** 需要的猎人等级（hunterRanks 的下标） */
    rank: number;
    conditions?: Condition;
    /** 接取之后，这个统计值再增加 amount 就算完成 */
    goal: { stat: string; amount: number };
    reward: ResourceBag;
    xp: number;
}

export interface AchievementDef {
    id: string;
    name: string;
    description: string;
    icon: string;
    /** 隐藏成就：解锁前只显示“？？？” */
    hidden?: boolean;
    goal: Objective;
    reward: ResourceBag;
}

/** 营地地点的效果。倍率不写就是 1，加减不写就是 0 */
export interface SiteModifiers {
    /** 产量倍率，比如 { "food": 1.5 } */
    production?: ResourceBag;
    /** 不需要工人的被动产出（每分钟），比如水坝的鱼 */
    passive?: ResourceBag;
    /** 安全值倍率（影响栅栏生命） */
    safety?: number;
    /** 额外床位 */
    beds?: number;
    /** 食物腐烂倍率 */
    spoil?: number;
    /** 养伤时间倍率（越小好得越快） */
    injuryRecovery?: number;
    /** 战斗倒下后的死亡概率倍率 */
    deathChance?: number;
    /** 尸潮等级加减 */
    raidLevel?: number;
    /** 所有人的战斗等级加成 */
    battleLevel?: number;
}

export interface SiteDef {
    id: string;
    name: string;
    icon: string;
    /** 在镇地图上的位置（营地就画在当前营地地点的位置上） */
    map?: MapPoint;
    description: string;
    /** 一句话优点 / 缺点，界面上显示 */
    pros: string;
    cons: string;
    modifiers: SiteModifiers;
    /** 搬过来时栅栏保留原来等级的比例 */
    wallRetention: number;
    /** 这里自带的栅栏等级（比如警局本来就有铁门） */
    minWallLevel: number;
    /** 路上的伏击战 */
    journey: { enemies: UnitSetup[]; timeLimit: number };
    /** 到达时触发的事件 */
    arrivalEvent?: string;
}

/** 随机流浪者的生成素材 */
export interface WandererDef {
    names: string[];
    titles: Record<Specialty, string[]>;
    traits: string[];
    specialties: Specialty[];
    /** 流浪者战斗时用的角色 */
    battleUnit: string;
}

export interface GameConfig {
    balance: BalanceDef;
    resources: ResourceDef[];
    buildings: BuildingDef[];
    survivors: SurvivorDef[];
    events: GameEventDef[];
    episodes: EpisodeDef[];
    locations: LocationDef[];
    raids: RaidDef[];
    seasons: SeasonDef[];
    items: ItemDef[];
    bounties: BountyDef[];
    achievements: AchievementDef[];
    sites: SiteDef[];
    wanderers: WandererDef;
    pickups: PickupConfig;
    daily: DailyConfig;
    trader: TraderConfig;
    props: PropDef[];
    talents: TalentDef[];
    scouting: ScoutingConfig;
    /** 营地闲聊（老配置没有） */
    chatter?: ChatterConfig;
    /** 镇地图分区（老配置没有） */
    districts?: DistrictsConfig;
    /** 交通工具（老配置没有） */
    vehicles?: VehicleDef[];
    /** 探索背包：资源怎么分包、占几格、多重（老配置没有） */
    packing?: PackingConfig;
    /** 每局随机地名的名字池（老配置没有） */
    names?: NamesConfig;
    units: UnitDef[];
    skills: SkillDef[];
    statuses: StatusDef[];
}

/** 路边拾荒：营地附近时不时出现可以点一下捡走的东西（pickups.json） */
export interface PickupKindDef {
    id: string;
    name: string;
    icon: string;
    weight: number;
    /** 基础奖励，随指挥部等级按探索战利品的倍率成长 */
    reward: ResourceBag;
    /** 捡到时的一句话 */
    text: string;
    /** 算作消灭一只丧尸（统计 zombies_killed） */
    kill?: boolean;
    /** 捡到时可能顺便得到的道具 */
    drops?: PropDrop[];
}

export interface PickupConfig {
    /** 平均每多少（游戏）分钟出现一个（实际在 0.5～1.5 倍之间随机） */
    intervalMinutes: number;
    /** 最多同时有几个 */
    maxActive: number;
    /** 多少分钟没人捡就消失 */
    lifetimeMinutes: number;
    kinds: PickupKindDef[];
}

/**
 * 背包道具（props.json）。type 决定用法：
 *   resource  打开得到 reward（随指挥部等级成长，罐头不成长）
 *   speedup   正在升级的建筑减少 minutes 分钟（游戏时间）
 *   recall    在外探索的小队立即回来
 *   mood      所有人心情 +amount
 *   heal      治好所有伤员
 *   recruit   招来一个流浪者（需要空床位）
 *   chest     从 contents 里随机开出一样（道具或资源）
 *   gear      装备：在幸存者档案里穿戴（slot + gear 属性），不能直接“使用”
 */
export type PropType = 'resource' | 'speedup' | 'recall' | 'mood' | 'heal' | 'recruit' | 'chest' | 'gear';

export type GearSlot = 'weapon' | 'armor' | 'tool';
export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'tool'];

/** 装备属性：都是倍率 */
export interface GearStats {
    atk?: number;
    hp?: number;
    /** 干活产量（可以限定建筑） */
    work?: { building?: string; mult: number };
    /** 侦察来回时间 */
    scout?: number;
}

export interface PropDef {
    id: string;
    name: string;
    icon: string;
    description: string;
    type: PropType;
    reward?: ResourceBag;
    minutes?: number;
    amount?: number;
    contents?: { weight: number; prop?: string; amount?: number; resources?: ResourceBag }[];
    /** type = gear 时：装在哪个位置、有什么属性 */
    slot?: GearSlot;
    gear?: GearStats;
    /** type = gear 时：工坊能不能打造（需要的工坊等级和资源） */
    craft?: { workshopLevel: number; cost: ResourceBag };
    /** 在探索背包里占几格（宽 × 高）、多重；不写用 packing 的默认值 */
    size?: [number, number];
    weight?: number;
}

/** 天赋（talents.json），见 core/talents.ts */
export interface TalentDef {
    id: string;
    name: string;
    icon: string;
    description: string;
    /** false = 流浪者抽不到（比如“天生的领袖”只属于伊森） */
    wanderer?: boolean;
    effects: {
        work?: { building?: string; mult: number };
        combat?: { atk?: number; hp?: number };
        recovery?: number;
        scout?: number;
        moodRecovery?: number;
    };
}

/** 侦察点（scouting.json）：镇地图上冒出来的小地点，派一个人去一趟，带回东西或触发事件 */
export interface ScoutKindDef {
    id: string;
    name: string;
    icon: string;
    weight: number;
    /** 来回要多少分钟（游戏时间） */
    travelMinutes: number;
    /** 带回的资源（随指挥部等级成长，罐头不成长） */
    reward: ResourceBag;
    drops?: PropDrop[];
    /** 到了以后触发的事件 */
    event?: string;
    text: string;
    /** 满足条件才会刷出来（比如空投要到中后期） */
    conditions?: Condition;
}

export interface ScoutingConfig {
    intervalMinutes: number;
    maxActive: number;
    lifetimeMinutes: number;
    /** 侦察回来时受伤的概率 */
    injuryChance: number;
    kinds: ScoutKindDef[];
}

/** 道具掉落：chance 概率（默认 1）掉 amount 个（默认 1） */
export interface PropDrop {
    prop: string;
    chance?: number;
    amount?: number;
}

/** 流浪商人的一笔交易（trader.json）：给出 give，换来 get */
export interface TraderOfferDef {
    id: string;
    give: ResourceBag;
    get: ResourceBag;
    /** 换来的道具（道具 id → 数量） */
    getProps?: Record<string, number>;
    weight: number;
}

/** 流浪商人：第 firstDay 天起，每隔 intervalMinutes 来一次，待 stayMinutes，每次随机摆 offersPerVisit 笔交易 */
export interface TraderConfig {
    firstDay: number;
    intervalMinutes: number;
    stayMinutes: number;
    offersPerVisit: number;
    /** 每次来的时候，换到的数量在 ±priceJitter 之间浮动（有时划算，有时不划算） */
    priceJitter: number;
    /** 每次来访能看广告刷新几次货架 */
    refreshesPerVisit: number;
    offers: TraderOfferDef[];
}

/** 每日目标：每个游戏日从任务池里抽几个，用统计数据判断进度（daily.json） */
export interface DailyTaskDef {
    id: string;
    text: string;
    stat: string;
    amount: number;
    reward: ResourceBag;
    conditions?: Condition;
    /** 需要这个建筑至少 1 级才会抽到 */
    requiresBuilding?: string;
}

export interface DailyConfig {
    /** 每天抽几个 */
    tasksPerDay: number;
    /** 全部完成后的宝箱（随指挥部等级成长） */
    chest: ResourceBag;
    /** 宝箱里的道具 */
    chestProps?: PropDrop[];
    tasks: DailyTaskDef[];
}

// ---------- 存档状态 ----------

export interface BuildingState {
    id: string;
    level: number;
    /** 正在升级时，完成的时间戳（毫秒）；否则为 null */
    upgradeEndsAt: number | null;
}

/** 随机生成的流浪者的资料（有名有姓的角色资料在 survivors.json 里） */
export interface SurvivorProfile {
    name: string;
    title: string;
    specialty: Specialty;
    traits: string[];
    talents?: string[];
    battleUnit?: string;
}

export interface SurvivorState {
    id: string;
    /** 只有流浪者有：他们不在 survivors.json 里 */
    profile?: SurvivorProfile;
    /** 0～100 */
    mood: number;
    injured: boolean;
    /** 受伤后自然痊愈的时间戳；没受伤为 null */
    recoverAt: number | null;
    /** 分配到的建筑 id；null = 空闲 */
    assignment: string | null;
    /** 身上的装备（道具 id） */
    gear?: Partial<Record<GearSlot, string>>;
    /** 精力 0～100（没有 = 100）：守夜会累，睡一晚恢复。太累时干活、打仗都打折扣 */
    sleep?: number;
    /** 守夜安排：auto 轮班（默认）/ always 固定守夜 / never 不守夜 */
    watch?: WatchMode;
    /** 最近几次心情变化的原因（见 core/mood.ts） */
    moodNotes?: { at: number; text: string; amount: number }[];
}

export type WatchMode = 'auto' | 'always' | 'never';

export interface LogEntry {
    at: number;
    text: string;
}

export interface ExpeditionState {
    id: number;
    location: string;
    squad: string[];
    startedAt: number;
    returnsAt: number;
    seed: number;
    /** 开的什么车（不开车为空） */
    vehicle?: string;
}

/** 战报：保存了完整的战斗参数，界面可以用同一个种子重放整场战斗 */
export interface BattleReport {
    id: number;
    kind: 'expedition' | 'raid' | 'journey';
    title: string;
    at: number;
    result: BattleResult;
    setup: BattleSetup;
    loot: ResourceBag;
    lost: ResourceBag;
    injured: string[];
    /** 战死的人（名字，死后资料可能已经删掉） */
    dead?: string[];
    summary: string;
}

export interface GameState {
    version: number;
    createdAt: number;
    lastTickAt: number;
    /** 在线时钟（第 6 版存档新增） */
    clock: ClockState;
    /** 地点 id → 什么时候（游戏时间）物资重新聚起来，可以再去探索（第 6 版存档新增） */
    restockAt: Record<string, number>;
    resources: Record<ResourceId, number>;
    buildings: Record<string, BuildingState>;
    survivors: SurvivorState[];
    flags: string[];
    seenEvents: string[];
    /** 等待玩家处理的事件队列（第一个是当前事件） */
    eventQueue: string[];
    nextRandomEventAt: number;
    /** 当前剧情集在 episodes 里的下标；等于 episodes.length 表示主线已全部完成 */
    episodeIndex: number;
    rngState: number;
    log: LogEntry[];
    expeditions: ExpeditionState[];
    nextRaidAt: number;
    reports: BattleReport[];
    /** 自增 id，给远征和战报用 */
    nextId: number;
    /** 累计统计：击杀数、胜利次数等，成就和悬赏都读这里 */
    stats: Record<string, number>;
    achievements: { id: string; at: number }[];
    /** 工坊做出来的物品库存 */
    items: Record<string, number>;
    bounties: { active: { id: string; baseline: number }[]; completed: string[] };
    hunterXp: number;
    /** 已经发生过几次尸潮（用来算血月夜） */
    raidCount: number;
    /** 上一次结算时的季节，用来发现换季 */
    seasonId: string;
    /** 喘息值：守夜失败后尸潮减弱的等级数 */
    raidRelief: number;
    /** 当前所在的营地地点 */
    siteId: string;
    /** 已经发现的营地地点 */
    discoveredSites: string[];
    lastRelocationAt: number | null;
    /** 连续挨饿 / 挨冻的累计分钟数，吃饱穿暖后清零 */
    hardshipMinutes: number;
    /** 营地覆灭（所有人都死了）；覆灭后游戏停止 */
    gameOver: GameOverInfo | null;
    /** 等玩家亲手守夜的尸潮；没有时为 null / 不存在（老存档） */
    pendingRaid?: PendingRaid | null;
    /** 营地附近可以捡的东西（老存档没有，用到时补上） */
    pickups?: PickupState[];
    nextPickupAt?: number;
    /** 今天的每日目标（老存档没有，用到时补上） */
    daily?: DailyState;
    /** 流浪商人（老存档没有，用到时补上） */
    trader?: TraderState;
    /** 镇地图上的侦察点、正在侦察的人（老存档没有，用到时补上） */
    scoutSpots?: ScoutSpotState[];
    scouts?: ScoutState[];
    nextScoutSpotAt?: number;
    /** 背包道具：道具 id → 数量（老存档没有，用到时补上） */
    props?: Record<string, number>;
    /** 界面红点：已经看过的新内容（见 core/badges.ts） */
    seen?: SeenState;
    /** 上一晚的守夜情况（见 core/watch.ts） */
    lastNight?: NightState;
    /** 心情跨档的次数（统计用） */
    moodShifts?: number;
    /** 营地闲聊：说过的对话 id、最近的几段、下一段的时间（见 core/chatter.ts） */
    chatterSeen?: string[];
    chatter?: ChatterEntry[];
    nextChatAt?: number;
    /** 拥有的交通工具 id（老存档没有，用到时补上） */
    vehicles?: string[];
    /** 正在勘察分区的小队、勘察驱散迷雾的点、已经探索完的分区 */
    surveys?: SurveyState[];
    surveyed?: { x: number; y: number; r: number }[];
    districtsCompleted?: string[];
    /** 这一局的随机地名（见 core/names.ts；老存档没有，用配置里的默认名字） */
    names?: { town: string; districts: Record<string, string>; locations: Record<string, string> };
    /** 死在外面的人留下的装备：地点 id → 道具 id → 数量（见 core/gear.ts） */
    droppedGear?: Record<string, Record<string, number>>;
    /** 探索回来、等玩家装背包的战利品（见 core/packing.ts） */
    pendingHauls?: HaulState[];
}

export interface SurveyState {
    id: number;
    district: string;
    squad: string[];
    vehicle?: string;
    startedAt: number;
    returnsAt: number;
}

/** 一件战利品：一包资源或者一个道具 */
export interface LootPiece {
    id: number;
    kind: 'resource' | 'prop';
    /** 资源 id 或道具 id */
    item: string;
    amount: number;
    w: number;
    h: number;
    weight: number;
}

export interface PackedPiece {
    piece: number;
    x: number;
    y: number;
    /** 转了 90 度 */
    rotated: boolean;
}

export interface HaulState {
    id: number;
    title: string;
    at: number;
    pieces: LootPiece[];
    packed: PackedPiece[];
    grid: [number, number];
    maxWeight: number;
}

export interface DistrictDef {
    id: string;
    name: string;
    icon: string;
    description: string;
    /** 地图上的范围（和 locations 的 map 坐标一样） */
    rect: { x1: number; y1: number; x2: number; y2: number };
    /** 要什么等级的交通工具才能去：0 走路，1 自行车，2 摩托 / 皮卡，3 货车 */
    tier: number;
    /** 勘察一趟要多少游戏分钟（会乘交通工具的速度） */
    surveyMinutes: number;
    /** 勘察的人受伤的概率 */
    danger: number;
    /** 勘察带回的资源（随指挥部等级按一半指数成长） */
    loot: ResourceBag;
    drops?: PropDrop[];
    /** 整个区都探索完的一次性奖励 */
    complete?: { resources?: ResourceBag; props?: Record<string, number> };
}

export interface DistrictsConfig {
    /** 计算探索进度的网格大小 */
    cell: number;
    /** 勘察一次驱散多大一片迷雾 */
    revealRadius: number;
    /** 每个人能背多重 */
    carryPerPerson: number;
    districts: DistrictDef[];
}

export interface VehicleDef {
    id: string;
    name: string;
    icon: string;
    description: string;
    /** 能去的最远分区等级 */
    tier: number;
    /** 探索背包的格子（宽 × 高） */
    grid: [number, number];
    /** 额外能装多重 */
    cargo: number;
    /** 路上时间倍率 */
    speed: number;
    /** 每趟烧几桶汽油（背包道具 gasoline） */
    fuel: number;
    /** 开局就有 */
    startOwned?: boolean;
    /** 这个人加入营地时自带 */
    comesWith?: string;
    /** 自己造：指挥部、工坊等级和资源 */
    obtain?: { hq: number; workshopLevel: number; cost: ResourceBag };
}

export interface NamesConfig {
    towns: string[];
    /** 分区 id → 候选名字 */
    districts: Record<string, string[]>;
    /** 探索地点 id → 候选名字 */
    locations: Record<string, string[]>;
}

export interface PackingConfig {
    /** 不开车时的背包格子 */
    baseGrid: [number, number];
    /** 每种资源打成一包：每包多少、占几格、多重 */
    bundles: Record<ResourceId, { amount: number; size: [number, number]; weight: number }>;
    /** 道具没写 size / weight 时的默认值 */
    defaultPropSize: [number, number];
    defaultPropWeight: number;
}

export type ChatterKind ='chat' | 'gossip' | 'joke' | 'warm' | 'worry' | 'quarrel';

export interface ChatterDialogueDef {
    id: string;
    /** 说话的人：幸存者 id 或 "any" */
    who: string[];
    /** 八卦对象："any" = 随便一个不在说话的人，台词里写 {x} */
    about?: 'any';
    kind: ChatterKind;
    /** [说话人在 who 里的序号, 台词] */
    lines: [number, string][];
    conditions?: Condition;
}

export interface ChatterConfig {
    /** 平均多少游戏分钟聊一段 */
    intervalMinutes: number;
    /** 每种对话给说话人的心情变化 */
    moodByKind: Partial<Record<ChatterKind, number>>;
    dialogues: ChatterDialogueDef[];
}

export interface ChatterEntry {
    at: number;
    id: string;
    kind: ChatterKind;
    lines: { who: string; text: string }[];
}

export interface NightState {
    at: number;
    watchers: string[];
    needed: number;
    /** 这一晚有没有尸潮 */
    raid: boolean;
}

export interface ScoutSpotState {
    id: number;
    kind: string;
    x: number;
    y: number;
    expiresAt: number;
}

export interface ScoutState {
    id: number;
    kind: string;
    survivor: string;
    x: number;
    y: number;
    startedAt: number;
    returnsAt: number;
}

export interface TraderState {
    /** 下一次来的时间（游戏时间） */
    nextVisitAt: number;
    /** 在营地时：什么时候走；不在时为 null */
    leavesAt: number | null;
    /** 第几次来访（红点用） */
    visit: number;
    offers: { id: string; give: ResourceBag; get: ResourceBag; props?: Record<string, number>; bought: boolean }[];
    refreshesLeft: number;
}

export interface SeenState {
    keys: string[];
    /** 看过的最新战报 id */
    reportId: number;
}

export interface PickupState {
    id: number;
    kind: string;
    /** 什么时候消失（游戏时间） */
    expiresAt: number;
}

export interface DailyState {
    /** 第几个游戏日的目标 */
    day: number;
    tasks: { id: string; baseline: number; claimed: boolean }[];
    chestClaimed: boolean;
}

/** 已经来了、等玩家亲手守夜的尸潮（界面关掉再打开会从头再打一次） */
export interface PendingRaid {
    raid: string;
    /** 尸潮来袭的时间（游戏时间） */
    at: number;
    title: string;
    bloodMoon: boolean;
    enemyBonus: number;
    setup: BattleSetup;
    /** 谁带了什么物品（物品 id） */
    carried: { tag: string; item: string }[];
    /** 这场战斗里修补了几次栅栏 */
    repairs: number;
}

export interface GameOverInfo {
    at: number;
    /** 存活到第几天 */
    day: number;
    cause: string;
}

export type ActionResult = { ok: true; message?: string } | { ok: false; reason: string };
