# 美术资源清单与 AI 提示词（像素风）

《末日营地》的美术定为**像素风**：16-bit 年代（超任 / GBA）的像素画，颜色少、描边清楚、没有模糊和渐变。
这份清单列出游戏现在**真正会用到**的图片、文件名、像素尺寸和提示词。**做好一批就交给程序接入**，不用等全部做完，缺的图游戏会继续用色块代替。

> 和以前的日系 SD 版本相比：画风换成像素，删掉了幸存者的技能图标（技能已经删了），
> 除了伊森以外的人在战斗里都用同一个“普通幸存者”小人（`unit_militia`），所以玛莎、德里克这些人**只需要头像**，不用画战斗小人了。
> 建筑可以按升级阶段各画一张（篝火 → 烤架 → 厨房），没画的阶段用这个建筑的通用图。

---

## 一、像素风规范（每张图都要遵守）

### 1.1 尺寸：先大图生成，再用脚本缩成真像素

AI 直接生成小尺寸的图效果很差。**正确做法：让 AI 按下面的提示词生成正常大小的“像素风”图（1024 左右），交给 `tools/process_art.py` 缩成真正的像素网格。** 脚本会按块取色、把颜色压到几十种、去掉半透明的毛边，游戏里再用“最近邻”放大显示，像素是方方正正的。

| 类别 | 文件夹 | 最终像素网格 | 颜色数 | 游戏里大概放大 |
|---|---|---|---|---|
| 战斗小人 | `units` | 64×64（角色身高约 48 像素，脚底贴着画布底边） | 32 | 2～3 倍 |
| 头像 | `portraits` | 64×64（头到胸口） | 32 | 2 倍 |
| 营地建筑 | `buildings` | 96×96 | 40 | 1.5～2 倍 |
| 图标（以后用） | `icons` | 32×32 | 24 | 2 倍 |
| 背景 | `bg` | 宽 360（高按比例） | 48 | 2～4 倍 |

**生成时注意构图**：角色要画得“胖”一点、头大一点（2.5 头身），细节少而大块——缩到 64 像素以后，细线、小装饰、表情纹都会消失。**能在 64×64 里看清的东西才画。**

### 1.2 提示词模板（每张图都套上前缀和后缀）

把每张图表格里的“画面描述”放到中间：

**英文（Midjourney / 即梦 / 可灵 / Stable Diffusion 都能用，效果最好）**

```
前缀：16-bit pixel art, SNES / GBA era game sprite, limited color palette, clean 1-pixel dark outline, flat cel shading with 2-3 tones, no anti-aliasing, crisp square pixels, chunky readable shapes,
（画面描述）
后缀：centered, plain pure white background, no text, no watermark, no ground shadow
```

**中文**

```
前缀：16 位像素风游戏素材，超任 / GBA 时代风格，有限调色板，清晰的 1 像素深色描边，2～3 阶平涂明暗，无抗锯齿，方正清晰的像素，形状大块好辨认，
（画面描述）
后缀：主体居中，纯白背景，没有文字，没有水印，地面没有投影
```

**负面提示词（支持的工具填上）**

```
blurry, anti-aliasing, smooth gradient, soft shading, 3D render, photo, realistic, painterly, airbrush, noise, dithering noise, jpeg artifacts, mixed pixel sizes, half pixels, text, watermark, signature, frame, border
```

Midjourney 建议加：`--style raw --stylize 50`，人物 `--ar 1:1`，背景按下面写的比例。

### 1.3 统一调色板（尽量往这些颜色靠，脚本会再压一次颜色）

末日小镇的配色：**整体偏暗、低饱和，暖色只留给篝火、灯光和伊森的蓝夹克**。

| 用途 | 颜色 |
|---|---|
| 描边 / 最暗 | `#1e1a22` `#2e2730` |
| 皮肤 | `#f0c8a0` `#d29870` `#9a6448` |
| 伊森的蓝 | `#2f4a78` `#4a6fa5` `#8fb0d8` |
| 丧尸绿 | `#3e5a3a` `#6a8a5a` `#9aaa6a` |
| 木头 / 泥土 | `#4e3a26` `#8a6a44` `#b8935e` |
| 灰 / 水泥 / 金属 | `#3c3c44` `#6e6e78` `#a8a8b0` `#dcdcd8` |
| 血月 / 危险 | `#6e2222` `#b04040` |
| 篝火 / 灯光 | `#e07030` `#f0b040` `#f8e090` |

