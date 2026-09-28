# 美术资源清单与 AI 提示词

《末日营地》目前的画面全部是代码画的色块。画风定为**现代日系动画赛璐璐**：头像和封面是正常比例的日漫立绘，战斗里是日系 SD 小人。这份清单列出需要的图片、格式、文件名和 AI 提示词。
**做好一批就交给程序接入**，不用等全部做完。

---

## 一、通用规范（每张图都要遵守）

| 项目 | 要求 |
|---|---|
| 格式 | **PNG**。角色、建筑、图标必须是**透明背景**（带 Alpha 通道）；背景图不需要透明 |
| 颜色 | sRGB，不要 CMYK |
| 文件名 | 严格按下表的文件名，全小写英文 + 下划线，例如 `unit_ethan.png` |
| 放在哪 | `assets/resources/sprites/` 下对应的子文件夹（见每一节的标题） |
| 图里的文字 | **不要让 AI 生成文字**（中文基本会乱码）。招牌、标题字以后用设计软件加 |
| 边距 | 角色、建筑四周留 5%～10% 空白，不要贴边、不要被裁切 |

### 统一画风：成熟向日系 SD（已定，以伊森定稿图为准）

**风格参考图**：伊森的定稿战斗小人（`docs/art-reference/ethan_final.png`，拿到透明 PNG 后放进去）。**之后每张图都带上这张做风格参考。**

**风格定义**：**成熟向的日系 SD**——大头小身，但五官偏写实、不夸张（眼睛大小适中，**不要**典型动漫的大眼睛和刺猬头），**按角色年龄画出年纪感**（胡茬、皱纹、白发、疲惫的眼神），人物要有故事感。上色是日系动画的**赛璐璐**：干净的深色线稿，二阶硬边阴影，**身体边缘一圈暖橙色的逆光**；配色是**低饱和的末日色调**（灰绿、锈棕、水泥灰、褪色的天蓝），用营地灯火的**暖橙色**做点缀和逆光。气氛是“末日里的日常”：有危险，但人物温暖、有生活感，**不血腥、不猎奇**。

同一个游戏里分四种用途，每种用自己的前缀，但上色和配色完全一致：

| 前缀 | 用在 | 比例 |
|---|---|---|
| **A 日漫立绘** | 事件头像、封面、分享图、小游戏图标 | 正常人物比例（6～7 头身），半身像 |
| **B 成熟向 SD 小人** | 战斗角色（伊森、丧尸……） | 2.5～3 头身的 SD（日式手游战斗小人的常见做法：立绘正常比例，战斗用 SD） |
| **C 日漫背景** | 场景背景、营地地点、建筑 | 日本动画的美术背景质感 |
| **D 日系手游图标** | 资源、物品、技能、拾荒物图标 | 单个物品 |

**前缀 A · 日漫立绘**

> 中文：日系动画风格角色半身立绘，成熟向画风，五官偏写实、眼睛大小适中，按角色年龄画出年纪感，赛璐璐上色，干净的深色线稿，二阶硬边阴影，低饱和的末日配色（灰绿、锈棕、水泥灰），暖橙色的边缘逆光，表情有故事感，高清，
>
> English: anime style bust portrait, mature character design, semi-realistic facial features, moderate eye size, age-appropriate details, cel shading, clean dark lineart, two-tone hard shadows, desaturated post-apocalyptic palette (grey-green, rust brown, concrete grey), warm orange rim light, expressive storytelling face, high quality,

**前缀 B · 成熟向 SD 小人**

> 中文：成熟向日系 SD 战斗小人，约 2.5～3 头身，头大身小，五官偏写实不夸张，眼睛大小适中，按角色年龄画出年纪感（胡茬、皱纹、白发），赛璐璐上色，干净的深色线稿，二阶硬边阴影，身体边缘一圈暖橙色逆光，低饱和末日配色，3/4 侧身，动作姿势清楚、轮廓分明，全身，角色居中四周留白，纯白色背景，不要画棋盘格，
>
> English: mature-style Japanese SD battle sprite, about 2.5 to 3 heads tall, big head small body, semi-realistic facial features, moderate eye size, age-appropriate details (stubble, wrinkles, grey hair), cel shading, clean dark lineart, two-tone hard shadows, warm orange rim light along the body edges, desaturated post-apocalyptic palette, three-quarter view, clear action pose, strong silhouette, full body, centered with margins, plain pure white background, no checkerboard pattern,

