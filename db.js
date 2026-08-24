const mysql = require('mysql2/promise')

// ---------- 配置（环境变量优先，缺失时使用兜底） ----------
// 兜底值直接对应云托管「生产环境」的 MySQL 实例，
// 解决「环境变量没注入容器导致 ECONNREFUSED ::1」的死循环
const DB_HOST = process.env.DB_HOST || '10.19.105.170'
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || 'NNKs2Sju'
const DB_NAME = process.env.DB_NAME || 'diary'

const POOL_OPTS = {
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  waitForConnections: true,
  charset: 'utf8mb4'
}

// 用对象包装 pool，后续 initTables 里对它赋值。
// 这样外部 require('./db').pool 始终能取到最新的连接池，
// 避免「解构时 pool 还是 undefined」的时序问题。
const dbExports = { pool: null }

// ---------- 自动建库 + 建表 ----------
async function initTables() {
  // 1. 先连上 MySQL（不指定数据库），确保目标库存在
  const tmpPool = mysql.createPool({
    ...POOL_OPTS,
    connectionLimit: 2
  })
  try {
    await tmpPool.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  } catch (e) {
    console.error('创建数据库失败:', e.message)
    throw e
  } finally {
    await tmpPool.end()
  }

  // 2. 创建指定数据库的连接池
  dbExports.pool = mysql.createPool({
    ...POOL_OPTS,
    database: DB_NAME,
    connectionLimit: 10
  })

  // 3. 自动建表
  // 用户表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      openid VARCHAR(64) PRIMARY KEY,
      phone VARCHAR(32) DEFAULT '',
      nickname VARCHAR(128) DEFAULT '',
      create_time BIGINT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // 日记表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS diaries (
      id VARCHAR(64) PRIMARY KEY,
      openid VARCHAR(64) NOT NULL DEFAULT '',
      title VARCHAR(255) DEFAULT '',
      content TEXT,
      weather VARCHAR(32) DEFAULT 'sunny',
      mood VARCHAR(32) DEFAULT 'happy',
      date VARCHAR(32) DEFAULT '',
      create_time BIGINT DEFAULT 0,
      INDEX idx_openid (openid),
      INDEX idx_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // token 表（token -> openid）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      token VARCHAR(64) PRIMARY KEY,
      openid VARCHAR(64) NOT NULL,
      create_time BIGINT DEFAULT 0,
      INDEX idx_openid (openid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

module.exports = dbExports