提示词里可以加一句：`muted post-apocalyptic palette, desaturated, warm light only from fire and lamps`。

### 1.4 保持风格一致

1. **先做伊森的战斗小人和头像**，反复生成到满意，作为“风格参考图”。
2. 之后每张都带上参考图：Midjourney 用 `--sref 图片链接`，即梦 / 可灵用“风格参考”。同一个人的头像和小人用 `--cref`（角色参考）或“角色一致性”。
3. 像素图可以直接在 **Aseprite / Piskel**（免费网页版）里手修：缩成 64×64 以后，眼睛、警徽这种关键像素手点几下，效果会好很多。
4. 背景**一定要纯白**（脚本靠白色背景抠图）。角色要有完整的深色描边，不要白衣服贴白背景。

### 1.5 ⚠️ 版权红线

不要画成《行尸走肉》里的标志性造型：**牛仔帽 + 卡其色警长制服**、脏辫女武士拿武士刀、带翅膀皮背心的弩手、缠铁丝网的棒球棍，也不要出现监狱、医院门口“死人勿开”的涂鸦。参考作品（`docs/reference/`）里的角色、地名同样不能画。我们的角色都是原创的，按下面的描述来画。

---

## 二、第一批：战斗小人 → `sprites/units/`（64×64，脚底贴底边）

战斗是横版的：**我方朝右，敌人朝左**。全身、侧身 3/4 视角，2.5 头身。

| 文件名 | 是谁 | 主色 | 画面描述（中文） | 画面描述（英文） |
|---|---|---|---|---|
| `unit_ethan.png` | 伊森 · 副警长（主角，唯一的英雄） | 蓝 `#4a6fa5` | 30 多岁的小镇副警长，棕色短发，胡茬，**深蓝色警用夹克**，胸口一个金色小星星（2～3 个像素就够），右手握手枪枪口朝下，站姿沉稳，身后隐约一点橙色火光（呼应“浴火重生”），全身，朝右 | small-town deputy in his 30s, short brown hair, stubble, **navy blue police jacket**, tiny gold star badge, pistol held pointing down in right hand, steady stance, faint orange ember glow behind him (phoenix motif), full body, facing right |
| `unit_militia.png` | 普通幸存者（除伊森外所有人共用） | 灰绿 `#7a8a7a` | 普通的末日幸存者，看不出男女，戴兜帽，打满补丁的灰绿色卫衣，背一个小背包，手握一根铁管，朝右 | ordinary apocalypse survivor, gender-neutral, hood up, patched grey-green hoodie, small backpack, holding a metal pipe, full body, facing right |
| `unit_dog.png` | 罐头 · 营地的狗 | 金黄 `#c8a050` | 金黄色中型土狗，脖子上系红色旧头巾，竖耳朵，准备冲出去的姿势，朝右 | medium golden mixed-breed dog, old red bandana, ears up, ready-to-charge pose, facing right |
| `barricade.png` | 栅栏（守夜时挡在最前面） | 旧木色 `#8a6a44` | 货架、购物车、木板、轮胎、沙袋堆成的栅栏墙，**正侧面**，高而窄，钉子和铁丝加固，没有人物 | barricade wall made of store shelves, shopping carts, planks, tires and sandbags, **flat side view**, tall and narrow, reinforced with nails and wire, no characters |
| `zombie_walker.png` | 行尸（最普通） | 灰绿 `#6a8a5a` | 灰绿皮肤的丧尸，眼睛是两个白点，破衬衫和牛仔裤，双手前伸摇摇晃晃，傻傻的有点可怜，**不流血**，朝左 | zombie with grey-green skin, two white dot eyes, torn shirt and jeans, arms reaching forward, shambling, goofy and a bit pitiful, **no blood**, full body, facing left |
| `zombie_runner.png` | 奔跑者 | 浅黄绿 `#9aaa6a` | 瘦长的丧尸，浅黄绿皮肤，破运动服和跑鞋，身体前倾正在狂奔，头发乱飞，朝左 | skinny zombie, pale yellow-green skin, torn tracksuit and sneakers, leaning forward mid-sprint, hair flying, facing left |
| `zombie_fatty.png` | 胖子（死后放毒气） | 绿 `#7a9a4a` | 圆滚滚的大胖丧尸，肚子鼓得很大，身边飘着几个淡绿色毒气泡泡，撑破的背心，朝左 | huge round zombie, bloated belly, a few pale green toxic gas bubbles around it, stretched torn tank top, facing left |
| `zombie_armored.png` | 铁甲尸 | 蓝灰 `#5a6a7a` | 戴黄色安全帽、穿反光背心的丧尸，身上绑着铁皮和轮胎当盔甲，看起来很硬，朝左 | zombie in a yellow hard hat and reflective vest, scrap metal plates and tire pieces strapped on as armor, tough, facing left |
| `zombie_brute.png` | 尸群首领（Boss） | 暗红 `#8a3a3a` | 比普通丧尸大一圈的首领，肌肉发达，暗红皮肤，眼睛发红光（2 个亮红像素），破屠夫围裙，拳头巨大，朝左。**这张可以占满 64×64 画布** | zombie boss bigger than normal zombies, muscular, dark red skin, glowing red pixel eyes, torn butcher apron, huge fists, facing left, **fills the whole canvas** |
| `zombie_frenzied.png` | 狂暴感染者 | 红 `#b04040` | 瘦小敏捷的感染者，皮肤泛红，龇牙，四肢着地半蹲准备扑过来，身后两三道红色速度线，朝左 | small agile infected, reddish skin, teeth bared, crouched on all fours ready to pounce, two or three red speed lines behind, facing left |
| `enemy_wild_dog.png` | 野狗 | 棕 `#8a6a4a` | 瘦骨嶙峋的野狗，棕色杂毛，龇牙压低身子准备扑咬，凶但不血腥，朝左 | scrawny feral dog, patchy brown fur, teeth bared, crouched low ready to lunge, fierce but not gory, facing left |
| `enemy_raider.png` | 掠夺者（活人） | 红褐 `#8a4a3a` | 凶悍的掠夺者，光头，脸上涂黑色油彩，钉了铁片的皮背心，拎着一根钉了铁片的木棒，朝左 | fierce raider, shaved head, black face paint, leather vest studded with scrap metal, holding a wooden club with metal plates, facing left |
| `enemy_raider_gunner.png` | 掠夺者枪手（活人） | 深褐 `#6a3a2a` | 戴黑面罩的掠夺者，破皮夹克挂着子弹带，端着旧猎枪瞄准，朝左 | masked raider, worn leather jacket with ammo belt, aiming an old hunting rifle, facing left |

