const express = require('express')
const fs = require('fs')
const path = require('path')

const auth = require('./auth')
const { pool, initTables } = require('./db')

console.log('[启动] DB_HOST =', process.env.DB_HOST || '(未设置)', '| DB_PORT =', process.env.DB_PORT || 3306, '| DB_NAME =', process.env.DB_NAME || 'diary')

const app = express()
const PORT = process.env.PORT || 3000

// 解析 JSON 请求体
app.use(express.json())

function genId() {
  return 'd' + Date.now() + Math.floor(Math.random() * 1000)
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 统一返回结构
function ok(res, data) {
  res.json({ code: 0, message: 'success', data })
}
function fail(res, status, message) {
  res.status(status).json({ code: status, message, data: null })
}

// 行 -> 前端结构（createTime 字段映射）
function rowToDiary(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    weather: row.weather,
    mood: row.mood,
    date: row.date,
    createTime: row.create_time,
    openid: row.openid
  }
}

// ---------- 路由 ----------
const router = express.Router()

// 健康检查
router.get('/health', (req, res) => ok(res, { status: 'ok', time: Date.now() }))

// 获取当前用户的全部日记（按创建时间倒序）
router.get('/diaries', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM diaries WHERE openid = ? ORDER BY create_time DESC',
      [req.user.openid]
    )
    ok(res, rows.map(rowToDiary))
  } catch (e) {
    fail(res, 500, e.message)
  }
})

// 根据 id 获取单条日记
router.get('/diaries/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM diaries WHERE id = ?', [req.params.id])
    if (!rows.length) return fail(res, 404, '日记不存在')
    ok(res, rowToDiary(rows[0]))
  } catch (e) {
    fail(res, 500, e.message)
  }
})

// 新增日记（通用）
router.post('/diaries', authMiddleware, async (req, res) => {
  try {
    const { title, content, weather, mood, date } = req.body || {}
    const item = {
      id: genId(),
      openid: req.user.openid,
      title: (title || '').trim(),
      content: (content || '').trim(),
      weather: weather || 'sunny',
      mood: mood || 'happy',
      date: date || formatDate(new Date()),
      createTime: Date.now()
    }
    await pool.query(
      'INSERT INTO diaries (id, openid, title, content, weather, mood, date, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [item.id, item.openid, item.title, item.content, item.weather, item.mood, item.date, item.createTime]
    )
    ok(res, item)
  } catch (e) {
    fail(res, 500, e.message)
  }
})

// 写日记（专门用于前端"写日记"页面存储数据）
// POST /api/diary/write
router.post('/diary/write', authMiddleware, async (req, res) => {
  try {
    const { title, content, weather, mood, date } = req.body || {}

    // 基础校验：至少要有内容或标题
    if (!title && !content) {
      return fail(res, 400, '日记标题或内容不能为空')
    }

    const item = {
      id: genId(),
      openid: req.user.openid,
      title: (title || '').trim(),
      content: (content || '').trim(),
      weather: weather || 'sunny',
      mood: mood || 'happy',
      date: date || formatDate(new Date()),
      createTime: Date.now()
    }
    await pool.query(
      'INSERT INTO diaries (id, openid, title, content, weather, mood, date, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [item.id, item.openid, item.title, item.content, item.weather, item.mood, item.date, item.createTime]
    )
    ok(res, item)
  } catch (e) {
    fail(res, 500, e.message)
  }
})

// 更新日记
router.put('/diaries/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM diaries WHERE id = ?', [req.params.id])
    if (!rows.length) return fail(res, 404, '日记不存在')
    const cur = rows[0]
    const { title, content, weather, mood, date } = req.body || {}
    const next = {
      title: title !== undefined ? (title || '').trim() : cur.title,
      content: content !== undefined ? (content || '').trim() : cur.content,
      weather: weather !== undefined ? weather : cur.weather,
      mood: mood !== undefined ? mood : cur.mood,
      date: date !== undefined ? date : cur.date
    }
    await pool.query(
      'UPDATE diaries SET title=?, content=?, weather=?, mood=?, date=? WHERE id=?',
      [next.title, next.content, next.weather, next.mood, next.date, req.params.id]
    )
    ok(res, { ...rowToDiary(cur), ...next })
  } catch (e) {
    fail(res, 500, e.message)
  }
})

