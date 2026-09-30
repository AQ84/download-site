# AQ84 下载站

通用文件下载站，运行在 Cloudflare Pages 上 → <https://download.aq84.xyz>

## 项目结构

```
download-site/
├── index.html          主页
├── app.js              前端逻辑（索引优先走 /api/files，拿不到回落 files.json）
├── style.css           样式
├── admin.html          管理页：在线改索引（要密钥）
├── files.json          文件清单（静态兜底，也是首次部署的初始索引）
├── files/              实际下载文件放这里
├── functions/
│   └── api/files.js    Pages Function：GET 公开读索引 / PUT 写索引（要密钥）
├── wrangler.toml       Pages 配置：KV 绑定声明
├── _headers            Cloudflare 自定义 HTTP 头
└── README.md
```

---

## 改索引：两种方式

### 方式一（推荐）：在网站上直接改

打开 **<https://download.aq84.xyz/admin.html>** → 输入管理员密钥 → 「读当前索引」→
改 JSON → 「保存并发布」。保存后**立刻生效**，不用 push、不用等构建。

- 密钥只存在**你本机浏览器**里（localStorage），保存时通过请求头 `X-Admin-Key` 发给
  服务端校验；不走网址、不写日志、服务端也不保存。
- 有「只校验」「格式化」「插入模板」「下载 JSON」几个按钮，改错了本地就拦住，不会发到服务端。
- 索引存在 **KV**（键值对存储）里，不是文件。

### 方式二（兜底）：改 files.json 再 push

```bash
cd C:\Users\huawei\_dl-site
git add -A && git commit -m "..." && git push origin master
```

push 后几十秒自动部署。**注意**：一旦在网站上保存过一次，索引就存在 KV 里了，
这时 `/api/files` 优先返回 KV 的内容 —— 再改 `files.json` 是不生效的
（它只是"KV 里还没有东西时"的兜底）。想回到文件版本，把 KV 里的 `index` 键删掉即可：

```bash
npx wrangler kv key delete index --namespace-id 5c14bd9998f1452aa0adbd99137292e9 --remote
```

---

## files.json 的关键：两套结构，别混

| 结构 | app.js 里的链接方式 | 用途 |
|---|---|---|
| **`packages[]` 带 `url`** | `<a href="${url}">` | **外部链接**（蓝奏云 / GitHub releases 等） |
| **`packages[]` 带 `parts[]`** | `href="files/<name>"` | 分片包，每片是站内 `files/` 下的真实文件名 |
| **`files[]`** | `href="files/<name>"` | 站内单文件，**只能指 `files/` 目录下真实存在的文件** |

**外部链接必须用 `packages[]`。** 塞进 `files[]` 会被当成站内文件名，点了 404。

`packages[]` 字段：`id / name / description / version / date / format / url / size_mb / notes`。
`notes` 那行渲染成「📌 xxx」，放提取码正合适。

已有分类：`mc`（整合包）/ `launcher`（启动器）/ `plugins`（插件）/ `tools`（工具）

---

## 服务端接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/files` | 公开读索引。优先返回 KV 里的，没有则回落到仓库的 `files.json` |
| `PUT` / `POST` | `/api/files` | 写索引。需要请求头 `X-Admin-Key`，body 是完整的索引 JSON |

调试用响应头：`X-Index-Source: kv|static`（这份索引从哪来的）、
`X-KV-Bound: 0|1`（KV 绑定有没有生效）。

```bash
# 读
curl -s https://download.aq84.xyz/api/files | head -c 300

# 写（密钥走请求头）
curl -X PUT https://download.aq84.xyz/api/files \
  -H "X-Admin-Key: <密钥>" -H "Content-Type: application/json" \
  --data-binary @files.json
```

### 安全设计

- **没有 SQL**。索引存在 KV（键值对）里，没有表、没有查询、没有字符串拼接 ——
  整类 SQL 注入在这里不存在。索引的键是固定的 `index`，也不可控。
- **密钥存在服务端加密环境变量里，不进仓库**（这个仓库是公开的）。
  校验用**常数时间比较**，避免通过响应耗时逐字节试出密钥。
- **暴力破解限流**：同一 IP 连续失败 8 次后拉黑 5 分钟（之后即使密钥正确也拒）。
  公开读不受影响。
- **输入白名单校验**（`functions/api/files.js` 的 `validateIndex()`）：
  - 未知字段**直接丢掉**（只保留白名单里的字段）
  - `url` **只允许 http/https** —— 挡掉 `javascript:` / `data:` 这类
    「存一个恶意链接进去，别人点一下就执行」的存储型 XSS
  - 站内文件名不能含 `/` `\`，不能是 `.` / `..` —— 挡目录穿越
  - 所有字符串有长度上限，请求体上限 256 KB
  - 分类 id 只允许字母/数字/下划线/连字符
  - 控制字符一律剔除
- 管理页 `noindex`，`/api/*` 一律 `Cache-Control: no-store`。

### 首次配置（已经做过了，换账号时备用）

```bash
# 1) 建 KV 命名空间，把返回的 id 填进 wrangler.toml
npx wrangler kv namespace create FILES_KV

# 2) 设置管理员密钥（加密环境变量，不会进仓库）
npx wrangler pages secret put ADMIN_KEY --project-name download-site
```

如果后台没绑 KV（`X-KV-Bound: 0`），站点**照常能读**，只是保存时会返回 503 并提示
去哪儿绑 —— 不会白屏、也不会退化成谁都能写的水站。

本地调试：

```bash
npx wrangler pages dev . --kv FILES_KV --binding ADMIN_KEY=<密钥> --port 8799
```

---

## 部署

- **Cloudflare Pages** 项目名 `download-site`，Git 集成（`master` 分支 push 自动部署）
- 自定义域 `download.aq84.xyz`（DNS 里是 CNAME → `download-site-c3k.pages.dev`，已代理）
- 构建命令留空，输出目录就是仓库根

---

## 获取文件大小

```powershell
(Get-Item "files\文件名.jar").Length
```