---

## 三、第一批：头像 → `sprites/portraits/`（64×64）

事件卡、幸存者档案、招募界面、墓地都会用。**头到胸口，正面或微侧，表情要大、要看得清**。背景纯白。
（伊森以外的人在战斗里都用普通幸存者小人，头像是他们唯一的“脸”，值得认真做。）

| 文件名 | 是谁 | 画面描述（中文） | 画面描述（英文） |
|---|---|---|---|
| `portrait_ethan.png` | 伊森（主角） | 30 多岁的副警长，棕色短发，胡茬，深蓝警用夹克，胸口小金星，眼神坚毅又有点疲惫和思念，肩后一点橙色火星 | bust portrait, deputy in his 30s, short brown hair, stubble, navy police jacket, tiny gold star, determined yet tired and longing eyes, a few orange embers behind his shoulder |
| `portrait_martha.png` | 玛莎 · 超市老板娘 | 60 岁胖奶奶，灰白发髻，圆框眼镜，碎花裙外面套超市围裙，嘴硬心软的表情 | bust portrait, plump 60-year-old grandma, grey hair bun, round glasses, floral dress with grocery apron, tough-talking but kind face |
| `portrait_derek.png` | 德里克 · 汽修工 | 壮硕的汽修工，寸头，头巾，脸上有机油，皱眉像藏着心事 | bust portrait, burly mechanic, buzz cut, bandana, grease on face, frowning as if hiding something |
| `portrait_sophie.png` | 苏菲 · 护理系学生 | 金色马尾的女生，粉色护士服，紧张地抱着红十字急救包，眼神善良 | bust portrait, nursing student with blonde ponytail, pink scrubs, nervously hugging a red-cross first-aid bag, kind eyes |
| `portrait_toby.png` | 托比 · 加油站店员 | 瘦高小伙，反戴黄色鸭舌帽，加油站黄马甲，比大拇指咧嘴笑 | bust portrait, lanky young man, backwards yellow cap, yellow gas-station vest, thumbs up, big grin |
| `portrait_leo.png` | 里奥 · 高中生 | 17 岁男生，黑色短发，红色连帽卫衣，脸上有泥，眼神冲动勇敢 | bust portrait, 17-year-old boy, short black hair, red hoodie, mud on face, impulsive brave eyes |
| `portrait_hank.png` | 汉克 · 退伍老兵 | 灰白络腮胡，针织帽，军绿旧外套，眯着眼警惕地看前方 | bust portrait, grey-bearded veteran, knit beanie, worn olive army jacket, squinting warily |
| `portrait_rosa.png` | 罗莎 · 花店店主 | 40 岁左右温柔的女人，深色卷发，草帽，园艺围裙，手捧一小包种子，头发上别一朵小花 | bust portrait, gentle woman around 40, dark curly hair, straw hat, gardening apron, holding a seed packet, small flower in her hair |
| `portrait_nora.png` | 诺拉 · 兽医 | 45 岁左右冷静的女人，短发，细框眼镜，白大褂，脖子挂听诊器，嘴角一点冷笑 | bust portrait, calm woman around 45, short hair, thin glasses, white coat, stethoscope, slight sarcastic smirk |
| `portrait_joe.png` | 老乔 · 卡车司机 | 50 多岁大胡子，卡车司机网帽，红黑格子衬衫，乐呵呵地在说话 | bust portrait, bearded trucker in his 50s, mesh trucker cap, red-black plaid shirt, cheerfully talking |
| `portrait_lily.png` | 莉莉 · 伊森的女儿 | 12 岁女孩，棕发扎两个小辫，黄色雨衣，双手握一台旧对讲机，眼神坚强 | bust portrait, 12-year-old girl, brown hair in two small braids, yellow raincoat, holding an old walkie-talkie with both hands, strong eyes |
| `portrait_narrator.png` | 营地旁白（没人说话时） | 木箱上一台老式收音机，天线竖起，旁边一盏小油灯发着暖光，没有人物 | an old radio on a wooden crate, antenna up, a small oil lamp glowing warmly beside it, no characters |
| `portrait_wanderer_1.png` | 流浪者（随机用） | 背大登山包的中年男人，毛线帽，胡子拉碴 | bust portrait, middle-aged man with a big hiking backpack, knit cap, scruffy beard |
| `portrait_wanderer_2.png` | 流浪者 | 围围巾的年轻女人，短发，脸上贴着创可贴 | bust portrait, young woman with a scarf, short hair, a bandage on her cheek |
| `portrait_wanderer_3.png` | 流浪者 | 拄拐杖的白发老爷爷，旧西装马甲 | bust portrait, white-haired old man with a cane, worn suit vest |
| `portrait_wanderer_4.png` | 流浪者 | 头上架着护目镜的少女，工装外套，高马尾 | bust portrait, teenage girl with goggles on her head, work jacket, high ponytail |

