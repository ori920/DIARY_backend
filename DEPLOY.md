# DIARY 后端 · 微信云托管部署指南

环境 ID：`diary-test-d1gpmhclie0a38cba`
后端：`DIARY_backend`（Express，已兼容云托管 `PORT` 注入）

## 一、前置准备（本仓库已就绪）
- `Dockerfile`：构建镜像（node:18-alpine）
- `container.config.json`：服务配置（端口 3000、扩缩容、环境变量）
- `.dockerignore`：排除 node_modules / data
- `DATA_DIR` 环境变量：云托管挂载 CFS 时数据持久化（默认 `./data`）

## 二、微信开发者工具部署步骤
1. 打开微信开发者工具，进入本项目，点工具栏左侧「**云开发**」。
2. 确认当前环境为 `diary-test-d1gpmhclie0a38cba`（环境 ID 显示在云控制台右上角）。
3. 云控制台 → **云托管** → 「**新建服务**」，服务名称填 `diary`，服务备注随意。
4. 进入 `diary` 服务 → 「**新建版本**」：
   - 方式选「**本地代码**」或「**代码仓库**」上传 `DIARY_backend` 整个目录
   - 平台读取 `Dockerfile` 自动构建镜像
   - 构建完成后选「部署」
5. 部署成功后，服务详情页会给出「**默认域名**」，形如：
   `https://diary-xxxxxxx.ap-shanghai.run.tcloudbase.com`
   记下这个域名（后续给小程序用）。

## 三、配置环境变量（关键）
在云托管服务「**设置 → 环境变量**」中确认/补充：
- `WX_APPID` = `wx270ed1a0ce6e248b`（已写入 container.config.json）
- `WX_SECRET` = 你的小程序 secret（**务必在控制台填真实值**，填了才会走真实微信登录；
  不填则进入开发态占位逻辑，返回模拟手机号 `13800000000`）
- `DATA_DIR` = `/data`（若已挂载 CFS 文件存储，用于持久化日记与用户数据）

> 微信小程序 secret 获取：微信公众平台 → 开发管理 → 开发设置 → AppSecret（需管理员扫码）。

## 四、数据持久化（避免容器重启丢数据）
云托管容器默认无状态，`data/` 会随容器重建丢失。两种方案：
1. **推荐：挂载 CFS 文件存储**
   - 云托管服务「设置 → 挂载文件系统」→ 创建/选择 CFS，挂载路径填 `/data`
   - 配合 `DATA_DIR=/data`，日记与用户数据即持久保存
2. 临时：不挂载，仅在开发联调阶段使用（数据重启即清空）

## 五、前端改造
1. 打开 `DIARY/utils/api.js`，将 `BASE_URL` 改为云托管默认域名：
   ```js
   const BASE_URL = 'https://diary-xxxxxxx.ap-shanghai.run.tcloudbase.com'
   ```
   （也可不写死，用 `process.env.VUE_APP_API_BASE` 注入）
2. 微信公众平台 → 开发管理 → **服务器域名** → request 合法域名加入该云托管域名。
3. 真机/模拟器重新编译小程序即可联调。

## 六、验证部署
部署后访问健康检查接口（浏览器或 curl）：
```
GET https://<你的云托管域名>/api/health
```
返回 `{ "code": 0, "message": "success", "data": { "status": "ok", ... } }` 即成功。

## 七、常见问题
- **真机请求失败**：检查小程序后台「服务器域名」是否加了云托管域名。
- **手机号登录返回模拟号**：`WX_SECRET` 未配置真实值，去控制台填入。
- **数据重启后没了**：未挂载 CFS，按第四步挂载并设置 `DATA_DIR=/data`。
- **容器起不来**：看云托管「版本 → 日志」，通常是 `WX_SECRET` 误填或端口不匹配。

后续可选优化（按优先级）
如果你要正式上线，下面这些是建议做的：

1. 安全性（强烈建议）
改 MySQL 密码：NNKs2Sju 是弱密码，建议进云托管 MySQL 控制台改成强密码，同时更新后端环境变量。
db.js 里的硬编码兜底移除：现在 10.19.105.170 / NNKs2Sju 直接写在代码里（虽然环境变量已有），代码如果泄露密码也跟着泄露。生产稳定后可改回 process.env.DB_HOST || 'localhost'，只靠环境变量注入。
2. 性能（建议）
minNum 改为 1：当前 minNum: 0，冷启动会有几秒延迟，用户登录可能等 3-5 秒。改成 1 后会常驻一个实例，响应更快（但会持续计费）。
3. 正式上线（必须）
自定义域名 + ICP 备案：当前 https://diary-301101-11-1473102336.sh.run.tcloudbase.com 这种云托管默认域名，小程序正式发布时不能用（要在工信部备案过的独立域名）。备案通常 1-2 周。
4. 代码精简（可选）
auth.js 里还有未使用的 fs、path、DATA_DIR、USER_FILE、USER_FILE（迁移到 MySQL 后遗留的）。
index.js 顶部 fs、path 也未使用。
这些不影响功能，但清理后代码更干净。
