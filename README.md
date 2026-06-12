# 📚 学习打卡 v2.2

> 多人云端学习打卡统计 PWA — 零服务器、零费用、全平台可用

## 🌐 访问地址

**https://peter-code19.github.io/study-punch/**

发给朋友就能用，iOS/安卓/电脑都支持。

---

## 📁 项目文件

```
D:\study-punch-pwa\
├── index.html    # 主页面（含管理按钮）
├── style.css     # 样式
├── app.js        # 全部业务逻辑（Supabase 对接、路由、页面）
└── README.md     # 本文件
```

## ☁️ Supabase（云端数据库）

| 项目 | 值 |
|------|-----|
| 管理后台 | https://supabase.com |
| 项目名 | study-punch |
| Project URL | `https://icxyuscrfsnjlexeejtp.supabase.co` |
| Region | Northeast Asia (Seoul) |

### 数据库表

- `users` — 用户（id, name, color, password_hash, is_admin）
- `sessions` — 学习记录（user_id, start_time, end_time, content, duration_sec）
- `groups_table` — 群组（id, name, created_by）
- `group_members` — 群组成员

### 管理员

ID: `xiaooyou`（is_admin = true）

---

## 🔧 本地修改 & 部署

1. 双击 `index.html` 本地预览
2. 修改代码
3. 上传到 GitHub：https://github.com/peter-code19/study-punch
   → Add file → Upload files → 拖入修改的文件 → Commit
4. 等 30 秒，刷新网页即生效

---

## 🛠️ 技术栈

- 纯 HTML/CSS/JS（零框架、零依赖）
- Supabase PostgreSQL（免费云数据库）
- GitHub Pages（免费静态托管）
- 原生 fetch 调用 Supabase REST API

---

## 📋 功能清单

- ✅ ID + 密码登录
- ✅ 开始/结束学习打卡 + 实时计时器
- ✅ 实时时钟显示
- ✅ 全天可打卡
- ✅ 群组创建/加入（6位邀请码）
- ✅ 群组成员互相可见在线状态
- ✅ 点击头像查看他人学习详情
- ✅ 个人统计（今日/本周/本月/全部）
- ✅ 管理员面板（查看/删除用户和群组）
- ✅ 移动端 PWA（可添加到主屏幕）
- ✅ 🧠 脑图/知识网络（v2.2 新增）
- ✅ 联系方式 QQ: 646335835
