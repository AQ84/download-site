// functions/api/files.js — 文件索引的读写接口 (Cloudflare Pages Function)
//
//   GET /api/files   公开读, 不需要密钥
//   PUT /api/files   管理员写, 需要请求头 X-Admin-Key
//   POST /api/files  同 PUT (方便 curl / 表单)
//
// 存储用 KV(键值对), **不是数据库** —— 所以整类 SQL 注入在这里不存在,
// 因为压根没有 SQL 语句、没有表、没有拼接。键也只有固定的一个 'index'。
//
// 但这不代表可以不做校验: 索引是【公开渲染】的, 写进去的东西会显示在首页上,
// 所以下面 validateIndex() 做了白名单 + 长度上限 + URL 协议白名单 ——
// 主要是防"存一个 javascript: 链接进去"这类存储型 XSS, 以及防止把 KV 撑爆。
//
// 密钥从环境变量 ADMIN_KEY 读, **不硬编码在仓库里**(这个仓库是公开的)。
// 没配的话写接口会明确告诉你该去哪儿配, 而不是退化成一个谁都能写的水站。

const KV_KEY    = 'index';        // KV 里存索引用的键, 固定
const MAX_BODY  = 256 * 1024;     // 索引最大 256 KB
const MAX_FAILS = 8;              // 同一 IP 连续失败几次后暂时拉黑
const FAIL_TTL  = 300;            // 拉黑时长(秒)

// ---------------------------------------------------------------- 工具

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}

// 常数时间比较 —— 不要用 === 比密钥, 那样会通过"第几个字符开始不同"的耗时差
// 逐字节试出正确值。长度不同也照样跑完同样的轮数。
function timingSafeEqual(a, b) {
  const ab = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  const n = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < n; i++) {
    diff |= (ab[i % (ab.length || 1)] || 0) ^ (bb[i % (bb.length || 1)] || 0);
  }
  return diff === 0;
}

// 控制字符一律剔掉(会造成 JSON/日志/终端里各种怪问题)
function clean(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/[\u0000-\u001f\u007f]/g, '');
}

function str(v, max) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = clean(v);
  return s.length > max ? null : s;
}

function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// 文件名: 站内下载链接是 files/${encodeURIComponent(name)}, 所以不能含路径分隔符,
// 也不能是 . / .. —— 否则能拼出目录穿越。
function safeFileName(v) {
  const s = str(v, 200);
  if (!s) return null;
  if (s === '.' || s === '..') return null;
  if (/[\\/]/.test(s)) return null;
  return s;
}

