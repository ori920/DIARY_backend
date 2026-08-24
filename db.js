const mysql = require('mysql2/promise')

// ---------- 配置（通过环境变量注入，云托管控制台配置） ----------
const DB_HOST = process.env.DB_HOST
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''
const DB_NAME = process.env.DB_NAME || 'diary'

if (!DB_HOST) {
  console.error('缺少环境变量 DB_HOST，请到云托管控制台「环境变量」中配置')
}

// 关键：强制 IPv4，避免 Node 把 localhost 解析成 ::1 (IPv6) 导致 ECONNREFUSED
const POOL_OPTS = {
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  waitForConnections: true,
  charset: 'utf8mb4',
  family: 4
}

let pool

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
  pool = mysql.createPool({
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

module.exports = { pool, initTables }
