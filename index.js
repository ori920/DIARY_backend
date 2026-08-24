const express = require('express')
const fs = require('fs')
const path = require('path')

const auth = require('./auth')

const app = express()
const PORT = process.env.PORT || 3000

// 解析 JSON 请求体
app.use(express.json())

// ---------- 文件持久化存储 ----------
// 云托管可挂载 CFS/云存储到 DATA_DIR（如 /data），默认回退到本地 ./data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'diaries.json')

/** 读取全部日记（从文件加载） */
function loadDiaries() {
  try {
    if (!fs.existsSync(DATA_FILE)) return []
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    console.error('loadDiaries error', e)
    return []
  }
}

/** 写入全部日记到文件 */
function saveDiaries(list) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('saveDiaries error', e)
    return false
  }
}

// 启动时从文件载入内存，便于查询/更新
/** @type {Array<{id:string,title:string,content:string,weather:string,mood:string,date:string,createTime:number}>} */
let diaryList = loadDiaries()

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

// ---------- 路由 ----------
const router = express.Router()

// 健康检查
router.get('/health', (req, res) => ok(res, { status: 'ok', time: Date.now() }))

// 获取全部日记（按创建时间倒序）
router.get('/diaries', (req, res) => {
  const list = diaryList.slice().sort(
    (a, b) => (b.createTime || 0) - (a.createTime || 0)
  )
  ok(res, list)
})

// 根据 id 获取单条日记
router.get('/diaries/:id', (req, res) => {
  const item = diaryList.find(it => it.id === req.params.id)
  if (!item) return fail(res, 404, '日记不存在')
  ok(res, item)
})

// 新增日记（通用）
router.post('/diaries', (req, res) => {
  const { title, content, weather, mood, date } = req.body || {}
  const item = {
    id: genId(),
    title: (title || '').trim(),
    content: (content || '').trim(),
    weather: weather || 'sunny',
    mood: mood || 'happy',
    date: date || formatDate(new Date()),
    createTime: Date.now()
  }
  diaryList.push(item)
  saveDiaries(diaryList)
  ok(res, item)
})

// 写日记（专门用于前端"写日记"页面存储数据）
// POST /api/diary/write
router.post('/diary/write', (req, res) => {
  const { title, content, weather, mood, date } = req.body || {}

  // 基础校验：至少要有内容或标题
  if (!title && !content) {
    return fail(res, 400, '日记标题或内容不能为空')
  }

  const item = {
    id: genId(),
    title: (title || '').trim(),
    content: (content || '').trim(),
    weather: weather || 'sunny',
    mood: mood || 'happy',
    date: date || formatDate(new Date()),
    createTime: Date.now()
  }
  diaryList.push(item)
  saveDiaries(diaryList)
  ok(res, item)
})

// 更新日记
router.put('/diaries/:id', (req, res) => {
  const item = diaryList.find(it => it.id === req.params.id)
  if (!item) return fail(res, 404, '日记不存在')
  const { title, content, weather, mood, date } = req.body || {}
  if (title !== undefined) item.title = (title || '').trim()
  if (content !== undefined) item.content = (content || '').trim()
  if (weather !== undefined) item.weather = weather
  if (mood !== undefined) item.mood = mood
  if (date !== undefined) item.date = date
  saveDiaries(diaryList)
  ok(res, item)
})

// 删除日记
router.delete('/diaries/:id', (req, res) => {
  const idx = diaryList.findIndex(it => it.id === req.params.id)
  if (idx < 0) return fail(res, 404, '日记不存在')
  diaryList.splice(idx, 1)
  saveDiaries(diaryList)
  ok(res, { id: req.params.id })
})

// 根据日期（YYYY-MM-DD）查询日记
router.get('/diaries/date/:date', (req, res) => {
  const list = diaryList.filter(it => it.date === req.params.date)
  ok(res, list)
})

// 清空全部日记
router.delete('/diaries', (req, res) => {
  diaryList = []
  saveDiaries(diaryList)
  ok(res, { count: 0 })
})

// ---------- 登录鉴权 ----------
// 从请求头 Authorization: Bearer <token> 解析当前用户，挂载到 req.user
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const user = token && auth.getUserByToken(token)
  if (!user) return fail(res, 401, '未登录或登录已失效')
  req.user = user
  next()
}

// 微信登录：用 login() 的 code 换 openid，返回 token
// POST /api/auth/login  { code }
router.post('/auth/login', (req, res) => {
  const { code } = req.body || {}
  if (!code) return fail(res, 400, '缺少 code 参数')
  if (!auth.WX_APPID || !process.env.WX_SECRET) {
    // 未配置 secret 时，开发态可直接用 code 作为 openid 占位，便于联调
    const openid = 'dev_' + code
    const user = auth.findOrCreateUser(openid)
    const token = auth.issueToken(openid)
    return ok(res, { token, openid: user.openid, phone: user.phone })
  }
  auth.code2Session(code)
    .then((session) => {
      if (!session.openid) {
        return fail(res, 401, session.errmsg || '微信登录失败')
      }
      const user = auth.findOrCreateUser(session.openid)
      const token = auth.issueToken(session.openid)
      ok(res, { token, openid: user.openid, phone: user.phone })
    })
    .catch((err) => fail(res, 500, err.message || '微信登录异常'))
})

// 手机号一键登录：用 getPhoneNumber 的 code 换手机号并绑定
// POST /api/auth/phone-login  { loginCode, phoneCode }
router.post('/auth/phone-login', (req, res) => {
  const { loginCode, phoneCode } = req.body || {}
  if (!loginCode || !phoneCode) {
    return fail(res, 400, '缺少 loginCode 或 phoneCode 参数')
  }
  if (!auth.WX_APPID || !process.env.WX_SECRET) {
    // 开发态占位：未配置 secret 时直接返回模拟手机号
    const openid = 'dev_' + loginCode
    const user = auth.findOrCreateUser(openid)
    user.phone = '13800000000'
    const token = auth.issueToken(openid)
    return ok(res, { token, openid: user.openid, phone: user.phone })
  }
  Promise.all([auth.code2Session(loginCode), auth.getPhoneNumber(phoneCode)])
    .then(([session, phoneInfo]) => {
      if (!session.openid) return fail(res, 401, session.errmsg || '微信登录失败')
      const user = auth.findOrCreateUser(session.openid)
      user.phone = (phoneInfo && phoneInfo.phoneNumber) || user.phone
      const token = auth.issueToken(session.openid)
      ok(res, { token, openid: user.openid, phone: user.phone })
    })
    .catch((err) => fail(res, 500, err.message || '手机号登录异常'))
})

// 获取当前登录用户信息
// GET /api/auth/me
router.get('/auth/me', authMiddleware, (req, res) => {
  ok(res, { openid: req.user.openid, phone: req.user.phone, nickname: req.user.nickname })
})

app.use('/api', router)

// 404 兜底
app.use((req, res) => fail(res, 404, '接口不存在'))

app.listen(PORT, () => {
  console.log(`DIARY backend running at http://localhost:${PORT}`)
})
