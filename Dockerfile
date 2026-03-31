# AI Agent Guard Dockerfile
FROM node:18-alpine

LABEL maintainer="ypeng1620"
LABEL description="AI Agent Guard - AI Agent 安全防护解决方案"

# 工作目录
WORKDIR /app

# 安装依赖
COPY package*.json ./
COPY integrator/package*.json ./integrator/
COPY subprojects/*/package*.json ./subprojects/

RUN npm install --production 2>/dev/null || true

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 18791

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:18791/health || exit 1

# 启动命令
ENV NODE_ENV=production
ENV PORT=18791
ENV HOST=0.0.0.0

CMD ["node", "api-server.js"]