**前缀 C · 日漫背景**

> 中文：日本动画电影的美术背景风格，精致的手绘质感，柔和的光影和大气透视，末日后的美国小镇，杂草从柏油路缝里长出来，低饱和配色，傍晚的暖光和冷色阴影对比，宁静又略带寂寥，高清，
>
> English: Japanese anime film background art, detailed hand-painted look, soft lighting and atmospheric perspective, post-apocalyptic small American town, weeds growing through cracked asphalt, desaturated palette, warm evening light against cool shadows, peaceful yet lonely, high quality,

**前缀 D · 日系手游图标**

> 中文：日系手游道具图标，单个物品居中，动画赛璐璐上色，粗而干净的描边，明暗对比清楚，微微俯视，缩小后也能一眼认出，
>
> English: Japanese mobile game item icon, single object centered, anime cel shading, bold clean outline, clear light and shadow, slight top-down angle, readable at small size,

**反向提示词（负面提示词，能填就填）：**

> 写实，照片，3D 渲染，美漫，厚涂，过大的动漫眼睛，刺猬头，血腥，血浆飞溅，内脏，猎奇，文字，水印，签名，logo，多余的手指，畸形的手，被裁切，多个角色，复杂背景，牛仔帽警长
>
> realistic, photo, 3d render, american comic style, painterly, oversized anime eyes, spiky anime hair, gore, blood splatter, guts, grotesque, text, watermark, signature, logo, extra fingers, deformed hands, cropped, multiple characters, busy background, cowboy sheriff hat

**用哪个工具**

- **Midjourney**：在提示词最后加 **`--niji 6`**（Midjourney 专门做日漫风的模型）。头像加 `--ar 1:1`，背景加 `--ar 9:16` 或 `--ar 3:2`。
- **即梦 / 可灵 / 通义万相**：模型或风格选“**动漫**”“二次元”一类，再贴中文提示词。
- **Stable Diffusion**：用动漫类底模（比如 Animagine XL、Pony 系列的动漫模型），英文提示词效果更好。

- **Gemini**：用自然语言描述效果最好，也很擅长**在原图上修改**（“保持角色不变，只改……”）。⚠️ Gemini 经常把透明棋盘格**画进图里**（假透明），一定要写“纯白色背景，不要画棋盘格”，然后自己抠图。它给的 `.webp` 要转成 PNG。

**不要在提示词里写具体画师或具体动画作品的名字**。一是版权风险，二是画出来会“像别人的游戏”。用上面的风格描述就够了。

**其他可选风格**（不喜欢上面这种再换，一旦定了就全部统一）

| 风格 | 感觉 | 把前缀里的风格描述换成 |
|---|---|---|
| 90 年代复古日漫 | 胶片颗粒、复古配色，末日气氛更浓 | 90年代日本动画风格，复古赛璐璐，胶片颗粒感，略微褪色的配色 / 90s retro anime style, vintage cel animation, film grain, faded colors |
| 日系水彩绘本 | 温柔治愈，偏“末日日常” | 日系水彩插画风格，柔和的线条，透明水彩上色，留白 / Japanese watercolor illustration, soft lines, transparent watercolor, white space |

### 保持角色一致的技巧

1. **先做伊森的头像（前缀 A）**，反复生成直到满意，把这张当作“画风参考图”。然后用它做伊森的 SD 战斗小人（前缀 B），两张都满意了再做其他人。
2. 之后每张都带上这张参考图：Midjourney 用 `--sref 图片链接`（画风参考），即梦、可灵用“参考图 / 风格参考”。
3. 同一个角色的战斗图和头像，用 Midjourney 的 `--cref`（角色参考），或者即梦的“角色一致性”功能。
4. 生成后用 **remove.bg**、即梦的“抠图”或 Photoshop 去掉背景，导出透明 PNG。
5. 提示词里写“纯白背景”比写“透明背景”更好抠图。AI 一般生成不了真透明图，都要抠。

### ⚠️ 版权红线

不要画成《行尸走肉》里的标志性造型：**牛仔帽 + 卡其色警长制服**、脏辫女武士拿武士刀、带翅膀皮背心的弩手、缠铁丝网的棒球棍，也不要出现监狱、医院门口“死人勿开”的涂鸦。我们的角色都是原创的，按下面的描述来画。

---

## 二、第一批（最重要，先做这批）

### 2.1 战斗角色 → `sprites/units/`

