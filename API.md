# DIARY 后端接口文档

日记后端服务（Express 4），所有接口统一前缀为 `/api`，数据持久化到 `data/diaries.json`。

## 基础信息

- **Base URL**：`http://localhost:3000`（可通过环境变量 `PORT` 修改端口）
- **统一返回结构**：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

- `code === 0` 表示成功；非 0 / HTTP 状态码 >= 400 表示失败，`message` 为错误描述，`data` 为 `null`。
- 请求体统一为 JSON，需设置 `Content-Type: application/json`。

## 日记数据结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 日记唯一标识（后端生成，如 `d1692xxx123`） |
| `title` | string | 标题（选填，最多 30 字） |
| `content` | string | 正文内容（选填） |
| `weather` | string | 天气：`sunny` / `cloudy` / `rain` / `snow` / `fog` |
| `mood` | string | 心情：`happy` / `calm` / `sad` / `angry` / `tired` |
| `date` | string | 日期，格式 `YYYY-MM-DD`（默认当天） |
| `createTime` | number | 创建时间戳（毫秒，后端生成） |

---

## 接口列表

### 1. 健康检查

```
GET /api/health
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": { "status": "ok", "time": 1692700000000 }
}
```

---

### 2. 获取全部日记

```
GET /api/diaries
```

按 `createTime` 倒序返回全部日记。

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "d1692700000123",
      "title": "今天天气真好",
      "content": "去公园散步了",
      "weather": "sunny",
      "mood": "happy",
      "date": "2026-08-22",
      "createTime": 1692700000000
    }
  ]
}
```

---

### 3. 根据 id 获取单条日记

```
GET /api/diaries/:id
```

**路径参数**：

| 参数 | 说明 |
|------|------|
| `id` | 日记 id |

**错误**：日记不存在返回 `404`。

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": { "id": "d1692700000123", "title": "今天天气真好", "...": "..." }
}
```

---

### 4. 新增日记（通用）

```
POST /api/diaries
```

**请求体**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 否 | 标题 |
| `content` | 否 | 正文 |
| `weather` | 否 | 天气，默认 `sunny` |
| `mood` | 否 | 心情，默认 `happy` |
| `date` | 否 | 日期，默认当天 |

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": { "id": "d1692700000123", "title": "标题", "...": "..." }
}
```

---

### 5. 写日记（前端"写日记"页面专用）

```
POST /api/diary/write
```

用于前端写日记页面存储数据，功能同"新增日记"，但增加了基础校验。

**请求体**：同 `POST /api/diaries`（`title` / `content` / `weather` / `mood` / `date`）。

**校验规则**：`title` 与 `content` 不能同时为空，否则返回：

```json
{
  "code": 400,
  "message": "日记标题或内容不能为空",
  "data": null
}
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": { "id": "d1692700000123", "title": "标题", "...": "..." }
}
```

---

### 6. 更新日记

```
PUT /api/diaries/:id
```

**路径参数**：`id` —— 日记 id

**请求体**（均为选填，仅更新传入字段）：

| 字段 | 说明 |
|------|------|
| `title` | 新标题 |
| `content` | 新正文 |
| `weather` | 新天气 |
| `mood` | 新心情 |
| `date` | 新日期 |

**错误**：日记不存在返回 `404`。

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": { "id": "d1692700000123", "title": "修改后的标题", "...": "..." }
}
```

---

### 7. 删除日记

```
DELETE /api/diaries/:id
```

**路径参数**：`id` —— 日记 id

**错误**：日记不存在返回 `404`。

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": { "id": "d1692700000123" }
}
```

---

### 8. 按日期查询日记

```
GET /api/diaries/date/:date
```

**路径参数**：

| 参数 | 说明 |
|------|------|
| `date` | 日期，格式 `YYYY-MM-DD` |

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": [ { "id": "d1692700000123", "...": "..." } ]
}
```

---

### 9. 清空全部日记

```
DELETE /api/diaries
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": { "count": 0 }
}
```

---

## 错误码说明

| HTTP 状态码 | code | 含义 |
|-------------|------|------|
| 200 | 0 | 成功 |
| 400 | 400 | 参数校验失败（如写日记标题和内容均为空） |
| 404 | 404 | 资源不存在（日记 id 无效 / 接口路径不存在） |

未知路径统一返回 `404 { code: 404, message: "接口不存在", data: null }`。

## 启动方式

```bash
cd DIARY_backend
npm install
npm start          # 或 npm run dev，默认监听 3000 端口
```
