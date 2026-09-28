// 原型阶段的调试界面：全部用代码生成文字和按钮，先验证玩法，之后再换成正式美术界面。
// 用法：把这个组件挂到场景的 Canvas 节点上（见 README）。

import { _decorator, Color, Component, game, Game, Graphics, JsonAsset, Label, Layers, Node, resources, UITransform } from 'cc';
import { CampGame } from '../core/CampGame';
import { upgradeBlocker } from '../core/buildings';
import { availableLocations, currentRaid, formatBag, isOnExpedition, nextRaidIsBloodMoon, suggestSquad } from '../core/combat';
import { bedCount, economyRates, getBuildingDef, morale, safety, storageCap, survivorBattleLevel } from '../core/economy';
import { availableBounties, bountyProgress, getBounty, hunterRankName } from '../core/bounties';
import { craftBlocker, itemCount, workshopLevel } from '../core/crafting';
import { isUnlocked } from '../core/achievements';
import { seasonAt } from '../core/seasons';
import { loadGame, saveGame } from '../core/save';
import { currentDay } from '../core/state';
import { currentEpisode, objectiveDone, objectiveProgress } from '../core/story';
import { GameConfig, RESOURCE_IDS, ResourceBag } from '../core/types';
import { validateConfig } from '../core/validate';
import { createAdService } from '../platform/AdService';
import { CocosStorage } from '../platform/CocosStorage';

const { ccclass } = _decorator;

const WIDTH = 680;
const LEFT = -WIDTH / 2;
const TOP = 620;
const TEXT = new Color(235, 235, 225);
const DIM = new Color(160, 165, 150);
const ACCENT = new Color(255, 200, 90);
const BUTTON = new Color(70, 110, 80);
const BUTTON_DISABLED = new Color(80, 80, 80);
const WIN = new Color(140, 220, 140);
const LOSE = new Color(240, 120, 110);

type Tab = 'camp' | 'survivors' | 'explore' | 'bounties' | 'workshop' | 'achievements' | 'reports';
const TABS: [Tab, string][] = [
    ['camp', '营地'],
    ['survivors', '幸存者'],
    ['explore', '探索'],
    ['bounties', '悬赏'],
    ['workshop', '工坊'],
    ['achievements', '成就'],
    ['reports', '战报'],
];
const TABS_PER_ROW = 4;

@ccclass('GameRoot')
export class GameRoot extends Component {
    private camp: CampGame | null = null;
    private readonly storage = new CocosStorage();
    private readonly ads = createAdService();
    private content: Node | null = null;
    private cursorY = TOP;
    private secondTimer = 0;
    private saveTimer = 0;
    private toast = '';
    private toastUntil = 0;
    private tab: Tab = 'camp';

    onLoad(): void {
        this.drawBackground();
        this.content = this.makeNode('Content', this.node);
        game.on(Game.EVENT_HIDE, this.save, this);
        this.loadConfig();
    }

    onDestroy(): void {
        game.off(Game.EVENT_HIDE, this.save, this);
        this.save();
    }

    update(dt: number): void {
        if (!this.camp) return;
        this.secondTimer += dt;
        this.saveTimer += dt;
        if (this.secondTimer >= 1) {
            this.secondTimer = 0;
            this.camp.tick(Date.now());
            this.render();
        }
        if (this.saveTimer >= 10) {
            this.saveTimer = 0;
            this.save();
        }
    }

    private loadConfig(): void {
        resources.loadDir('config', JsonAsset, (err, assets) => {
            if (err) {
                this.showFatal(`配置加载失败：${err.message}`);
                return;
            }
            const byName: Record<string, unknown> = {};
            for (const a of assets) byName[a.name] = a.json;
            const config = byName as unknown as GameConfig;
            const errors = validateConfig(config);
            if (errors.length > 0) {
                this.showFatal(`配置表有错误：\n${errors.slice(0, 10).join('\n')}`);
                return;
            }
            const now = Date.now();
            const saved = loadGame(this.storage, config);
            this.camp = saved ? new CampGame(config, saved) : CampGame.newGame(config, now);
            this.camp.tick(now);
            this.render();
        });
    }

    private save(): void {
        if (this.camp) saveGame(this.storage, this.camp.state);
    }

    // ---------- 界面 ----------

