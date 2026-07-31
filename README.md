# AQ84 下载站

通用文件下载站，运行在 Cloudflare Pages 上。

## 项目结构

```
download-site/
├── index.html      # 主页
├── style.css       # 样式
├── app.js          # 前端逻辑
├── files.json      # 文件清单（手动维护）
├── files/          # 实际下载文件放这里
├── _headers        # Cloudflare 自定义 HTTP 头
└── README.md
```

## 如何添加新文件

1. 把文件放到 `files/` 目录
2. 编辑 `files.json`，添加一条记录：

```json
{
    "name": "文件名.jar",
    "size_bytes": 1234567,
    "date": "2026-07-31",
    "version": "1.0.0",
    "description": "简短描述"
}
```

3. `git push` → 自动部署

## 部署到 Cloudflare Pages

### 第一次部署

1. 把这个目录初始化为 git 仓库，推到 GitHub：
```bash
cd download-site
git init
git add .
git commit -m "初始化下载站"
git remote add origin https://github.com/你的用户名/download-site.git
git push -u origin main
```

2. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Pages** → **连接到 Git**

3. 选择你的 GitHub 仓库，构建设置：
   - **Build command**：留空
   - **Output directory**：留空（或填 `/`）

4. 部署完成后，在项目设置 → **自定义域** 添加 `download.aq84.xyz`

### DNS 设置

在 Cloudflare DNS 里添加一条 CNAME 记录：
- **名称**：`download`
- **目标**：`你的项目名.pages.dev`
- **代理状态**：已代理（橙色云朵）

## 获取文件大小

Windows PowerShell 一行命令：
```powershell
(Get-Item "files\文件名.jar").Length
```

## 技术栈

- 纯静态 HTML/CSS/JS，无框架
- Cloudflare Pages 托管（免费，无限带宽）
- 暗色主题，响应式设计
