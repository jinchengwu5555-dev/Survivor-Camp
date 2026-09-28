// 微信开放数据域：好友排行榜。只有这里能读到好友的数据，画在 sharedCanvas 上，
// 主域用 SubContextView 组件把 sharedCanvas 显示出来（见 assets/scripts/ui/GameRoot.ts）。
// 主域通过 wx.getOpenDataContext().postMessage({ type: 'showFriends' }) 通知这里刷新。
// 数据由主域 wx.setUserCloudStorage 写入，key 为 survival，value 为
//   { "wxgame": { "score": 最长存活天数, "update_time": 秒 }, "days": 当前这一局的天数 }

const KEY = 'survival';
const WIDTH = 680;
const ROW = 64;

const canvas = wx.getSharedCanvas();
const ctx = canvas.getContext('2d');

function parse(kv) {
    try {
        const item = (kv || []).find((x) => x.key === KEY);
        const v = JSON.parse(item.value);
        return { best: v.wxgame.score || 0, days: v.days || 0 };
    } catch (e) {
        return null;
    }
}

function draw(rows) {
    canvas.width = WIDTH;
    canvas.height = Math.max(1, rows.length) * ROW + 60;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#a0a596';
    ctx.font = '24px sans-serif';
    ctx.fillText('—— 好友排行（最长存活天数）——', 20, 36);
    if (rows.length === 0) {
        ctx.fillText('还没有好友在玩，邀请他们一起活下去吧。', 20, 90);
        return;
    }
    rows.forEach((r, i) => {
        const y = 60 + i * ROW;
        ctx.fillStyle = i < 3 ? '#ffc85a' : '#ebebe1';
        ctx.font = '26px sans-serif';
        ctx.fillText(`${i + 1}`, 20, y + 40);
        ctx.fillText(r.nickname, 80, y + 40);
        ctx.textAlign = 'right';
        ctx.fillText(`${r.best} 天`, WIDTH - 20, y + 40);
        ctx.textAlign = 'left';
    });
}

function showFriends() {
    wx.getFriendCloudStorage({
        keyList: [KEY],
        success(res) {
            const rows = res.data
                .map((u) => ({ nickname: u.nickname, ...(parse(u.KVDataList) || { best: 0, days: 0 }) }))
                .filter((r) => r.best > 0)
                .sort((a, b) => b.best - a.best)
                .slice(0, 20);
            draw(rows);
        },
        fail() {
            draw([]);
        },
    });
}

wx.onMessage((msg) => {
    if (msg && msg.type === 'showFriends') showFriends();
});