    private render(): void {
        const camp = this.camp;
        if (!camp || !this.content) return;
        this.content.destroyAllChildren();
        this.cursorY = TOP;
        const now = Date.now();
        const { config, state } = camp;

        this.showNewAchievements(camp);
        const { season, dayInSeason } = seasonAt(config, state, now);
        this.text(`《末日营地》 第 ${currentDay(config, state, now)} 天  ${season.icon}${season.name}·第${dayInSeason}天`, 34, ACCENT);
        this.text(
            `士气 ${Math.round(morale(state))}   安全 ${safety(config, state)}   人数 ${state.survivors.length}/${bedCount(config, state)}`,
            22,
            DIM,
        );
        this.text(this.resourceLine(config, camp, now), 22);
        const raid = currentRaid(config, state, now);
        if (raid) {
            const left = Math.max(0, Math.ceil((state.nextRaidAt - now) / 1000));
            const bloodMoon = nextRaidIsBloodMoon(config, state);
            const name = bloodMoon ? `🩸血月夜！${raid.name}（数量多一半，奖励翻倍）` : raid.name;
            this.text(`🧟 ${formatTime(left)} 后${name}来袭（路障生命取决于安全值）`, 22, LOSE);
        }
        this.gap(8);

        const ep = currentEpisode(config, state);
        if (ep) {
            this.text(`第 ${ep.season} 季 第 ${ep.episode} 集「${ep.title}」`, 24, ACCENT);
            for (const o of ep.objectives) this.text(`${objectiveDone(config, state, o, now) ? '✅' : '⬜'} ${o.text}`, 22);
        } else {
            this.text('第一季完（未完待续）', 24, ACCENT);
        }
        this.gap(12);

        if (camp.currentEvent) {
            this.renderEvent(camp);
        } else {
            this.renderTabs();
            if (this.tab === 'camp') {
                this.renderBuildings(camp, now);
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
            } else {
                this.renderReports(camp);
            }
        }

        if (this.toast && now < this.toastUntil) this.text(this.toast, 22, ACCENT);
    }

    private resourceLine(config: GameConfig, camp: CampGame, now: number): string {
        const { state } = camp;
        const rates = economyRates(config, state, now).net;
        return config.resources
            .map((r) => {
                const cap = storageCap(config, state, r.id);
                const amount = Math.floor(state.resources[r.id]);
                const rate = rates[r.id];
                const rateText = Math.abs(rate) >= 0.05 ? `(${rate > 0 ? '+' : ''}${rate.toFixed(1)})` : '';
                return `${r.icon}${amount}${cap === Infinity ? '' : '/' + cap}${rateText}`;
            })
            .join('  ');
    }

    private renderEvent(camp: CampGame): void {
        const event = camp.currentEvent!;
        this.text(`【${event.title}】`, 28, ACCENT);
        this.text(event.text, 24);
        this.gap(16);
        event.choices.forEach((choice, i) => {
            this.button(choice.text, WIDTH, () => {
                const res = camp.choose(i, Date.now());
                this.showToast(res.ok ? res.outcomeText ?? '' : res.reason ?? '');
                this.render();
            });
            this.gap(8);
        });
    }

