// 界面小工具：还没有美术资源，所有东西都用代码画（色块 + 文字 + emoji）。
// GameRoot（营地界面）和 BattleView（战斗画面）共用。

import { Color, Graphics, Label, Layers, Node, TTFFont, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { sfx } from '../platform/Audio';

export const COLORS = {
    bg: new Color(28, 32, 30),
    panel: new Color(44, 50, 46),
    panelLight: new Color(60, 68, 62),
    text: new Color(235, 235, 225),
    dim: new Color(160, 165, 150),
    accent: new Color(255, 200, 90),
    button: new Color(70, 110, 80),
    disabled: new Color(80, 80, 80),
    highlight: new Color(214, 150, 40),
    danger: new Color(170, 60, 50),
    win: new Color(140, 220, 140),
    lose: new Color(240, 120, 110),
    heal: new Color(120, 230, 140),
    crit: new Color(255, 220, 80),
};

/** '#4a6fa5' → Color */
export function hexColor(hex: string, alpha = 255): Color {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, alpha);
}

export function makeNode(name: string, parent: Node, width = 0, height = 0): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(width, height);
    parent.addChild(node);
    return node;
}

export interface LabelOptions {
    width?: number;
    height?: number;
    align?: 'left' | 'center' | 'right';
    /** 自动换行并按内容撑高（默认不换行、放不下就缩小字号） */
    wrap?: boolean;
}

// 像素字体 Camp Pixel（Fusion Pixel 12px 的子集，见 tools/subset_font.py）。
// 加载完成前、或者字体里没有的字（emoji）用系统字体顶上。
let uiFont: TTFFont | null = null;
/** 像素字体原生 12px，字号对齐到 6 的倍数才不会糊 */
const PIXEL_STEP = 6;

export function setUiFont(font: TTFFont | null): void {
    uiFont = font;
}

/** 字号对齐到像素字体的网格：14→12，22→24，40→42 */
export function pixelSize(size: number): number {
    if (!uiFont) return size;
    return Math.max(12, Math.round(size / PIXEL_STEP) * PIXEL_STEP);
}

/** 统一设置字体、字号、行高；所有 Label 都要经过这里 */
export function styleLabel(label: Label, size: number, exact = false): void {
    const px = exact ? Math.max(8, Math.round(size)) : pixelSize(size);
    if (uiFont) {
        label.font = uiFont;
        label.useSystemFont = false;
    }
    label.fontSize = px;
    label.lineHeight = px + 8;
}

/** 一个字大约占几个字号宽：中文 1、英文数字 0.6、emoji 1.2（宁可估大一点） */
function charUnits(c: string): number {
    const code = c.codePointAt(0)!;
    if (code < 0x80) return 0.6;
    if (code >= 0x1f000) return 1.2;
    if (code >= 0xfe00 && code <= 0xfe0f) return 0; // emoji 变体选择符
    return 1;
}

/** 估算一行文字的宽度 */
export function textWidth(text: string, px: number): number {
    let longest = 0;
    for (const line of text.split('\n')) {
        let w = 0;
        for (const c of line) w += charUnits(c) * px;
        longest = Math.max(longest, w);
    }
    return longest;
}

/**
 * 单行文字放不下时缩小字号（代替 Cocos 的 SHRINK：换了像素字体后 SHRINK 不生效，
 * 文字会冲出边界，空字符串开头的按钮还会缩成看不见）。
 */
export function fitLabel(label: Label, text: string, width: number, size: number): void {
    const px = pixelSize(size);
    const w = textWidth(text, px);
    if (w <= width || w <= 0) {
        styleLabel(label, size);
        return;
    }
    // 先试着降到像素网格（6 的倍数）上，还放不下就按比例缩
    const snapped = Math.floor((px * width) / w / 6) * 6;
    if (snapped >= 12) styleLabel(label, snapped);
    else styleLabel(label, (px * width) / w, true);
}

/** 改单行文字的内容（顺便重新按宽度算字号） */
export function setLabelText(label: Label, text: string, width: number, size: number): void {
    if (label.string === text) return;
    label.string = text;
    fitLabel(label, text, width - 4, size);
}

/**
 * 自己按宽度插入换行：Cocos 的自动换行在某些字体 / 设备上不生效，长文字会排成一行冲出屏幕。
 * 中文和全角符号按 1 个字号宽，英文数字按 0.6 个，emoji 按 1.2 个估算，宁可早一点换行。
 */
export function wrapText(text: string, width: number, size: number): string {
    const px = pixelSize(size);
    const charWidth = (c: string) => charUnits(c) * px;
    const out: string[] = [];
    for (const para of text.split('\n')) {
        let line = '';
        let w = 0;
        for (const c of para) {
            const cw = charWidth(c);
            // 不让中文标点出现在行首
            if (w + cw > width && line && !'，。、！？；：”）》…'.includes(c)) {
                out.push(line);
                line = '';
                w = 0;
            }
            line += c;
            w += cw;
        }
        out.push(line);
    }
    return out.join('\n');
}

