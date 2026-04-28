# 排班系统优化版

## 项目概述
基于Java Web的智能排班管理系统，实现人员调度自动化、任务分配优化和实时监控功能。采用模块化架构设计，包含核心业务逻辑、前端界面和配置管理模块。

## 技术栈
- **后端**: Java 8+ (Servlet/JSP)
- **前端**: EasyUI 1.5.5 + jQuery 3.6
- **构建工具**: Maven 3.6+
- **服务器**: Apache Tomcat 9.x

## 目录结构
```
/. 
├── WebRoot/              # Web资源目录
│   ├── WEB-INF/          # 私有资源
│   │   ├── classes/      # 配置/工具类
│   │   └── web.xml       # 项目配置
│   └── public/           # 公共资源
│       └── js/           # 前端模块
│           └── modules/  # EasyUI组件
│
├── config/               # 系统配置
│   └── system.properties # 系统参数
│
├── docs/                 # 开发文档
│   ├── architecture.md   # 系统架构
│   └── api.md            # 接口文档
│
└── README.md             # 当前文档
```

## 启动方式
1. **后端部署**
   ```bash
   # 安装依赖
   mvn clean install

   # 启动Tomcat
   cd /path/to/tomcat/bin
   ./startup.sh
   ```

2. **前端运行 (可选)**
   ```bash
   # 安装Node.js依赖
   npm install

   # 启动开发服务器
   npm start
   ```

## 核心功能
- 智能排班算法
- 实时数据可视化
- 多角色权限管理
- 异常预警系统

## 贡献指南
1. Fork项目
2. 创建feature分支
3. 提交PR
4. 遵循Code of Conduct
```