- **尺寸 512×512**，透明背景，**SD 小人全身**（2 头身）、站姿，脚底离画面底边约 8%。
- 我方角色**身体朝右**（3/4 侧面），丧尸**朝左**。战斗里会缩小到 100 像素左右，所以要轮廓清楚、颜色分明。
- 衣服的主色尽量用表里的“主色”，和游戏里现在的色块保持一致。

| 文件名 | 角色 | 主色 | 中文提示词（前面加**前缀 B**） | English (after prefix B) |
|---|---|---|---|---|
| `unit_ethan.png` | 伊森 · 副警长（主角） | 蓝 `#4a6fa5` | 30多岁的小镇副警长，棕色短发，下巴有胡茬，眼神坚毅，穿**深蓝色警用夹克**，胸前一枚小星形警徽，腰带上挂手电筒和手枪套，右手握手枪、枪口朝下，站姿沉稳，全身，身体朝右，纯白背景 | small-town deputy in his 30s, short brown hair, stubble, determined eyes, **navy blue police jacket** with a small star badge, flashlight and holster on belt, holding a pistol pointed down, steady stance, full body, facing right, plain white background |
| `unit_martha.png` | 玛莎 · 超市老板娘 | 红棕 `#c47a5a` | 60岁的胖胖的老奶奶，灰白头发盘成发髻，戴圆框眼镜，穿红棕色碎花连衣裙和超市围裙，双手举着一口大平底锅，表情凶巴巴但很可爱，全身，身体朝右，纯白背景 | plump 60-year-old grandma, grey hair in a bun, round glasses, rust-red floral dress with a grocery store apron, holding a big frying pan with both hands, fierce but adorable face, full body, facing right, plain white background |
| `unit_derek.png` | 德里克 · 汽修工 | 棕 `#8a5a3a` | 高大强壮的汽修工，寸头，脸上有机油污渍，头上绑头巾，穿棕色连体工装、袖子卷起，一手拿大扳手，一手拿一个点燃的燃烧瓶，脾气暴躁的表情，全身，身体朝右，纯白背景 | big muscular car mechanic, buzz cut, grease smudges on face, bandana, brown coveralls with rolled sleeves, a large wrench in one hand and a lit molotov bottle in the other, grumpy expression, full body, facing right, plain white background |
| `unit_sophie.png` | 苏菲 · 护理系学生 | 粉 `#e8a0b0` | 20岁左右的女大学生，金色马尾，穿粉色护士服，斜挎一个印红十字的急救包，手里拿着绷带，表情有点害怕但很勇敢，全身，身体朝右，纯白背景 | nursing student around 20, blonde ponytail, pink scrubs, first-aid bag with a red cross across her body, holding bandages, slightly scared but brave, full body, facing right, plain white background |
| `unit_toby.png` | 托比 · 加油站店员 | 黄 `#e0c050` | 20出头的瘦高小伙子，乱蓬蓬的头发，戴反戴的黄色鸭舌帽，穿加油站的黄色马甲和牛仔裤，手里拿着一卷绳子（做绊索用），咧嘴笑，机灵乐观，全身，身体朝右，纯白背景 | lanky guy in his early 20s, messy hair, backwards yellow cap, yellow gas-station vest and jeans, holding a coil of rope for a tripwire, big grin, clever and cheerful, full body, facing right, plain white background |
| `unit_hank.png` | 汉克 · 退伍老兵 | 军绿 `#5a6a4a` | 60岁左右的退伍老兵，灰白络腮胡，戴针织帽，穿军绿色旧外套，背着步枪、双手端枪瞄准，眼神锐利沉默，全身，身体朝右，纯白背景 | veteran around 60, grey full beard, knit beanie, worn olive-green army jacket, aiming a hunting rifle, sharp silent eyes, full body, facing right, plain white background |
| `unit_militia.png` | 普通幸存者（流浪者通用） | 灰绿 `#7a8a7a` | 普通的末日幸存者，性别模糊，戴兜帽，穿打满补丁的灰绿色卫衣，背着小背包，手里握一根铁管，全身，身体朝右，纯白背景 | ordinary survivor, gender-neutral, hood up, patched grey-green hoodie, small backpack, holding a metal pipe, full body, facing right, plain white background |
| `unit_dog.png` | 罐头 · 营地的狗 | 金黄 `#c8a050` | 一只金黄色的中型土狗，脖子上系红色旧头巾，竖着耳朵，摆出要冲出去的姿势，忠诚勇敢，全身，身体朝右，纯白背景 | medium golden mixed-breed dog, old red bandana on its neck, ears up, ready-to-charge pose, loyal and brave, full body, facing right, plain white background |
| `barricade.png` | 路障 | 旧木色 `#8a7a5a` | 用超市货架、购物车、木板、轮胎和沙袋堆起来的路障墙，**侧面视角**，高大竖长，有钉子和铁丝加固，没有人物，纯白背景 | barricade wall made of grocery shelves, shopping carts, wooden planks, tires and sandbags, **side view**, tall and narrow, reinforced with nails and wire, no characters, plain white background |
| `zombie_walker.png` | 行尸（最普通的丧尸） | 灰绿 `#6a8a5a` | SD 丧尸，灰绿色皮肤，眼睛是空洞的白色圆点，穿破烂的衬衫和牛仔裤，双手向前伸、摇摇晃晃地走，傻傻的有点可怜，不恐怖、不流血，全身，身体朝左，纯白背景 | chibi zombie, grey-green skin, blank white dot eyes, torn shirt and jeans, arms reaching forward, shambling walk, goofy and a bit pitiful, not scary, no blood, full body, facing left, plain white background |
| `zombie_runner.png` | 奔跑者 | 浅黄绿 `#9aaa6a` | 瘦长的SD 丧尸，浅黄绿色皮肤，穿破旧的运动服和跑鞋，身体前倾、正在狂奔，头发乱飞，全身，身体朝左，纯白背景 | skinny chibi zombie, pale yellow-green skin, torn jogging tracksuit and sneakers, leaning forward mid-sprint, hair flying, full body, facing left, plain white background |
| `zombie_fatty.png` | 胖子（死后放毒气） | 绿 `#7a9a4a` | 圆滚滚的巨大SD 丧尸，绿色皮肤，肚子鼓得很大，身上冒着淡绿色的毒气泡泡，穿撑破的背心，全身，身体朝左，纯白背景 | huge round chibi zombie, green skin, massively bloated belly, faint green toxic gas bubbles around it, tank top stretched and torn, full body, facing left, plain white background |
| `zombie_armored.png` | 铁甲尸 | 蓝灰 `#5a6a7a` | SD 丧尸，戴黄色安全帽，身上穿着建筑工人的反光背心，外面绑着铁皮和轮胎当盔甲，看起来很硬，全身，身体朝左，纯白背景 | chibi zombie wearing a yellow hard hat and a construction worker's reflective vest, with scrap metal plates and tire pieces strapped on as armor, looks tough, full body, facing left, plain white background |
| `zombie_brute.png` | 尸群首领（Boss） | 暗红 `#8a3a3a` | 体型是普通丧尸两倍的SD 丧尸首领，肌肉发达，暗红色皮肤，眼睛发红光，穿破烂的屠夫围裙，拳头巨大，气势很足，全身，身体朝左，纯白背景 | chibi zombie boss twice the size of normal zombies, muscular, dark red skin, glowing red eyes, torn butcher's apron, huge fists, imposing, full body, facing left, plain white background |
| `zombie_frenzied.png` | 狂暴感染者 | 红 `#b04040` | 瘦小敏捷的SD 感染者，皮肤泛红，龇牙咧嘴，四肢着地、半蹲准备扑过来，身边有红色的速度线，全身，身体朝左，纯白背景 | small agile chibi infected, reddish skin, teeth bared, crouched on all fours ready to pounce, red speed lines around it, full body, facing left, plain white background |