/** 在 parent 下放一个文字节点（锚点在中心） */
export function addLabel(parent: Node, text: string, size: number, color: Color, opts: LabelOptions = {}): Label {
    const node = makeNode('Label', parent, opts.width ?? 600, opts.height ?? size + 10);
    const label = node.addComponent(Label);
    label.string = opts.wrap ? wrapText(text, (opts.width ?? 600) - 4, size) : text;
    if (opts.wrap) styleLabel(label, size);
    else fitLabel(label, text, (opts.width ?? 600) - 4, size);
    label.color = color;
    label.horizontalAlign =
        opts.align === 'left' ? Label.HorizontalAlign.LEFT : opts.align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    if (opts.wrap) {
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
    } else {
        // 字号已经按宽度算好了；CLAMP 保持框的大小，对齐方式才有效
        label.overflow = Label.Overflow.CLAMP;
        label.enableWrapText = false;
    }
    return label;
}

/** 画一个圆角矩形面板（以节点中心为原点） */
export function drawPanel(g: Graphics, width: number, height: number, fill: Color, radius = 10, border?: Color, borderWidth = 3): void {
    g.fillColor = fill;
    g.roundRect(-width / 2, -height / 2, width, height, radius);
    g.fill();
    if (border) {
        g.lineWidth = borderWidth;
        g.strokeColor = border;
        g.roundRect(-width / 2, -height / 2, width, height, radius);
        g.stroke();
    }
}

export type ButtonStyle = 'normal' | 'disabled' | 'highlight' | 'danger' | 'ready';

const STYLE_COLORS: Record<ButtonStyle, Color> = {
    normal: COLORS.button,
    disabled: COLORS.disabled,
    highlight: COLORS.highlight,
    danger: COLORS.danger,
    ready: new Color(60, 140, 200),
};

/** 可以反复改文字和样式的按钮（战斗画面每帧更新冷却时间用） */
export class UIButton {
    readonly node: Node;
    readonly label: Label;
    private readonly g: Graphics;
    private style: ButtonStyle | null = null;
    /** 冷却进度 0～1，画成按钮上的暗色遮罩 */
    private progress = 0;

    constructor(
        parent: Node,
        readonly width: number,
        readonly height: number,
        onClick: () => void,
        private readonly size = 22,
    ) {
        this.node = makeNode('Button', parent, width, height);
        this.g = this.node.addComponent(Graphics);
        // 先放一个空格：Cocos 的 Label 从空字符串改成别的内容时，用自定义字体有时不会重新渲染（按钮上看不到字）
        this.label = addLabel(this.node, ' ', size, COLORS.text, { width: width - 12, height });
        this.node.on(Node.EventType.TOUCH_END, () => {
            if (this.style === 'disabled') return;
            sfx('click');
            punch(this.node);
            onClick();
        });
    }

    set(text: string, style: ButtonStyle = 'normal', progress = 0): void {
        if (this.label.string !== text) {
            this.label.string = text || ' ';
            fitLabel(this.label, text, this.width - 16, this.size);
            this.label.updateRenderData(true);
        }
        if (style === this.style && Math.abs(progress - this.progress) < 0.02) return;
        this.style = style;
        this.progress = progress;
        this.g.clear();
        drawPanel(this.g, this.width, this.height, STYLE_COLORS[style], 8, style === 'highlight' || style === 'ready' ? COLORS.accent : undefined);
        if (progress > 0) {
            this.g.fillColor = new Color(0, 0, 0, 110);
            this.g.rect(-this.width / 2, -this.height / 2, this.width * progress, this.height);
            this.g.fill();
        }
    }
}

/** 点击时轻轻弹一下 */
export function punch(node: Node): void {
    tween(node)
        .to(0.06, { scale: new Vec3(0.94, 0.94, 1) })
        .to(0.1, { scale: new Vec3(1, 1, 1) })
        .start();
}

/** 飘字：从 (x, y) 往上飘并淡出，然后自动销毁 */
export function floatText(parent: Node, text: string, x: number, y: number, color: Color, size = 26, rise = 70, duration = 1): void {
    const label = addLabel(parent, text, size, color, { width: 600 });
    const node = label.node;
    node.setPosition(x, y);
    const opacity = node.addComponent(UIOpacity);
    tween(node)
        .by(duration, { position: new Vec3(0, rise, 0) })
        .start();
    tween(opacity)
        .delay(duration * 0.5)
        .to(duration * 0.5, { opacity: 0 })
        .call(() => node.destroy())
        .start();
}

export function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const mmss = `${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${s.toString().padStart(2, '0')}`;
    return h > 0 ? `${h}:${mmss}` : mmss;
}

/** 红点：在 parent 的 (x, y) 画一个小红圆，count > 1 时写上数字 */
export function addBadge(parent: Node, x: number, y: number, count: number): void {
    if (count <= 0) return;
    const node = makeNode('Badge', parent, 26, 26);
    node.setPosition(x, y);
    const g = node.addComponent(Graphics);
    const r = count > 1 ? 13 : 9;
    g.fillColor = new Color(230, 50, 40);
    g.circle(0, 0, r);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = new Color(255, 240, 230);
    g.circle(0, 0, r);
    g.stroke();
    if (count > 1) addLabel(node, count > 9 ? '9+' : String(count), 15, new Color(255, 255, 255), { width: 26, height: 22 });
}
