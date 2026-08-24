# 微信云托管 Dockerfile —— DIARY_backend
FROM node:18-alpine

WORKDIR /app

# 先装依赖（利用层缓存）
COPY package*.json ./
RUN npm install --production

# 复制源码
COPY . .

# 云托管会注入 PORT 环境变量，index.js 已兼容 process.env.PORT || 3000
EXPOSE 3000

CMD ["node", "index.js"]