> 流浪者头像越多越好，以后可以继续加 `portrait_wanderer_5.png`、`_6`……（告诉我加了几张，我把数量改一下）。

---

## 四、第二批：营地建筑 → `sprites/buildings/`（96×96）

营地是俯视的，建筑用**像素等距视角（2:1 斜 45 度）**，单独一个建筑、四周纯白。

**先做“通用图”**（每个建筑一张，所有阶段都能用），有空再按升级阶段做“阶段图”：升到那个阶段时游戏会自动换图。
阶段图的文件名是 `building_<建筑>_<第几阶段>.png`，比如厨房第 2 阶段“烤架”就是 `building_kitchen_2.png`。

前缀里加一句：`isometric pixel art building, 2:1 isometric angle, single building on a small patch of ground,`

### 4.1 通用图

| 文件名 | 建筑 | 画面描述（中文） | 画面描述（英文） |
|---|---|---|---|
| `building_hq.png` | 指挥部 | 小镇超市的经理办公室，门口插一面小旗，屋顶一根收音机天线，窗户透出暖黄灯光 | small-town supermarket manager's office, small flag at the door, radio antenna on the roof, warm yellow window light |
| `building_wall.png` | 栅栏 | 一段货架、木板、沙袋堆成的防御墙，墙头挂一盏小灯 | a section of defensive wall made of shelves, planks and sandbags, a small lamp hanging on top |
| `building_kitchen.png` | 厨房 | 露天厨房，砖头灶台上一口冒热气的大锅，木桌和挂着的锅碗 | open-air kitchen, big steaming pot on a brick stove, wooden table, hanging pots |
| `building_scrapyard.png` | 废料场 | 小废料场，拆开的旧汽车、轮胎、木板、铁皮堆成堆 | small scrapyard, piles of dismantled car parts, tires, planks and sheet metal |
| `building_infirmary.png` | 医务室 | 药房柜台改的医务室，门口挂红十字布帘，一张病床 | makeshift infirmary from a pharmacy counter, red-cross curtain at the door, one hospital bed |
| `building_dorm.png` | 宿舍 | 仓库一角的睡袋、行军床和小帐篷，晾衣绳和一串小彩灯 | warehouse corner with sleeping bags, camp beds and small tents, clothesline and string lights |
| `building_training.png` | 训练场 | 轮胎、木桩和画着靶心的稻草人 | training ground with tires, wooden posts and a scarecrow with a painted target |
| `building_workshop.png` | 工坊 | 小修车铺改的工坊，卷帘门半开，墙上挂满工具，工作台上有台虎钳 | small garage workshop, roll-up door half open, tools on the wall, workbench with a vise |
| `building_cellar.png` | 地窖 | 地上一扇厚重的地窖门半开，冒出白色冷气，旁边堆着箱子和罐头 | heavy cellar door in the ground half open with white cold mist, crates and cans beside it |
| `building_garden.png` | 菜园 | 停车场撬开柏油翻出的几垄菜畦，绿油油的菜苗，一个堆肥箱和一把锄头 | a few vegetable rows dug out of a parking lot, green seedlings, a compost box and a hoe |
| `building_pen.png` | 畜栏 | 木桩和铁丝网围起来的小畜栏，里面有鸡窝和饲料槽 | small pen fenced with wooden stakes and wire mesh, a chicken coop and a feeding trough inside |
| `building_pond.png` | 鱼塘 | 铺着防水布的小水池，水面有几圈涟漪，边上几丛芦苇 | small pond lined with tarp, ripples on the water, a few reeds at the edge |
| `building_well.png` | 水站 | 一口带手摇泵的水井，旁边几个接雨水的蓝色大桶 | a water well with a hand pump, a few blue rain barrels beside it |