// 删除日记
router.delete('/diaries/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM diaries WHERE id = ?', [req.params.id])
    if (!rows.length) return fail(res, 404, '日记不存在')
    await pool.query('DELETE FROM diaries WHERE id = ?', [req.params.id])
    ok(res, { id: req.params.id })
  } catch (e) {
    fail(res, 500, e.message)
  }
})

// 根据日期（YYYY-MM-DD）查询日记
router.get('/diaries/date/:date', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM diaries WHERE openid = ? AND date = ? ORDER BY create_time DESC',
      [req.user.openid, req.params.date]
    )
    ok(res, rows.map(rowToDiary))
  } catch (e) {
    fail(res, 500, e.message)
  }
})

// 清空当前用户全部日记
router.delete('/diaries', authMiddleware, async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM diaries WHERE openid = ?', [req.user.openid])
    ok(res, { count: r.affectedRows })
  } catch (e) {
    fail(res, 500, e.message)
  }
})

// ---------- 登录鉴权 ----------
// 从请求头 Authorization: Bearer <token> 解析当前用户，挂载到 req.user
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const user = token && (await auth.getUserByToken(token))
  if (!user) return fail(res, 401, '未登录或登录已失效')
  req.user = user
  next()
}

// 微信登录：用 login() 的 code 换 openid，返回 token
// POST /api/auth/login  { code }
router.post('/auth/login', async (req, res) => {
  const { code } = req.body || {}
  if (!code) return fail(res, 400, '缺少 code 参数')
  try {
    if (!auth.WX_APPID || !process.env.WX_SECRET) {
      // 未配置 secret 时，开发态可直接用 code 作为 openid 占位，便于联调
      const openid = 'dev_' + code
      const user = await auth.findOrCreateUser(openid)
      const token = await auth.issueToken(openid)
      return ok(res, { token, openid: user.openid, phone: user.phone })
    }
    const session = await auth.code2Session(code)
    if (!session.openid) {
      return fail(res, 401, '微信登录失败: ' + (session.errmsg || '无 openid') + ' (errcode=' + (session.errcode || '?') + ')')
    }
    const user = await auth.findOrCreateUser(session.openid)
    const token = await auth.issueToken(session.openid)
    ok(res, { token, openid: user.openid, phone: user.phone })
  } catch (err) {
    fail(res, 500, err.message || '微信登录异常')
  }
})

// 手机号一键登录：用 getPhoneNumber 的 code 换手机号并绑定
// POST /api/auth/phone-login  { loginCode, phoneCode }
router.post('/auth/phone-login', async (req, res) => {
  const { loginCode, phoneCode } = req.body || {}
  if (!loginCode || !phoneCode) {
    return fail(res, 400, '缺少 loginCode 或 phoneCode 参数')
  }
  try {
    if (!auth.WX_APPID || !process.env.WX_SECRET) {
      // 开发态占位：未配置 secret 时直接返回模拟手机号
      const openid = 'dev_' + loginCode
      const user = await auth.findOrCreateUser(openid)
      await auth.updateUserPhone(openid, '13800000000')
      const token = await auth.issueToken(openid)
      return ok(res, { token, openid: user.openid, phone: '13800000000' })
    }
    const [session, phoneInfo] = await Promise.all([
      auth.code2Session(loginCode),
      auth.getPhoneNumber(phoneCode)
    ])
    if (!session.openid) return fail(res, 401, session.errmsg || '微信登录失败')
    const user = await auth.findOrCreateUser(session.openid)
    const phone = (phoneInfo && phoneInfo.phoneNumber) || user.phone
    if (phone) await auth.updateUserPhone(session.openid, phone)
    const token = await auth.issueToken(session.openid)
    ok(res, { token, openid: user.openid, phone })
  } catch (err) {
    fail(res, 500, err.message || '手机号登录异常')
  }
})

// 获取当前登录用户信息
// GET /api/auth/me
router.get('/auth/me', authMiddleware, (req, res) => {
  ok(res, { openid: req.user.openid, phone: req.user.phone, nickname: req.user.nickname })
})

app.use('/api', router)

// 404 兜底
app.use((req, res) => fail(res, 404, '接口不存在'))

// 先初始化 MySQL 再启动 HTTP 服务
;(async () => {
  try {
    await initTables()
    app.listen(PORT, () => {
      console.log(`DIARY backend running at http://localhost:${PORT}`)
    })
  } catch (e) {
    console.error('启动失败:', e.message)
    process.exit(1)
  }
})()
