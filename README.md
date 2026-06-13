# 📚 学习打卡

轻量级学习打卡 PWA，支持多人组队、互相监督、知识脑图。纯前端应用，零外部依赖，基于 Supabase 后端。

## ✨ 功能

- **📖 学习计时** — 一键开始/结束学习，自动记录学习内容和时长
- **👥 群组协作** — 创建或加入群组，与朋友互相监督学习进度
- **📊 数据统计** — 日/周/月/全部学习时长与次数统计，支持历史记录回溯
- **🕸️ 知识脑图** — 树形布局和力导向网络两种视图，支持跨 Part 自动关联
- **🔐 账号系统** — SHA-256 密码哈希，安全登录注册
- **🌙 深色模式** — 一键切换，localStorage 持久化
- **📱 PWA 支持** — 可添加到主屏幕，接近原生应用体验
- **🔄 跨设备同步** — 多端登录时自动同步进行中的学习状态，清理僵尸任务

## 🛠 技术栈

| 层 | 技术 |
|---|------|
| 前端 | HTML5 + CSS3 + Vanilla JS（零框架、零 npm 依赖） |
| 后端 | [Supabase](https://supabase.com/) REST API |
| 部署 | GitHub Pages / 任意静态托管 |

## 🚀 快速开始

### 1. 创建 Supabase 项目

在 [supabase.com](https://supabase.com) 创建免费项目，执行以下 SQL 建表：

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'hsl(200,55%,50%)',
  password_hash TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 学习记录表
CREATE TABLE sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_sec INTEGER,
  content TEXT
);

-- 群组表
CREATE TABLE groups_table (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 群组成员表
CREATE TABLE group_members (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id TEXT REFERENCES groups_table(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE
);

-- 脑图 Part 表
CREATE TABLE mindmap_parts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 脑图节点表
CREATE TABLE mindmap_nodes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  part_id BIGINT REFERENCES mindmap_parts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  parent_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 脑图链接表
CREATE TABLE mindmap_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  from_node_id BIGINT REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
  to_node_id BIGINT REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. 配置连接

编辑 `app.js` 顶部的两行配置，替换为你的 Supabase 项目 URL 和 anon key：

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-key';
```

### 3. 部署

将 `index.html`、`app.js`、`style.css` 三个文件部署到任意静态托管服务：

```bash
# 本地预览（需要任意 HTTP 服务器）
npx serve .

# GitHub Pages
git push origin main
```

## 📁 项目结构

```
.
├── index.html    # 主页面（SPA 骨架）
├── app.js        # 全部业务逻辑
├── style.css     # 样式（含深色模式）
└── README.md
```

## 🎯 使用说明

1. 打开页面，输入 ID 和密码（首次自动注册，再次即登录）
2. 在首页点击「开始学习」记录学习任务
3. 创建或加入群组，和伙伴互相监督
4. 在统计页查看学习数据
5. 在脑图页构建知识网络

## 📄 许可

MIT License
