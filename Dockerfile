# 使用 Node.js 20 的轻量版本，避开 22 版本的问题
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 只复制依赖文件，利用 Docker 缓存
COPY package*.json ./

# 安装依赖，使用官方源并忽略自动脚本
RUN npm install --production --ignore-scripts

# 复制所有项目文件
COPY . .

# 暴露端口 3000
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]