# FinalScheduler 项目结构说明

## 📁 目录结构

```
FinalScheduler/
├── WebRoot/                    # Web应用根目录
│   ├── WEB-INF/               # Java Web配置（保留兼容性）
│   │   └── views/            # 前端页面视图
│   │       ├── index/        # 首页
│   │       ├── schedule/     # 排班管理页面
│   │       └── ...
│   ├── app/                   # 应用模块页面
│   │   ├── check/            # 考勤统计
│   │   ├── person/           # 人员管理
│   │   ├── personGroup/      # 人员分组
│   │   ├── planset/          # 班次设置
│   │   └── schedule/         # 排班管理
│   ├── public/                # 公共资源
│   │   ├── css/              # 样式文件
│   │   ├── js/               # JavaScript文件
│   │   ├── font-awesome/     # 图标库
│   │   ├── images/           # 图片资源
│   │   └── dwr/              # DWR库（保留兼容性）
│   └── favicon.ico            # 网站图标
│
├── data/                      # 数据存储目录
│   └── store.json            # JSON格式数据文件（替代数据库）
│
├── public/                    # Node.js静态资源目录
│   └── index.html            # 默认首页
│
├── node_modules/              # Node.js依赖包（不提交到git）
│
├── server.js                  # Node.js服务器主文件
├── package.json               # Node.js项目配置
├── package-lock.json          # 依赖锁定文件
│
├── .gitignore                 # Git忽略配置
├── .gitattributes             # Git属性配置
├── .editorconfig              # 编辑器配置
│
└── README_NODE.md             # 项目说明文档
```

## 🗑️ 已删除的文件/目录

以下文件和目录已删除，因为项目已从Java Web迁移到Node.js：

- ❌ `sql/` - SQL数据库脚本（不再使用MySQL）
- ❌ `src/` - Java后端源代码
- ❌ `res/` - Java后端资源配置
- ❌ `.classpath` - Eclipse项目配置
- ❌ `.project` - Eclipse项目配置
- ❌ `.mymetadata` - MyEclipse元数据
- ❌ `.settings/` - Eclipse设置
- ❌ `WebRoot/META-INF/` - Java Web元数据
- ❌ `WebRoot/datagrid_data1.json` - 示例数据

## 📦 技术栈

- **后端**: Node.js + Express
- **数据存储**: JSON文件（data/store.json）
- **前端**: jQuery + EasyUI + HTML/CSS/JavaScript
- **Excel处理**: xlsx库
- **开发工具**: VS Code

## 🚀 运行方式

```bash
# 安装依赖
npm install

# 启动服务器
node server.js

# 访问应用
http://localhost:8080
```

## 📝 数据存储说明

项目使用JSON文件替代传统数据库：
- 数据存储在 `data/store.json`
- 包含所有排班、人员、计划等数据
- 自动备份和加载
- 无需配置数据库

## 🔄 迁移说明

本项目已从Java Web（JFinal + MySQL）迁移到Node.js：
- 保留了前端页面结构
- 使用JSON替代MySQL数据库
- 使用Express替代JFinal框架
- 功能完全兼容，性能更优
