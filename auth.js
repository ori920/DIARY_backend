const fs = require('fs')
const path = require('path')
const https = require('https')

// ---------- 配置 ----------
// 微信小程序配置（请替换为你的真实 AppID / AppSecret）
// 也可通过环境变量注入：WX_APPID / WX_SECRET
const WX_APPID = process.env.WX_APPID || 'wx270ed1a0ce6e248b'
const WX_SECRET = process.env.WX_SECRET || ''

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const USER_FILE = path.join(DATA_DIR, 'users.json')

// ---------- 用户与 Token 存储（文件持久化，生产可换数据库） ----------
function loadUsers() {
  try {
    if (!fs.existsSync(USER_FILE)) return {}
    const raw = fs.readFileSync(USER_FILE, 'utf-8')
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch (e) {
    console.error('loadUsers error', e)
    return {}
  }
}

function saveUsers(map) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(USER_FILE, JSON.stringify(map, null, 2), 'utf-8')
  } catch (e) {
    console.error('saveUsers error', e)
  }
}

/** openid -> user 映射 */
const usersByOpenid = loadUsers()
/** token -> openid 映射 */
const tokenMap = {}

function genToken() {
  return 'tk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
}

// ---------- 微信 HTTPS 请求封装 ----------
function wxRequest(apiPath, postData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(postData)
    const options = {
      hostname: 'api.weixin.qq.com',
      port: 443,
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error('微信接口返回解析失败'))
        }
      })
    })
    req.on('error', (err) => reject(err))
    req.write(data)
    req.end()
  })
}

/** code2Session：用 login code 换 openid / session_key */
function code2Session(jsCode) {
  const p = `/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${jsCode}&grant_type=authorization_code`
  return wxRequest(p, {})
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

// ---------- 业务方法 ----------
/** 根据 openid 查找或创建用户，返回用户对象 */
function findOrCreateUser(openid) {
  let user = usersByOpenid[openid]
  if (!user) {
    user = {
      openid,
      phone: '',
      nickname: '',
      createTime: Date.now()
    }
    usersByOpenid[openid] = user
    saveUsers(usersByOpenid)
  }
  return user
}

/** 生成 token 并绑定 openid */
function issueToken(openid) {
  const token = genToken()
  tokenMap[token] = openid
  return token
}

/** 根据 token 取用户 */
function getUserByToken(token) {
  const openid = tokenMap[token]
  if (!openid) return null
  return usersByOpenid[openid] || null
}

module.exports = {
  WX_APPID,
  code2Session,
  getPhoneNumber,
  findOrCreateUser,
  issueToken,
  getUserByToken
}