// 链接: 只允许 http/https。挡掉 javascript: / data: / vbscript: / file: ——
// 这个页面的下载按钮是 <a href="用户填的 url">, 不挡就是一个存储型 XSS。
function safeUrl(v) {
  const s = str(v, 2000);
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return s;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// ---------------------------------------------------------------- 校验

// 返回值: { ok: true, value } 或 { ok: false, error }
function validateIndex(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: '顶层必须是一个 JSON 对象' };
  }
  const cats = input.categories;
  if (!Array.isArray(cats)) return { ok: false, error: '缺少 categories 数组' };
  if (cats.length > 50) return { ok: false, error: '分类太多(上限 50)' };

  const outCats = [];

  for (let ci = 0; ci < cats.length; ci++) {
    const c = cats[ci];
    const where = `第 ${ci + 1} 个分类`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      return { ok: false, error: `${where} 不是一个对象` };
    }

    const id = str(c.id, 32);
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      return { ok: false, error: `${where} 的 id 只能用字母/数字/下划线/连字符` };
    }
    const name = str(c.name, 100);
    if (!name) return { ok: false, error: `${where} 缺少 name (或太长)` };
    const desc = str(c.desc, 200);
    if (desc === null) return { ok: false, error: `${where} 的 desc 太长` };

    const pkgsIn = c.packages === undefined ? [] : c.packages;
    const filesIn = c.files === undefined ? [] : c.files;
    if (!Array.isArray(pkgsIn)) return { ok: false, error: `${where} 的 packages 不是数组` };
    if (!Array.isArray(filesIn)) return { ok: false, error: `${where} 的 files 不是数组` };
    if (pkgsIn.length > 200) return { ok: false, error: `${where} 的包太多(上限 200)` };
    if (filesIn.length > 500) return { ok: false, error: `${where} 的文件太多(上限 500)` };

    const packages = [];
    for (let pi = 0; pi < pkgsIn.length; pi++) {
      const p = pkgsIn[pi];
      const pw = `${where} 第 ${pi + 1} 个包`;
      if (!p || typeof p !== 'object') return { ok: false, error: `${pw} 不是一个对象` };

      const out = {};
      out.id = str(p.id, 64) || '';
      out.name = str(p.name, 200);
      if (!out.name) return { ok: false, error: `${pw} 缺少 name (或太长)` };
      out.description = str(p.description, 1000) || '';
      out.version = str(p.version, 64) || '';
      out.date = str(p.date, 32) || '';
      out.format = str(p.format, 16) || '';
      out.notes = str(p.notes, 500) || '';
      out.merge_cmd = str(p.merge_cmd, 500) || '';

      const size = num(p.size_mb);
      if (size === null) return { ok: false, error: `${pw} 的 size_mb 不是数字` };
      out.size_mb = size;

      // 有 url = 外链包(蓝奏云/GitHub releases 等); 没有 url = 分片包, 必须给 parts
      if (p.url !== undefined && p.url !== '') {
        const u = safeUrl(p.url);
        if (!u) return { ok: false, error: `${pw} 的 url 只能填 http/https 开头的链接` };
        out.url = u;
      } else if (Array.isArray(p.parts)) {
        out.parts = [];
        for (const part of p.parts) {
          const fn = safeFileName(part);
          if (!fn) return { ok: false, error: `${pw} 的分片名不合法: ${JSON.stringify(part)}` };
          out.parts.push(fn);
        }
      } else {
        return { ok: false, error: `${pw} 既没有 url 也没有 parts —— 点了会 404` };
      }

      packages.push(out);
    }

    const files = [];
    for (let fi = 0; fi < filesIn.length; fi++) {
      const f = filesIn[fi];
      const fw = `${where} 第 ${fi + 1} 个文件`;
      if (!f || typeof f !== 'object') return { ok: false, error: `${fw} 不是一个对象` };

      const name = safeFileName(f.name);
      if (!name) return { ok: false, error: `${fw} 的 name 不合法(不能含 / 或 \\, 不能是 . / ..)` };

      const size = num(f.size_bytes);
      if (size === null) return { ok: false, error: `${fw} 的 size_bytes 不是数字` };

      const desc = str(f.description, 1000);
      if (desc === null) return { ok: false, error: `${fw} 的 description 太长` };

      files.push({
        name,
        size_bytes: size,
        date: str(f.date, 32) || '',
        version: str(f.version, 64) || '',
        description: desc || '',
      });
    }

    outCats.push({ id, name, desc, packages, files });
  }

  return { ok: true, value: { categories: outCats } };
}

// ---------------------------------------------------------------- 失败限流
//
// KV 不是为计数器设计的, 但对这种小站足够: 记一下失败次数, 超了就 5 分钟内
// 直接拒掉, 免得有人拿字典硬撞。KV 最终一致, 所以不是精确值 —— 挡脚本够了。

async function isBlocked(env, ip) {
  const kv = env.FILES_KV;
  if (!kv) return false;
  try {
    const n = await kv.get(`fail:${ip}`);
    return n !== null && Number(n) >= MAX_FAILS;
  } catch { return false; }
}

async function noteFail(env, ip) {
  const kv = env.FILES_KV;
  if (!kv) return;
  try {
    const n = Number(await kv.get(`fail:${ip}`)) || 0;
    await kv.put(`fail:${ip}`, String(n + 1), { expirationTtl: FAIL_TTL });
  } catch { /* 记不上就算了, 不能因此挡掉正常请求 */ }
}