### 2.2 事件头像 → `sprites/portraits/`

- **尺寸 512×512**，透明背景，**日漫半身立绘（头到胸口，正常人物比例）**，脸朝右前方，表情自然。游戏里会裁成圆形，所以**脸放在正中间**，四周留足空白。
- 描述和上面的战斗角色保持一致（同一个人），这里只写半身的重点。

| 文件名 | 角色 | 中文提示词（前面加**前缀 A**） | English (after prefix A) |
|---|---|---|---|
| `portrait_ethan.png` | 伊森 | 半身像，30多岁副警长，棕色短发，胡茬，深蓝色警用夹克，胸前小星形警徽，神情坚毅又带着一点疲惫和思念，纯白背景 | bust portrait, deputy in his 30s, short brown hair, stubble, navy police jacket with small star badge, determined yet tired and longing expression, plain white background |
| `portrait_martha.png` | 玛莎 | 半身像，60岁胖奶奶，灰白发髻，圆框眼镜，超市围裙，双手叉腰，嘴硬心软的表情，纯白背景 | bust portrait, plump 60-year-old grandma, grey bun, round glasses, grocery apron, hands on hips, tough-talking but kind expression, plain white background |
| `portrait_derek.png` | 德里克 | 半身像，壮硕的汽修工，寸头，头巾，脸上有机油，皱着眉，好像藏着心事，纯白背景 | bust portrait, burly mechanic, buzz cut, bandana, grease on face, frowning as if hiding a secret, plain white background |
| `portrait_sophie.png` | 苏菲 | 半身像，金色马尾的护理系女生，粉色护士服，有点紧张地抱着急救包，眼神善良，纯白背景 | bust portrait, nursing student with blonde ponytail, pink scrubs, nervously hugging a first-aid bag, kind eyes, plain white background |
| `portrait_toby.png` | 托比 | 半身像，反戴黄色鸭舌帽的瘦高小伙，加油站马甲，比着大拇指咧嘴笑，纯白背景 | bust portrait, lanky guy with backwards yellow cap, gas-station vest, thumbs up with a big grin, plain white background |
| `portrait_leo.png` | 里奥 · 高中生 | 半身像，17岁高中男生，黑色短发，穿红色连帽卫衣和校服外套，背着书包，脸上有泥，眼神冲动勇敢，纯白背景 | bust portrait, 17-year-old high school boy, short black hair, red hoodie under a school jacket, backpack, mud on face, impulsive brave eyes, plain white background |
| `portrait_hank.png` | 汉克 | 半身像，灰白络腮胡的退伍老兵，针织帽，军绿外套，眯着眼警惕地看着前方，纯白背景 | bust portrait, grey-bearded veteran, knit beanie, olive army jacket, squinting warily ahead, plain white background |
| `portrait_rosa.png` | 罗莎 · 花店店主 | 半身像，40岁左右的温柔女人，深色卷发，戴草帽，穿园艺围裙，手里捧着一小包种子，头发上别着一朵小花，纯白背景 | bust portrait, gentle woman around 40, dark curly hair, straw hat, gardening apron, holding a small packet of seeds, a little flower in her hair, plain white background |
| `portrait_nora.png` | 诺拉 · 兽医 | 半身像，45岁左右的冷静女人，短发，戴细框眼镜，穿白大褂，脖子上挂听诊器，嘴角带一点毒舌的冷笑，纯白背景 | bust portrait, calm woman around 45, short hair, thin-framed glasses, white coat, stethoscope around neck, slight sarcastic smirk, plain white background |
| `portrait_joe.png` | 老乔 · 卡车司机 | 半身像，50多岁的大胡子卡车司机，戴卡车司机网帽，红黑格子衬衫，乐呵呵地在说话，纯白背景 | bust portrait, bearded trucker in his 50s, trucker mesh cap, red-and-black plaid shirt, cheerfully talking, plain white background |
| `portrait_lily.png` | 莉莉 · 伊森的女儿 | 半身像，12岁女孩，棕色头发扎两个小辫，穿黄色雨衣，双手握着一台旧对讲机，眼神坚强又聪明，纯白背景 | bust portrait, 12-year-old girl, brown hair in two small braids, yellow raincoat, holding an old walkie-talkie with both hands, strong and smart eyes, plain white background |
| `portrait_narrator.png` | 营地旁白（没人说话时） | 一台放在木箱上的老式收音机 / 对讲机，天线竖起，旁边一盏小油灯发出暖光，没有人物，纯白背景 | an old radio / walkie-talkie on a wooden crate, antenna up, a small oil lamp glowing warmly beside it, no characters, plain white background |
| `portrait_wanderer_1.png` | 流浪者（随机用） | 半身像，背着大登山包的中年男人，戴毛线帽，胡子拉碴，纯白背景 | bust portrait, middle-aged man with a big hiking backpack, knit cap, scruffy beard, plain white background |
| `portrait_wanderer_2.png` | 流浪者 | 半身像，围着围巾的年轻女人，短发，脸上贴着创可贴，纯白背景 | bust portrait, young woman with a scarf, short hair, a bandage on her cheek, plain white background |
| `portrait_wanderer_3.png` | 流浪者 | 半身像，拄着拐杖的白发老爷爷，穿旧西装马甲，纯白背景 | bust portrait, white-haired old man with a walking cane, worn suit vest, plain white background |
| `portrait_wanderer_4.png` | 流浪者 | 半身像，戴护目镜的少女，穿工装外套，头发扎成高马尾，纯白背景 | bust portrait, teenage girl with goggles on her head, work jacket, high ponytail, plain white background |

