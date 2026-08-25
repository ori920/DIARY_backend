const https = require('https')
const db = require('./db')
// 每次使用都从 db.pool 取最新的连接池（initTables 完成后才就绪）
function getPool() {
  if (!db.pool) throw new Error('数据库连接池尚未初始化，请稍后重试')
  return db.pool
}

// ---------- 配置 ----------
// 微信小程序配置（请替换为你的真实 AppID / AppSecret）
// 也可通过环境变量注入：WX_APPID / WX_SECRET
const WX_APPID = process.env.WX_APPID || 'wx270ed1a0ce6e248b'
const WX_SECRET = process.env.WX_SECRET || ''

// ---------- 微信 HTTPS 请求封装（带超时 + 重试） ----------
// ECONNRESET 等瞬时网络故障，重试后通常能成功
function wxRequestOnce(apiPath, postData, method) {
  return new Promise((resolve, reject) => {
    const isPost = method === 'POST'
    const data = isPost ? JSON.stringify(postData) : ''
    const options = {
      hostname: 'api.weixin.qq.com',
      port: 443,
      path: apiPath,
      method,
      rejectUnauthorized: false,
      headers: isPost
        ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        : {}
    }
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error('微信接口返回解析失败: ' + body))
        }
      })
    })
    req.on('error', (err) => reject(err))
    // 5 秒超时，防止 hang 住
    req.setTimeout(5000, () => {
      req.destroy(new Error('timeout'))
    })
    if (isPost) req.write(data)
    req.end()
  })
}

async function wxRequest(apiPath, postData, method = 'POST') {
  const MAX_RETRY = 3
  let lastErr = null
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      console.log('[wxRequest] 第' + (i + 1) + '次尝试', method, 'api.weixin.qq.com' + apiPath.slice(0, 60))
      const res = await wxRequestOnce(apiPath, postData, method)
      return res
    } catch (e) {
      lastErr = e
      console.error('[wxRequest] 第' + (i + 1) + '次失败:', e.code || e.message)
      // 非最后一次时短暂等待再重试
      if (i < MAX_RETRY - 1) await new Promise(r => setTimeout(r, 500))
    }
  }
  throw lastErr
}

/** code2Session：用 login code 换 openid / session_key（GET 接口） */
function code2Session(jsCode) {
  const p = `/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${jsCode}&grant_type=authorization_code`
  return wxRequest(p, null, 'GET')
}

/** 获取 access_token（用于手机号解密接口） */
function getAccessToken() {
  const p = `/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`
  return wxRequest(p, {})
}

/** 用手机号 code 换手机号（新版 getPhoneNumber 接口） */
async function getPhoneNumber(phoneCode) {
  const tokenRes = await getAccessToken()
  if (!tokenRes.access_token) {
    throw new Error(tokenRes.errmsg || '获取 access_token 失败')
  }
  const res = await wxRequest(
    `/wapi/login/getuserphonenumber?access_token=${tokenRes.access_token}`,
    { code: phoneCode }
  )
  if (res.errcode) {
    throw new Error(res.errmsg || '获取手机号失败')
  }
  // res.phone_info: { phoneNumber, purePhoneNumber, countryCode, watermark }
  return res.phone_info
}

// ---------- 业务方法（MySQL 持久化） ----------

/** 根据 openid 查找或创建用户，返回用户对象 */
async function findOrCreateUser(openid) {
  const [rows] = await getPool().query('SELECT * FROM users WHERE openid = ?', [openid])
  if (rows.length) return rows[0]
  const user = { openid, phone: '', nickname: '', create_time: Date.now() }
  await getPool().query(
    'INSERT INTO users (openid, phone, nickname, create_time) VALUES (?, ?, ?, ?)',
    [user.openid, user.phone, user.nickname, user.create_time]
  )
  return user
}

/** 更新用户手机号 */
async function updateUserPhone(openid, phone) {
  await getPool().query('UPDATE users SET phone = ? WHERE openid = ?', [phone, openid])
}

/** 生成 token 并写入 tokens 表 */
async function issueToken(openid) {
  const token = 'tk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
  await getPool().query(
    'INSERT INTO tokens (token, openid, create_time) VALUES (?, ?, ?)',
    [token, openid, Date.now()]
  )
  return token
}

/** 根据 token 取用户 */
async function getUserByToken(token) {
  const [rows] = await getPool().query(
    `SELECT u.* FROM tokens t
     JOIN users u ON u.openid = t.openid
     WHERE t.token = ?`,
    [token]
  )
  return rows.length ? rows[0] : null
}

module.exports = {
  WX_APPID,
  code2Session,
  getPhoneNumber,
  findOrCreateUser,
  updateUserPhone,
  issueToken,
  getUserByToken
}