async function clearFails(env, ip) {
  const kv = env.FILES_KV;
  if (!kv) return;
  try { await kv.delete(`fail:${ip}`); } catch { /* 同上 */ }
}

// ---------------------------------------------------------------- GET

export async function onRequestGet(context) {
  const { env, request } = context;

  const kv = env.FILES_KV;
  if (kv) {
    try {
      const raw = await kv.get(KV_KEY);
      if (raw) {
        return new Response(raw, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Index-Source': 'kv',
          },
        });
      }
    } catch (e) {
      // KV 读挂了也不能让首页白屏 —— 落到下面的静态文件
    }
  }

  // 回落到仓库里的 files.json: 这样"还没绑 KV"或"还没在线改过"时站点照常工作
  try {
    const res = await env.ASSETS.fetch(new URL('/files.json', request.url));
    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Index-Source': 'static',
        'X-KV-Bound': kv ? '1' : '0',
      },
    });
  } catch {
    return json({ error: '读不到索引' }, 500);
  }
}

// ---------------------------------------------------------------- PUT / POST

async function handleWrite(context) {
  const { env, request } = context;

  if (!env.FILES_KV) {
    return json({
      error: 'KV 未绑定, 现在只能读不能写',
      howto: [
        '在 Cloudflare 后台: Workers & Pages → download-site → 设置 → 函数 → KV 命名空间绑定',
        '添加变量名 FILES_KV, 指向一个 KV 命名空间(没有就新建一个)',
        '然后再重新部署一次即可',
      ],
    }, 503);
  }

  const expect = env.ADMIN_KEY;
  if (!expect) {
    return json({
      error: '服务端没有配置管理员密钥, 写接口已关闭',
      howto: [
        '在 Cloudflare 后台: Workers & Pages → download-site → 设置 → 环境变量',
        '添加一个【加密】变量 ADMIN_KEY, 值就是管理员密钥',
        '不要把它提交到仓库里 —— 这个仓库是公开的',
      ],
    }, 503);
  }

  // 限流: 撞太多次先歇一会儿
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await isBlocked(env, ip)) {
    return json({ error: `尝试次数过多, 请 ${Math.round(FAIL_TTL / 60)} 分钟后再试` }, 429);
  }

  // 密钥走请求头, 不走 URL —— URL 会进日志/Referer/浏览器历史
  const given = request.headers.get('X-Admin-Key') || '';
  if (!timingSafeEqual(given, expect)) {
    await noteFail(env, ip);
    return json({ error: '密钥不正确' }, 401);
  }
  await clearFails(env, ip);

  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return json({ error: `内容太大(上限 ${MAX_BODY / 1024} KB)` }, 413);

  let text;
  try { text = await request.text(); } catch { return json({ error: '读请求体失败' }, 400); }
  if (text.length > MAX_BODY) return json({ error: `内容太大(上限 ${MAX_BODY / 1024} KB)` }, 413);

  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    return json({ error: '不是合法的 JSON: ' + e.message }, 400);
  }

  const checked = validateIndex(parsed);
  if (!checked.ok) return json({ error: '校验没过: ' + checked.error }, 400);

  const out = JSON.stringify(checked.value, null, 4);
  try {
    await env.FILES_KV.put(KV_KEY, out);
  } catch (e) {
    return json({ error: '写入 KV 失败: ' + e.message }, 500);
  }

  const nPkg = checked.value.categories.reduce((s, c) => s + c.packages.length, 0);
  const nFile = checked.value.categories.reduce((s, c) => s + c.files.length, 0);

  return json({
    ok: true,
    categories: checked.value.categories.length,
    packages: nPkg,
    files: nFile,
    bytes: out.length,
    at: new Date().toISOString(),
  });
}

export async function onRequestPut(context) {
  return handleWrite(context);
}

export async function onRequestPost(context) {
  return handleWrite(context);
}
