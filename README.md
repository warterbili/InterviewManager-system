<p align="center">
  <img src="images/interview_system.PNG" alt="面试管理系统" width="600"/>
</p>

<h1 align="center">面试管理系统 2.0<br/>Interview Management System 2.0</h1>

<p align="center">
  <strong>一站式管理您的求职面试流程，轻松跟踪邮件状态和投递进度<br/>
  One-stop management of your job interview process, easily track email status and delivery progress</strong>
</p>

<p align="center">
  <a href="#功能特性--features"><img src="https://img.shields.io/badge/功能-Features-blue" alt="功能特性"></a>
  <a href="#技术栈--tech-stack"><img src="https://img.shields.io/badge/技术栈-Tech%20Stack-green" alt="技术栈"></a>
  <a href="#快速开始--quick-start"><img src="https://img.shields.io/badge/快速开始-Quick%20Start-orange" alt="快速开始"></a>
  <a href="#版本更新--version-updates"><img src="https://img.shields.io/badge/版本-Version%202.0-blueviolet" alt="版本2.0"></a>
</p>

---

## 目录 / Table of Contents

- [功能特性 / Features](#功能特性--features)
- [技术栈 / Tech Stack](#技术栈--tech-stack)
- [快速开始 / Quick Start](#快速开始--quick-start)
  - [环境要求 / Requirements](#环境要求--requirements)
  - [安装步骤 / Installation](#安装步骤--installation)
  - [启动项目 / Running the Project](#启动项目--running-the-project)
- [系统配置 / Configuration](#系统配置--configuration)
  - [数据库配置 / Database Configuration](#数据库配置--database-configuration)
  - [邮箱配置 / Email Configuration](#邮箱配置--email-configuration)
- [项目结构 / Project Structure](#项目结构--project-structure)
- [依赖说明 / Dependencies](#依赖说明--dependencies)
- [版本更新 / Version Updates](#版本更新--version-updates)
- [License](#license)

---

## 功能特性 / Features

### 面试日程安排 / Interview Scheduling
- **管理面试日程**：记录公司、岗位、时间等信息
- **状态标记**：可标记准备状态和完成情况
- **面试提醒功能**：新增面试前提醒功能，确保不会错过重要面试

### 企业邮件跟踪 / Email Tracking
- **自动获取邮件**：通过IMAP协议自动抓取企业邮件
- **分类管理**：跟踪面试邀请、笔试通知、评测结果等
- **实时更新**：自动同步最新邮件状态
- **邮件内容搜索**：新增邮件内容全文搜索功能，快速定位关键信息

### 企业投递汇总 / Application Tracking
- **投递记录**：记录企业投递情况和时间
- **状态管理**：跟踪投递状态变化
- **数据统计**：汇总分析投递成功率
- **投递进度可视化**：新增图表展示功能，直观了解求职进度

### 系统配置 / System Configuration
- **灵活配置**：支持数据库和邮箱参数自定义
- **QQ邮箱支持**：专为QQ邮箱优化的IMAP集成
- **安全保障**：敏感信息加密存储
- **配置导入导出**：新增配置文件导入导出功能，方便备份和迁移

### 数据可视化 / Data Visualization
- **直观界面**：清晰展示面试、邮件和投递信息
- **搜索功能**：快速查找相关信息
- **数据统计图表**：新增多种数据可视化图表，包括面试通过率、投递成功率等统计

### 未来功能规划 / Future Features Planning
- **高级数据可视化分析**：计划增加更多维度的数据分析功能，包括薪资趋势分析、行业需求分析、地区分布统计等
- **动态爬虫自动投递简历**：计划开发智能爬虫功能，自动抓取招聘网站职位信息，并支持一键投递简历
- **AI面试助手**：计划集成人工智能技术，提供常见面试问题练习和智能问答反馈
- **多平台同步**：计划支持与其他求职平台数据同步，实现统一管理
- **智能推荐**：基于用户投递历史和面试结果，智能推荐合适的职位

---

## 技术栈 / Tech Stack

### 后端技术 / Backend
- **Node.js** + **Express.js** - Web应用框架
- **MySQL** - 关系型数据库

### 前端技术 / Frontend
- **HTML5**/**CSS3**/**JavaScript** - 原生前端技术
- **AJAX** - 异步数据交互

### 邮件处理 / Email Processing
- **Python** + **IMAPClient** - 邮件协议处理
- **PyMySQL** - Python MySQL数据库驱动

### 部署方式 / Deployment
- **本地运行** - 适用于个人使用的本地部署

---

## 快速开始 / Quick Start

### 环境要求 / Requirements

- **Node.js** (版本 14 或更高 / Version 14 or higher)
- **Python 3.x**
- **MySQL数据库** / **MySQL Database**

### 安装步骤 / Installation

1. **克隆项目** / **Clone the repository**
   ```bash
   git clone <repository-url>
   cd 面试管理系统
   ```

2. **安装Node.js依赖** / **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **安装Python依赖** / **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

### 启动项目 / Running the Project

#### 方法一：使用启动脚本（推荐） / Method 1: Using startup script (Recommended)

双击运行项目根目录下的 `start_fast.bat` 文件，该脚本会：
- 在后台启动服务器（端口3001）
- 打开浏览器访问加载页面
- 实时检测服务器状态
- 服务器准备就绪后立即跳转到主页
- 不显示任何命令窗口（完全静默运行）
- 当服务器关闭时自动退出

#### 方法二：手动启动 / Method 2: Manual startup

1. **启动服务器** / **Start the server**
   ```bash
   node src/server.js
   ```

2. **访问应用** / **Access the application**
   打开浏览器访问：http://localhost:3001/loading

---

## 系统配置 / Configuration

首次使用或需要修改配置时：
1. 系统会自动跳转到配置页面
2. 或者在主页点击"修改系统配置"按钮
3. 输入数据库和邮箱配置信息
4. 点击保存，系统将自动跳转回主页

### 数据库配置 / Database Configuration

系统需要MySQL数据库支持，配置时需要提供：
- 数据库主机地址（如：localhost）
- 数据库用户名
- 数据库密码

系统会自动创建所需的数据库和表结构：
- `interview_schedule`：面试日程数据库
- `job_emails`：企业邮件数据库
- `job_deliveries`：投递记录数据库

### 邮箱配置 / Email Configuration

系统支持QQ邮箱，需要：
- 邮箱地址
- IMAP授权码（不是邮箱密码）
- IMAP服务器地址（默认为imap.qq.com）

**QQ邮箱配置步骤**：
1. 登录QQ邮箱网页版
2. 进入"设置" → "账户"
3. 找到"POP3/SMTP服务"和"IMAP/SMTP服务"
4. 开启IMAP/SMTP服务
5. 按照提示发送短信获取授权码
6. 在本系统中使用该授权码作为密码

---

## 项目结构 / Project Structure

```
面试管理系统/
├── src/                 # 后端代码 / Backend code
│   ├── server.js        # 主服务器文件 / Main server file
│   └── config.js        # 配置管理 / Configuration management
├── public/              # 前端静态文件 / Frontend static files
│   ├── index.html       # 主页 / Home page
│   ├── schedule.html    # 面试日程页面 / Interview schedule page
│   ├── emails.html      # 邮件跟踪页面 / Email tracking page
│   ├── deliveries.html  # 投递汇总页面 / Delivery summary page
│   ├── config.html      # 系统配置页面 / System configuration page
│   ├── loading.html     # 加载页面 / Loading page
│   └── common.css       # 公共样式 / Common styles
├── script/              # Python脚本 / Python scripts
│   ├── qq_email_imap.py # 邮件获取脚本 / Email fetching script
│   └── get_email_body_by_id.py # 邮件正文获取脚本 / Email body fetching script
├── config.json          # 系统配置文件 / System configuration file
├── log.txt              # 系统日志文件 / System log file
├── start_fast.bat       # 启动脚本 / Startup script
├── requirements.txt     # Python依赖配置 / Python dependencies
├── package.json         # Node.js依赖配置 / Node.js dependencies
├── package-lock.json    # Node.js依赖锁定文件 / Node.js dependency lock file
├── .gitignore           # Git忽略文件 / Git ignore file
├── LICENSE              # 开源许可证 / Open source license
└── README.md            # 项目说明文件 / Project documentation
```

---

## 依赖说明 / Dependencies

### Node.js依赖 / Node.js Dependencies
- `express`：Web应用框架 / Web application framework
- `mysql2`：MySQL数据库驱动 / MySQL database driver

### Python依赖 / Python Dependencies
- `imapclient`：IMAP邮件客户端 / IMAP email client
- `pymysql`：Python MySQL数据库驱动 / Python MySQL database driver

---

## License

本项目采用MIT许可证，详情请见[LICENSE](LICENSE)文件。

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.