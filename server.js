/**
 * 虚拟仿真平台统计服务 —— 可选组件
 * ------------------------------------------------------------------
 * 作用：让「累计参与实验人数」和「实验成绩台账」在部署到网站后，
 *       不再只存在单个浏览器的 localStorage 里，而是写入服务器端的
 *       stats.json，实现多台机器 / 多个浏览器访问同一网站时累计记录。
 *
 * 用法（零依赖，Node 18+）：
 *   1) 把本文件和 stats.json 放到平台 HTML 所在目录
 *   2) node server.js            # 默认监听 8080 端口
 *      PORT=9000 node server.js  # 指定端口
 *   3) 浏览器访问 http://服务器IP:8080/HF锂离子蓄电池供应链仿真平台_双场景版.html
 *
 * 接口约定（平台前端已内置调用，无需改前端代码）：
 *   GET  api/stats   -> { logins: 12, records: [ {user,score,time,...} ] }
 *   POST api/stats   <- { logins: 13, records: [...] }   （覆盖写入，服务器做合并去重）
 *
 * 关闭服务或删除 stats.json 也不影响平台使用：
 *   前端 fetch 失败会静默降级为纯本地存储，功能不中断。
 * ------------------------------------------------------------------
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'stats.json');

// 基线：前期已开展实验累计
const BASE_PARTICIPANTS = 260;
// 后期每次登录按双倍人次登记
const LOGIN_INCREMENT = 2;
// 台账保留上限
const RECORD_KEEP = 200;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      logins: Number(data.logins) || 0,
      records: Array.isArray(data.records) ? data.records : []
    };
  } catch (e) {
    return { logins: 0, records: [] };
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('[stats] 写入 stats.json 失败：', e.message);
  }
}

// 按 用户名+时间 去重合并，按时间倒序
function mergeRecords(existing, incoming) {
  if (!Array.isArray(incoming)) return existing;
  const seen = new Set(existing.map(r => (r.user || '') + '@' + (r.time || 0)));
  const merged = existing.slice();
  incoming.forEach(r => {
    if (!r || typeof r !== 'object') return;
    const key = (r.user || '') + '@' + (r.time || 0);
    if (!seen.has(key)) { merged.push(r); seen.add(key); }
  });
  merged.sort((a, b) => (b.time || 0) - (a.time || 0));
  return merged.slice(0, RECORD_KEEP);
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname || '/');

  // ---- CORS 预检 ----
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // ---- 统计接口 ----
  if (pathname === '/api/stats' || pathname.endsWith('/api/stats')) {
    if (req.method === 'GET') {
      const store = readStore();
      return sendJSON(res, 200, {
        logins: store.logins,
        records: store.records.slice(0, RECORD_KEEP),
        participants: BASE_PARTICIPANTS + store.logins * LOGIN_INCREMENT
      });
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) req.destroy();   // 上限 5MB
      });
      req.on('end', () => {
        let payload = {};
        try { payload = JSON.parse(body || '{}'); } catch (e) { payload = {}; }
        const store = readStore();
        if (typeof payload.logins === 'number' && payload.logins > store.logins) {
          store.logins = payload.logins;
        }
        store.records = mergeRecords(store.records, payload.records);
        writeStore(store);
        return sendJSON(res, 200, {
          ok: true,
          logins: store.logins,
          records: store.records.slice(0, RECORD_KEEP),
          participants: BASE_PARTICIPANTS + store.logins * LOGIN_INCREMENT
        });
      });
      return;
    }
    return sendJSON(res, 405, { error: 'method not allowed' });
  }

  // ---- 静态文件 ----
  let rel = pathname === '/' ? '/HF锂离子蓄电池供应链仿真平台_双场景版.html' : pathname;
  const safe = path.normalize(rel).replace(/^([/\\])+/, '');
  const filePath = path.join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); return res.end('403 Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('虚拟仿真平台统计服务已启动');
  console.log('  访问地址：http://localhost:' + PORT + '/');
  console.log('  统计接口：http://localhost:' + PORT + '/api/stats');
  console.log('  数据文件：' + DATA_FILE);
  console.log('  基线人数 ' + BASE_PARTICIPANTS + ' 人次，后期每次登录 +' + LOGIN_INCREMENT + ' 人次');
});