    private renderBuildings(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text('—— 营地建筑 ——', 22, DIM);
        for (const def of config.buildings) {
            const b = state.buildings[def.id];
            const rowY = this.cursorY;
            this.text(`${def.name} Lv${b.level}`, 24, b.level > 0 ? TEXT : DIM, 300);
            this.cursorY = rowY;
            if (b.upgradeEndsAt !== null) {
                const left = Math.max(0, Math.ceil((b.upgradeEndsAt - now) / 1000));
                this.button(`${formatTime(left)} 看广告加速`, 360, () => this.speedUp(def.id), LEFT + 320);
            } else {
                const next = def.levels[b.level];
                const blocker = upgradeBlocker(config, state, def.id);
                const label = next ? `${b.level === 0 ? '建造' : '升级'} ${formatCost(config, next.cost)}` : '已满级';
                this.button(blocker && next ? `${label}（${blocker}）` : label, 360, () => {
                    const res = camp.upgrade(def.id, Date.now());
                    this.showToast(res.ok ? `开始${b.level === 0 ? '建造' : '升级'}${def.name}` : res.reason);
                    this.render();
                }, LEFT + 320, blocker !== null);
            }
            this.gap(6);
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
            this.button(this.tab === tab ? `【${name}】` : name, w, () => {
                this.tab = tab;
                this.render();
            }, LEFT + col * (w + 10), this.tab !== tab);
        });
        this.gap(14);
    }

    private renderBounties(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text(`—— 悬赏板（${hunterRankName(config, state)} · 经验 ${state.hunterXp}）——`, 22, DIM);
        this.text(`进行中 ${state.bounties.active.length}/${config.balance.maxActiveBounties}`, 22, ACCENT);
        for (const active of state.bounties.active) {
            const def = getBounty(config, active.id);
            if (!def) continue;
            const { current, target } = bountyProgress(config, state, def.id);
            this.text(`🎯 ${def.title}  ${current}/${target}  奖励 ${formatBag(config, def.reward)}`, 22);
            const done = current >= target;
            this.button(done ? '领取奖励' : '放弃', WIDTH, () => {
                const res = done ? camp.claimBounty(def.id, Date.now()) : camp.abandonBounty(def.id, Date.now());
                this.showToast(res.ok ? (done ? `悬赏「${def.title}」完成！` : '已放弃') : res.reason);
                this.render();
            }, LEFT, false);
            this.gap(8);
        }
        this.text('可以接的悬赏', 22, ACCENT);
        for (const def of availableBounties(config, state, now)) {
            this.text(`${def.title}：${def.description}  奖励 ${formatBag(config, def.reward)} · 经验 ${def.xp}`, 20);
            this.button('接取', WIDTH, () => {
                const res = camp.acceptBounty(def.id, Date.now());
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
                const res = camp.craft(item.id, Date.now());
                this.showToast(res.ok ? `做好了一个${item.name}` : res.reason);
                this.render();
            }, LEFT, blocker !== null);
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

    /** 新解锁的成就用 toast 提示一次 */
    private showNewAchievements(camp: CampGame): void {
        if (camp.newAchievements.length === 0) return;
        const names = camp.newAchievements.map((a) => `${a.icon}${a.name}`).join('、');
        camp.newAchievements.length = 0;
        this.showToast(`🏆 解锁成就：${names}`);
    }

    private renderSurvivors(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text(`—— 幸存者（点击切换工作；伤员点击用药品治疗）战斗等级 ${survivorBattleLevel(config, state)} ——`, 22, DIM);
        const jobs: (string | null)[] = [null, ...config.buildings.filter((b) => b.levels.some((l) => l.workerSlots)).map((b) => b.id)];
        const colWidth = (WIDTH - 10) / 2;
        let rowTop = this.cursorY;
        state.survivors.forEach((s, i) => {
            const col = i % 2;
            if (col === 0) rowTop = this.cursorY;
            else this.cursorY = rowTop;
            const def = config.survivors.find((d) => d.id === s.id);
            const recover = s.recoverAt !== null ? formatTime(Math.max(0, Math.ceil((s.recoverAt - now) / 1000))) : '';
            const job = s.injured
                ? `🩹${recover}`
                : isOnExpedition(state, s.id)
                  ? '探索中'
                  : s.assignment
                    ? getBuildingDef(config, s.assignment)?.name
                    : '空闲';
            this.button(`${def?.name ?? s.id} 😊${Math.round(s.mood)} ${job}`, colWidth, () => {
                if (s.injured) {
                    const res = camp.treat(s.id, Date.now());
                    this.showToast(res.ok ? `${def?.name}的伤治好了` : res.reason);
                    this.render();
                    return;
                }
                const start = jobs.indexOf(s.assignment);
                for (let step = 1; step <= jobs.length; step++) {
                    if (camp.assign(s.id, jobs[(start + step) % jobs.length], Date.now()).ok) break;
                }
                this.render();
            }, col === 0 ? LEFT : LEFT + colWidth + 10);
            if (col === 1 || i === state.survivors.length - 1) this.gap(6);
        });
        this.gap(6);
    }

    private renderExplore(camp: CampGame, now: number): void {
        const { config, state } = camp;
        const squad = suggestSquad(config, state);
        const names = squad.map((id) => config.survivors.find((d) => d.id === id)?.name ?? id);
        this.text(`—— 探索（自动编队：${names.join('、') || '没有能出发的人'}）——`, 22, DIM);
        for (const loc of availableLocations(config, state, now)) {
            this.text(`${loc.name}  ⏱${loc.durationMinutes}分钟  战利品 ${formatBag(config, loc.loot)}`, 24);
            this.text(loc.description, 20, DIM);
            const ex = state.expeditions.find((e) => e.location === loc.id);
            if (ex) {
                const left = Math.max(0, Math.ceil((ex.returnsAt - now) / 1000));
                this.button(`小队在外面，${formatTime(left)} 后返回 · 看广告立即返回`, WIDTH, () => this.speedUpExpedition(ex.id));
            } else {
                this.button('派出小队', WIDTH, () => {
                    const res = camp.explore(loc.id, Date.now());
                    this.showToast(res.ok ? `小队出发前往${loc.name}` : res.reason);
                    this.render();
                }, LEFT, squad.length === 0);
            }
            this.gap(12);
        }
    }

    private renderReports(camp: CampGame): void {
        const { reports } = camp.state;
        this.text('—— 战报 ——', 22, DIM);
        if (reports.length === 0) this.text('还没有战斗。', 22, DIM);
        for (const r of reports.slice(-6).reverse()) {
            const icon = r.kind === 'raid' ? '🧟' : '🎒';
            this.text(`${icon} ${r.result === 'win' ? '胜利' : '失败'}  ${r.summary}`, 22, r.result === 'win' ? WIN : LOSE);
            this.gap(6);
        }
    }

    private renderLog(camp: CampGame): void {
        this.text('—— 营地日志 ——', 22, DIM);
        for (const entry of camp.state.log.slice(-4).reverse()) this.text(entry.text, 20, DIM);
    }

    private speedUp(buildingId: string): void {
        this.ads.showRewarded().then((watched) => {
            if (!this.camp) return;
            this.showToast(watched ? '加速完成！' : '需要看完广告才能加速');
            if (watched) this.camp.speedUpUpgrade(buildingId, Date.now());
            this.render();
        });
    }

    private speedUpExpedition(expeditionId: number): void {
        this.ads.showRewarded().then((watched) => {
            if (!this.camp) return;
            if (watched) {
                this.camp.speedUpExpedition(expeditionId, Date.now());
                this.tab = 'reports';
            } else {
                this.showToast('需要看完广告才能加速');
            }
            this.render();
        });
    }

    private showToast(message: string): void {
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

    private makeNode(name: string, parent: Node): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        parent.addChild(node);
        return node;
    }

    private drawBackground(): void {
        const bg = this.makeNode('Background', this.node);
        bg.getComponent(UITransform)!.setContentSize(2000, 3000);
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(28, 32, 30);
        g.rect(-1000, -1500, 2000, 3000);
        g.fill();
    }

    /** 从当前光标位置往下写一段自动换行的文字，返回后光标移到文字下方 */
    private text(str: string, size: number, color: Color = TEXT, width = WIDTH, x = LEFT): void {
        const node = this.makeNode('Text', this.content!);
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

    private button(str: string, width: number, onClick: () => void, x = LEFT, disabled = false, size = 22): void {
        const height = 44;
        const node = this.makeNode('Button', this.content!);
        node.getComponent(UITransform)!.setContentSize(width, height);
        node.setPosition(x + width / 2, this.cursorY - height / 2);
        const g = node.addComponent(Graphics);
        g.fillColor = disabled ? BUTTON_DISABLED : BUTTON;
        g.roundRect(-width / 2, -height / 2, width, height, 8);
        g.fill();

        const labelNode = this.makeNode('Label', node);
        labelNode.getComponent(UITransform)!.setContentSize(width - 12, height);
        const label = labelNode.addComponent(Label);
        label.string = str;
        label.fontSize = size;
        label.lineHeight = height;
        label.color = TEXT;
        label.overflow = Label.Overflow.SHRINK;

        node.on(Node.EventType.TOUCH_END, onClick);
        this.cursorY -= height;
    }

    private gap(px: number): void {
        this.cursorY -= px;
    }
}

function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const mmss = `${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${s.toString().padStart(2, '0')}`;
    return h > 0 ? `${h}:${mmss}` : mmss;
}

function formatCost(config: GameConfig, cost: ResourceBag): string {
    const parts = RESOURCE_IDS.filter((id) => cost[id]).map((id) => {
        const icon = config.resources.find((r) => r.id === id)?.icon ?? id;
        return `${icon}${cost[id]}`;
    });
    return parts.length > 0 ? parts.join(' ') : '免费';
}