### 2.3 营地建筑 → `sprites/buildings/`

- **尺寸 512×512**，透明背景，**45 度俯视（等距视角）的小建筑**，日漫背景的手绘质感，风格统一，都是“在超市停车场里就地搭建”的感觉。
- 每个建筑只画 1 张，代表 1 级的样子（以后可以再加高级版本）。

| 文件名 | 建筑 | 中文提示词（前面加**前缀 C**） | English (after prefix C) |
|---|---|---|---|
| `building_hq.png` | 指挥部 | 等距视角，小镇超市的经理办公室，门口插着一面小旗子，屋顶有一根收音机天线，窗户透出暖黄的灯光，单独一个建筑，纯白背景 | isometric view, small-town supermarket manager's office, a small flag at the door, radio antenna on the roof, warm yellow light in the windows, single building, plain white background |
| `building_wall.png` | 路障 | 等距视角，一段用货架、购物车、木板和沙袋堆成的防御墙，墙上挂着一盏灯，单独一段，纯白背景 | isometric view, a section of defensive wall made of shelves, shopping carts, planks and sandbags, a lamp hanging on it, single section, plain white background |
| `building_kitchen.png` | 厨房 | 等距视角，露天野战厨房，用砖头垒的灶台上架着一口冒热气的大锅，旁边有木桌、调料罐和挂着的锅碗瓢盆，纯白背景 | isometric view, open-air field kitchen, a big steaming pot on a brick stove, wooden table, spice jars and hanging pots and pans, plain white background |
| `building_scrapyard.png` | 废料场 | 等距视角，一个小废料场，堆着拆掉的旧汽车、轮胎、木板和铁皮，有一台小吊车，纯白背景 | isometric view, small scrapyard, piles of dismantled old cars, tires, planks and sheet metal, a small crane, plain white background |
| `building_infirmary.png` | 医务室 | 等距视角，由药房柜台改建的简易医务室，门口挂着红十字布帘，里面有一张病床和药柜，纯白背景 | isometric view, makeshift infirmary converted from a pharmacy counter, red cross curtain at the entrance, a hospital bed and medicine cabinet inside, plain white background |
| `building_dorm.png` | 宿舍 | 等距视角，仓库一角铺开的睡袋、行军床和几顶小帐篷，挂着晾衣绳和小彩灯，温馨，纯白背景 | isometric view, a corner of a warehouse with sleeping bags, camp beds and small tents, clothesline and string lights, cozy, plain white background |
| `building_training.png` | 训练场 | 等距视角，停车场里用轮胎、木桩和稻草人搭的训练场，稻草人身上画着靶心，纯白背景 | isometric view, training ground in a parking lot made of tires, wooden posts and a scarecrow with a target painted on it, plain white background |
| `building_workshop.png` | 工坊 | 等距视角，小修车铺改成的工坊，卷帘门半开，墙上挂满工具，工作台上有台虎钳和零件，纯白背景 | isometric view, small auto-repair garage turned into a workshop, roll-up door half open, tools hanging on the wall, workbench with a vise and parts, plain white background |
| `building_cellar.png` | 地窖 | 等距视角，超市冷库改成的地窖，一扇厚重的银色冷库门半开，冒出白色冷气，门边堆着箱子和罐头，纯白背景 | isometric view, supermarket cold storage turned into a cellar, a heavy silver freezer door half open with white cold mist, crates and cans stacked beside it, plain white background |