### 4.2 阶段图（可选，做了就会随升级换样子）

| 文件名 | 阶段 | 画面描述（中文） | 画面描述（英文） |
|---|---|---|---|
| `building_hq_1.png` | 📋经理办公室 | 超市角落的小办公室，一张桌子一盏台灯，墙上钉着地图 | tiny office corner, one desk and a desk lamp, a map pinned on the wall |
| `building_hq_2.png` | 🏢指挥中心 | 打通的会议室，长桌、对讲机、值班表黑板 | opened-up meeting room, long table, walkie-talkies, duty roster chalkboard |
| `building_hq_3.png` | 🏛️营地总部 | 两层的小楼，门口挂营地旗帜，窗户都亮着 | two-story building, camp banner at the entrance, all windows lit |
| `building_hq_4.png` | 🏰要塞司令部 | 加固的司令部，沙袋围着，屋顶有探照灯和高高的无线电天线 | fortified headquarters, sandbags around it, searchlight and tall radio mast on the roof |
| `building_wall_1.png` | 🪵木栅栏 | 木桩和货架拼成的矮栅栏 | low fence of wooden stakes and store shelves |
| `building_wall_2.png` | 🧱加固木墙 | 厚木板层层钉牢的墙，前面一道浅沟 | wall of thick nailed planks with a shallow ditch in front |
| `building_wall_3.png` | 🛡️铁皮墙 | 车皮和广告牌焊成的铁皮墙，铆钉一排排 | sheet-metal wall welded from car panels and billboards, rows of rivets |
| `building_wall_4.png` | 🏯水泥围墙 | 灰色水泥墙，顶上拉着铁丝网，一盏探照灯 | grey concrete wall with barbed wire on top and a searchlight |
| `building_kitchen_1.png` | 🔥篝火 | 几块砖头围着一堆篝火，上面架着一口小锅 | a campfire ringed by bricks with a small pot over it |
| `building_kitchen_2.png` | 🍖烤架 | 焊出来的铁烤架，上面烤着肉，旁边一桶水 | welded metal grill with meat roasting, a bucket of water beside it |
| `building_kitchen_3.png` | 🍳厨房 | 熟食区改的厨房，灶台、案板、挂着的锅铲 | kitchen made from a deli counter, stove, cutting board, hanging utensils |
| `building_kitchen_4.png` | 🍲食堂 | 长桌长凳和两口大锅，排班表挂在柱子上 | dining hall with long tables, benches and two big pots, a schedule on a post |
| `building_kitchen_5.png` | 🏭中央厨房 | 大厨房，有熏肉架、腌菜缸和一排罐头 | large kitchen with smoking racks, pickling jars and rows of canned food |
| `building_scrapyard_1.png` | 🗑️废品堆 | 停车场角落的一堆破烂 | a pile of junk in a parking lot corner |
| `building_scrapyard_2.png` | 🔩拆解棚 | 遮雨棚下的工作台和一套扳手 | workbench and wrenches under a rain shelter |
| `building_scrapyard_3.png` | 🏗️废料场 | 分门别类的废料堆，一台小吊车 | sorted scrap piles and a small crane |
| `building_scrapyard_4.png` | 🏭回收工厂 | 有发电机和切割机的小厂房，火花四溅 | small factory with a generator and cutting machine, sparks flying |
| `building_infirmary_1.png` | 🩹急救箱 | 一张干净的桌子上放着急救箱 | a first-aid kit on a clean table |
| `building_infirmary_2.png` | 💊药房柜台 | 药房柜台，药瓶按格子摆好 | pharmacy counter with neatly shelved pill bottles |
| `building_infirmary_3.png` | 🏥医务室 | 隔出来的病床和消毒区，红十字布帘 | partitioned beds and a sterile area, red-cross curtain |
| `building_infirmary_4.png` | 🚑野战医院 | 一顶大帐篷医院，旁边一小块药材园 | large tent field hospital with a small herb garden beside it |
| `building_dorm_1.png` | ⛺睡袋 | 地上铺开的一排睡袋 | a row of sleeping bags on the floor |
| `building_dorm_2.png` | 🛏️行军床 | 一排行军床，床头挂着衣服 | a row of camp beds with clothes hanging at the ends |
| `building_dorm_3.png` | 🏠宿舍 | 货架隔出来的小房间，门口贴着名字纸条（不要写字，画成小纸片） | small rooms partitioned by shelves, little paper name tags on the doors (no readable text) |
| `building_training_1.png` | 🥊沙袋 | 房梁上吊着一个旧沙袋 | an old punching bag hanging from a beam |
| `building_training_2.png` | 🎯训练场 | 轮胎、木桩和画靶心的稻草人 | tires, wooden posts and a target scarecrow |
| `building_training_3.png` | 🏋️格斗馆 | 铺了垫子的小场馆，武器架上挂着木棍 | small gym with mats and a weapon rack of wooden staves |
| `building_workshop_1.png` | 🔧工具台 | 一张结实的木桌和一套工具 | a sturdy wooden table with a set of tools |
| `building_workshop_2.png` | 🛠️工坊 | 修车铺改的工坊，卷帘门半开，墙上挂满工具 | garage workshop, roll-up door half open, wall full of tools |
| `building_cellar_1.png` | 🕳️地洞 | 后院挖的一个地洞，盖着木板 | a hole dug in the backyard covered with planks |
| `building_cellar_2.png` | 🧊地窖 | 厚重的地窖门，冒出一点冷气 | heavy cellar door with a little cold mist |
| `building_cellar_3.png` | ❄️冷库 | 银色冷库门，旁边一台嗡嗡响的发电机 | silver freezer door with a humming generator beside it |
| `building_garden_1.png` | 🪴花盆 | 几个花盆排成一排，长着小苗 | a row of flower pots with small seedlings |
| `building_garden_2.png` | 🌱菜畦 | 撬开柏油翻出的几垄菜畦 | a few vegetable rows dug out of the asphalt |
| `building_garden_3.png` | 🥬菜园 | 围起来的菜园，有引水管和堆肥箱 | fenced vegetable garden with a water hose and a compost box |
| `building_garden_4.png` | 🏡温室大棚 | 塑料布搭的拱形大棚，里面绿油油的 | arched plastic-sheet greenhouse, green plants inside |
| `building_pen_1.png` | 🐔鸡笼 | 购物车和铁丝网拼成的鸡笼 | chicken cage made from shopping carts and wire mesh |
| `building_pen_2.png` | 🐐畜栏 | 木桩围起来的畜栏，一个小棚子 | pen fenced with wooden stakes and a small shed |
| `building_pen_3.png` | 🐖小农场 | 猪圈、鸡舍和饲料棚连在一起的小农场 | small farm with a pigsty, a henhouse and a feed shed |
| `building_pen_4.png` | 🐄牧场 | 一大片围起来的草地，木栅栏和谷仓 | large fenced pasture with a wooden fence and a barn |
| `building_pond_1.png` | 🪣水缸 | 几口装满雨水的大缸 | a few large jars full of rainwater |
| `building_pond_2.png` | 🐟鱼池 | 停车场挖的水池，铺着蓝色防水布 | a pool dug in the parking lot, lined with blue tarp |
| `building_pond_3.png` | 🎣鱼塘 | 引了河水的鱼塘，四周种着芦苇，一根钓竿 | fish pond fed by a stream, reeds around it, a fishing rod |
| `building_well_1.png` | 🛢️雨水桶 | 屋檐下几个接雨水的大桶 | a few rain barrels under an eave |
| `building_well_2.png` | 🚰净水器 | 用桶、沙子和木炭叠起来的过滤器，下面接着水壶 | stacked bucket filter with sand and charcoal, a jug collecting water below |
| `building_well_3.png` | ⛲水井 | 石头砌的水井，一台手摇泵 | stone well with a hand pump |
| `building_well_4.png` | 🗼水塔 | 铁架子上的水塔，接着水管 | water tower on a steel frame with pipes running down |

