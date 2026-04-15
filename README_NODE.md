# FinalScheduler Node.js Conversion

This workspace now includes a Node.js server that can serve the existing frontend assets and provides a Node.js backend for the original MySQL-backed API.

## 运行步骤

1. 安装 Node.js（建议 Node 14+）
2. 在项目根目录运行：
   ```bash
   npm install
   ```
3. 启动服务：
   ```bash
   npm start
   ```
4. 打开浏览器访问：
   ```text
   http://localhost:8000/FinalScheduler/
   ```

## 说明

- `server.js` 是新的 Node.js 应用入口
- 静态资源由 `WebRoot/` 下原有文件提供
- 数据持久化由 `data/store.json` 提供，无需 MySQL 数据库
- 常用 REST 接口已按照原 Java 控制器路由实现

## 数据存储

- `data/store.json` 保存项目数据，可直接编辑或通过前端界面添加/修改
- 如果 `data/store.json` 不存在，服务启动时会自动创建默认数据文件

## 限制

- 当前模板渲染采用简单包含和变量替换机制
- 部分旧 Freemarker 模板语法（例如复杂宏、循环、条件嵌套）可能需要进一步转换
- 如果出现模板显示问题，可手动将对应 HTML 视图改写为纯前端渲染格式