---

## 三、第二批（图标和背景）

### 3.1 图标 → `sprites/icons/`

- **尺寸 256×256**，透明背景，**单个物品、正面略俯视**，粗描边，适合缩小到 40 像素还能认出来。
- 所有图标的提示词都用这个模板：`前缀 D + 【物品描述】，纯白背景`

| 文件名 | 用途 | 物品描述（中文） | English |
|---|---|---|---|
| `res_food.png` | 资源：食物 | 一条法棍面包和一个红苹果 | a baguette and a red apple |
| `res_wood.png` | 资源：木材 | 一捆用绳子绑起来的木头 | a bundle of logs tied with rope |
| `res_parts.png` | 资源：零件 | 一个齿轮加几颗螺丝螺母 | a gear with a few bolts and nuts |
| `res_medicine.png` | 资源：药品 | 一个白色药瓶和两粒胶囊 | a white pill bottle with two capsules |
| `res_cans.png` | 资源：罐头（稀有货币） | 一个闪闪发光的罐头，带金色光芒 | a shiny tin can with a golden glow |
| `pickup_crate.png` | 拾荒：补给箱 | 一个木制补给箱，箱盖半开，露出食物 | a wooden supply crate with the lid half open, food inside |
| `pickup_scrap.png` | 拾荒：废铁堆 | 一小堆废铁、铁皮和木板 | a small pile of scrap metal, sheet metal and planks |
| `pickup_medkit.png` | 拾荒：急救箱 | 一个白底红十字的急救箱 | a white first-aid box with a red cross |
| `pickup_walker.png` | 拾荒：落单的行尸 | SD 行尸的脑袋，灰绿皮肤，白点眼睛，傻傻的 | a chibi zombie head, grey-green skin, white dot eyes, goofy |
| `pickup_cans.png` | 拾荒：罐头 | 两个滚在地上的罐头 | two tin cans lying on the ground |
| `item_molotov.png` | 物品：燃烧瓶 | 一个塞着布条、布条在燃烧的玻璃瓶 | a glass bottle with a burning rag stuffed in it |
| `item_medkit.png` | 物品：急救包 | 一卷绷带和一个小药盒 | a roll of bandage and a small medicine box |
| `item_nail_bomb.png` | 物品：钉子炸弹 | 一个插满钉子、有引线的铁罐 | a tin can bristling with nails and a fuse |
| `skill_cover_fire.png` | 技能：伊森·掩护射击 | 一把手枪，枪口冒出火光 | a pistol with a muzzle flash |
| `skill_hot_soup.png` | 技能：玛莎·热汤 | 一碗冒热气的汤，上面有爱心形状的热气 | a steaming bowl of soup with heart-shaped steam |
| `skill_molotov.png` | 技能：德里克·燃烧瓶 | 一团橙色的火焰 | a burst of orange flame |
| `skill_tripwire.png` | 技能：托比·绊索 | 一根绷紧的绳子绊索，上面挂着铃铛 | a taut tripwire rope with a bell hanging on it |

