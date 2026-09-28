// 微信云函数：全服存活天数排行榜。
// 部署：微信开发者工具里右键 cloudfunctions/leaderboard（构建后在 build/wechatgame 里） →“上传并部署：云端安装依赖”。
// 数据库里要先建一个集合 leaderboard（权限选“仅创建者可读写”，客户端不直接读写，全部经过这个云函数）。
//
// 调用：
//   { action: 'submit', runId, days }  上报这一局的天数，返回服务器认可的 { runDays, bestDays, clamped }
//   { action: 'top' }                  返回 { list: [{ name, bestDays, me }], me: { bestDays, rank } }

const cloud = require('wx-server-sdk');
const { acceptScore } = require('./rules');
const cfg = require('./config.json');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const board = db.collection('leaderboard');

/** 不收集昵称（避免内容审核），全服榜用 openid 生成一个代号；好友榜在开放数据域里显示微信昵称 */
function codeName(openid) {
    return `幸存者${openid.slice(-4).toUpperCase()}`;
}

async function getRecord(openid) {
    try {
        const res = await board.doc(openid).get();
        return res.data;
    } catch (e) {
        return null;
    }
}

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return { error: 'no openid' };

    if (event.action === 'submit') {
        const prev = await getRecord(OPENID);
        const next = acceptScore(prev, { runId: Number(event.runId), days: event.days }, Date.now(), cfg);
        const data = { runId: next.runId, runStartAt: next.runStartAt, runDays: next.runDays, bestDays: next.bestDays, name: codeName(OPENID), updatedAt: db.serverDate() };
        await board.doc(OPENID).set({ data });
        return { runDays: next.runDays, bestDays: next.bestDays, clamped: next.clamped };
    }

    if (event.action === 'top') {
        const res = await board.orderBy('bestDays', 'desc').limit(cfg.maxTop).get();
        const list = res.data.map((r) => ({ name: r.name, bestDays: r.bestDays, me: r._id === OPENID }));
        const mine = await getRecord(OPENID);
        let me = null;
        if (mine) {
            const ahead = await board.where({ bestDays: db.command.gt(mine.bestDays) }).count();
            me = { bestDays: mine.bestDays, rank: ahead.total + 1 };
        }
        return { list, me };
    }

    return { error: 'unknown action' };
};