---

## 五、第二批：背景 → `sprites/bg/`（宽 360，脚本自动缩）

背景**不用抠图**，按比例生成就行。前缀把 `game sprite` 换成 `game background, pixel art scene`。

| 文件名 | 生成比例 | 画面描述（中文） | 画面描述（英文） |
|---|---|---|---|
| `bg_camp.png` | 约 1:1（1440×1330） | 营地地图的**地面底图**：45 度俯视的小镇超市停车场，超市外墙和大门只占最上面一条，其余是开阔平整的停车场（柏油、停车线、杂草、裂缝、零星轮胎和木箱），黄昏暖光。**不要画帐篷、厨房这些设施**（设施是单独的建筑图），没有人物，没有文字 | camp map **ground layer**, 45-degree top-down pixel art of a small-town supermarket parking lot, store front only as a thin strip at the top, the rest open flat asphalt with parking lines, weeds, cracks, a few tires and crates, warm dusk light, **no tents or facilities**, no characters, no text |
| `bg_town.png` | 约 1:1（1440×1460） | 小镇地图底图：**正上方俯视**，一条小河从左弯到右，主路从左下镇口通到中间再分岔去北边山坡和右边，四角有树林，北边山坡，街区之间留出很多空地（地点标记由游戏放，**不要画文字和招牌**），低饱和末日配色，杂草丛生 | **top-down** pixel art map of a small town, a river winding left to right, main road from the lower-left entrance to the center then branching north to the hills and east, woods in the corners, hillside to the north, lots of open space between blocks, **no text or signs**, desaturated post-apocalyptic palette, overgrown |
| `bg_battle.png` | 约 3:2（1080×690） | 战斗背景，**横版侧视**，夜晚的小镇街道：左边是营地的栅栏和一盏路灯，右边马路延伸出去，路边有废车和倒下的路牌，天上一轮月亮，蓝紫色夜色，**画面下方 40% 是平坦的地面和马路**（角色分 4 排站在上面，游戏会把图拉伸铺满战场），没有人物 | **side-scrolling** pixel art battle background, small-town street at night, camp fence and a street lamp on the left, road stretching right with abandoned cars and a fallen road sign, moon in the sky, blue-purple night, **flat ground and road in the bottom 40%**, no characters |
| `bg_bloodmoon.png` | 约 3:2（1080×690） | 和 `bg_battle` 同一条街、同一个构图，但天上是一轮巨大的**血红月亮**，整体暗红色调 | same street and composition as bg_battle, but a huge **blood-red moon**, overall dark red tones |
| `bg_title.png` | 9:16（1080×1920） | 游戏封面：黄昏下的超市营地，几个幸存者的背影围坐篝火（剪影就行），远处天边尸群的黑色剪影，温暖又有点不安。**上方 1/3 留空**放标题，没有文字 | title screen pixel art, supermarket camp at dusk, silhouettes of a few survivors around a campfire seen from behind, dark silhouette of a zombie horde on the far horizon, warm yet uneasy, **top third left empty** for the title, no text |