### 3.2 背景 → `sprites/bg/`

背景**不需要透明**，提示词里**不要写“纯白背景”**。

| 文件名 | 尺寸 | 中文提示词（前面加**前缀 C**，封面加**前缀 A**） | English (after prefix C / A) |
|---|---|---|---|
| `bg_camp.png` | **1080×1920**（竖屏） | 游戏场景背景，45 度俯视的美国小镇超市停车场营地，超市外墙和大门在画面上方，停车场里有帐篷、篝火、晾衣绳、用购物车和货架堆的路障，远处是废弃的汽车和小镇街道，黄昏，暖色调，**画面中间和下半部分留出比较空的地面**（要放界面），没有人物，没有文字 | game background, 45-degree top-down view of a small American town supermarket parking lot turned into a camp, store front at the top, tents, campfire, clotheslines, barricades of shopping carts and shelves, abandoned cars and quiet town street in the distance, dusk, warm tones, **leave the middle and lower area fairly empty** for UI, no characters, no text |
| `bg_battle.png` | **1080×720**（横条） | 游戏战斗背景，**横版侧视**，夜晚的小镇街道，左边是营地的围栏和一盏路灯，右边是一条延伸出去的马路，路边有废弃的汽车和倒下的路牌，天上有月亮，蓝紫色夜色，**画面底部 20% 是平坦的地面**（角色站在上面），没有人物，没有文字 | game battle background, **side-scrolling side view**, small town street at night, camp fence and a street lamp on the left, road stretching to the right with abandoned cars and a fallen road sign, moon in the sky, blue-purple night, **flat ground in the bottom 20%** for characters to stand on, no characters, no text |
| `bg_title.png` | **1080×1920** | 游戏封面，黄昏下的超市营地，几个幸存者的背影围坐在篝火旁（剪影即可），远处天边有尸群的黑色剪影，温暖又有一点不安的氛围，**画面上方 1/3 留空**（放游戏标题），没有文字 | game title screen, supermarket camp at dusk, silhouettes of a few survivors sitting around a campfire seen from behind, a dark silhouette of a zombie horde on the distant horizon, warm yet slightly uneasy mood, **leave the top third empty** for the title, no text |
| `bg_bloodmoon.png` | 1080×720 | 和 `bg_battle` 同一条街道、同一个构图，但天上是一轮巨大的**血红色月亮**，整体是暗红色调（血月夜的战斗用） | same street and same composition as bg_battle, but a huge **blood-red moon** in the sky, overall dark red tones (for blood moon nights) |

---

## 四、第三批（锦上添花）

### 4.1 营地地点 → `sprites/sites/`

**尺寸 1080×608**（16:9 横图，搬迁界面的卡片用），不需要透明，没有人物、没有文字。

| 文件名 | 地点 | 中文提示词（前面加**前缀 C**） |
|---|---|---|
| `site_supermarket.png` | 枫谷超市 | 45 度俯视，小镇超市和它的停车场，门口堆着货架路障，黄昏 |
| `site_garage.png` | 镇口加油站 | 45 度俯视，镇口的小加油站，油罐、汽修间、墙上挂满工具，白天 |
| `site_farm.png` | 河谷农场 | 45 度俯视，河谷里的农场，红色谷仓、果园和一口水井，四周开阔，傍晚 |
| `site_clinic.png` | 镇卫生所 | 45 度俯视，小镇卫生所，白墙红十字，窗户用木板钉住，门外远处有几只丧尸的剪影，阴天 |
| `site_police.png` | 警长办公室 | 45 度俯视，小镇警局，铁门、高墙和一辆旧警车，屋顶有探照灯 |
| `site_dam.png` | 北岭水坝 | 45 度俯视，山谷里高大的水坝，坝顶有帐篷和灯火，水库波光粼粼，清晨 |

### 4.2 界面素材 → `sprites/ui/`

| 文件名 | 尺寸 | 说明 / 提示词 |
|---|---|---|
| `ui_panel.png` | 256×256 | 界面面板底板：旧木板拼成的方形面板，四角有金属包角和铆钉，中间平整干净（会被拉伸），纯白背景 |
| `ui_button.png` | 256×96 | 按钮底图：墨绿色旧金属牌子，边缘有一点磨损和铆钉，中间平整，纯白背景 |
| `ui_button_gold.png` | 256×96 | 同上，但是暖金色（引导高亮 / 可领取时用） |
| `ui_logo.png` | 1024×512 | **游戏标题“末日营地”建议用设计工具做**（稿定设计 / Canva / Photoshop）：粗体卡通字，木牌或铁皮质感，旁边点缀一个小篝火和路障。AI 只负责生成装饰部分 |

### 4.3 上架用

| 文件名 | 尺寸 | 说明 |
|---|---|---|
| `app_icon.png` | **1024×1024**，不透明 | 小游戏图标：伊森的日漫风头像（前缀 A），背景是黄昏的超市营地和篝火，构图简单，缩小到 60 像素也能看清。上传微信后台时按要求再缩小 |
| `share_default.png` | **500×400**（5:4） | 微信分享卡片图：几个 SD 小人幸存者站在路障后面，远处有尸群，**右侧留空**（以后加“我的营地存活了 N 天”的文字） |

---

## 五、交付方式

**最省事的做法：原图直接交，抠图交给脚本。**

1. 生成的原图**不用自己抠**，什么格式都行（jfif、webp、jpg、png），白底、假棋盘格都没关系。按文件名命名（后缀不用管），放进项目的 `art-raw/` 下对应的文件夹：`art-raw/units/`、`art-raw/portraits/`、`art-raw/buildings/`。
2. 用 GitHub Desktop 提交上来，告诉我“图放好了”。我运行 `tools/process_art.py`：自动去背景、去白边、裁掉多余空白、缩放，输出到 `assets/resources/sprites/`，再提交回去。你 Pull 下来就能在游戏里看到。
   - 电脑上装了 Python 的话也可以自己跑：`pip install pillow numpy`，然后 `python tools/process_art.py`。
3. **游戏会自动读取** `sprites/units/`、`sprites/portraits/`、`sprites/buildings/` 里的图（v0.6 起）：有图就显示图，没图继续画色块。
4. **怎么马上看到战斗角色**：进“战报”页，点“🎬 看一场演示战斗”（不影响营地）。
5. 脚本靠角色的**深色描边**区分角色和背景，所以生成时要保证角色有完整、清楚的描边（我们的画风本来就有）。如果角色边缘本身就是白色又没有描边（比如白衣服贴着白背景），脚本可能会把那一块也抠掉，这种图请换成纯色背景（比如纯绿色）重新生成。
6. 生成出来不满意、风格对不上的，先别放进去，宁可少几张也要统一。