---

## 六、以后再做（代码暂时还没接，不急）

这些游戏里现在用的是 emoji，接图要另外改代码。想先做的话，按 32×32 图标的规格生成（前缀加 `pixel art icon, 32x32, single object,`），做好告诉我再接：

- **资源**：食物（法棍 + 苹果）、木材（一捆木头）、零件（齿轮 + 螺丝）、药品（白药瓶 + 胶囊）、罐头（发光的罐头）、黄金（一小块金锭）
- **背包道具 / 装备**：口粮、木材箱、零件箱、药箱、扳手、工具箱、对讲机、咖啡、巧克力、野战医疗包、招募传单、神秘补给箱、瓶装水、汽油桶、棒球棍、消防斧、手枪、猎枪、猎弓、皮夹克、摩托头盔、防暴背心、撬棍、主厨刀、听诊器、劳保手套、登山靴；背包：腰包、书包、外卖箱、登山包、战术背包
- **交通工具**（营地车库 / 地图上的小车）：旧自行车、越野摩托、老乔的皮卡、厢式货车
- **猎物**：老鼠、鸽子、乌鸦、野兔、走失的鸡、松鼠、野鸭、鱼、大鲶鱼、浣熊、鹿、野猪、大雁、野狗
- **营地**：墓地的墓碑（一块木十字架 + 一块石碑，`grave_cross.png` / `grave_stone.png`）、篝火、侦察点标记、拾荒物
- **地图标记**：每种探索地点一个小图标（加油站、公园、五金店、诊所、警局、学校、汽车旅馆、信号塔、教堂、码头、伐木场、仓库、车祸现场、军方检查站、掠夺者营地、难民营）
- **界面**：木板面板（9 宫格拉伸用）、按钮底图、金色高亮按钮、像素字体（推荐免费商用的“方正像素”类字体或 Zpix，界面字体换成像素字体效果会统一很多）
- **上架用**：小游戏图标 1024×1024（伊森像素头像 + 篝火）、分享卡片 500×400

---

## 七、交付方式

**原图直接交，像素化交给脚本。**

1. 生成的原图**不用自己抠、不用自己缩**，什么格式都行（jfif、webp、jpg、png）。按文件名命名，放进项目的 `art-raw/` 下对应的文件夹：`art-raw/units/`、`art-raw/portraits/`、`art-raw/buildings/`、`art-raw/bg/`。
2. 用 GitHub Desktop 提交上来，告诉我“图放好了”。我运行 `tools/process_art.py`：自动去白底、裁边、缩成像素网格（角色 64×64、建筑 96×96、背景宽 360）、压颜色、去毛边，输出到 `assets/resources/sprites/`，再提交回去。你 Pull 下来就能在游戏里看到。
   - 电脑上装了 Python 也可以自己跑：`pip install pillow numpy`，然后 `python tools/process_art.py`。
   - 已经是手修好的真像素图（比如在 Aseprite 里画的 64×64），也可以直接放进去，脚本不会把它弄坏。
   - 非像素风的图可以加 `--smooth` 按以前的方式处理。
3. 游戏会自动读取 `sprites/units/`、`sprites/portraits/`、`sprites/buildings/`、`sprites/bg/` 里的图，**用最近邻放大**（像素不会糊）；有图就显示图，没图继续画色块。
4. **怎么马上看到战斗小人**：进“战报”页，点“🎬 看一场演示战斗”（不影响营地）。
5. 不满意、风格对不上的先别放，宁可少几张也要统一。**建议顺序**：伊森小人 + 伊森头像 → 普通幸存者 + 行尸 → 其他头像 → 其他丧尸 → 建筑通用图 → 背景 → 建筑阶段图。
