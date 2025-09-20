# 面试管理系统

一站式管理您的求职面试流程，轻松跟踪邮件状态和投递进度。

## 功能特性

- **面试日程安排**：管理您的面试日程，包括公司、岗位、时间等信息，可标记准备状态和完成情况
- **企业邮件跟踪**：自动获取并跟踪企业发送的各类邮件，包括面试邀请、笔试通知、评测结果等
- **企业投递汇总**：记录和管理您的企业投递情况，包括投递时间、状态等信息
- **系统配置**：灵活配置数据库和邮箱连接参数，支持QQ邮箱
- **数据可视化**：直观的界面展示面试、邮件和投递信息

## 快速开始

### 环境要求

- Node.js (版本 14 或更高)
- Python 3.x
- MySQL数据库

### 安装步骤

1. 克隆或下载本项目到本地
2. 在项目根目录打开终端，运行以下命令安装Node.js依赖：
   ```
   npm install
   ```
3. 安装Python依赖：
   ```
   pip install -r requirements.txt
   ```

### 启动项目

#### 方法一：使用启动脚本（推荐）

双击运行项目根目录下的 `start_fast.bat` 文件，该脚本会：
- 在后台启动服务器（端口3001）
- 打开浏览器访问加载页面
- 实时检测服务器状态
- 服务器准备就绪后立即跳转到主页
- 不显示任何命令窗口（完全静默运行）
- 当服务器关闭时自动退出

#### 方法二：手动启动

1. 在项目根目录打开终端，运行：
   ```
   node src/server.js
   ```
2. 打开浏览器访问：http://localhost:3001/loading

### 退出系统

在主页点击"退出系统"按钮，系统将：
- 关闭后端服务器
- 关闭前端浏览器窗口
- 退出整个程序

## 系统配置

首次使用或需要修改配置时：
1. 系统会自动跳转到配置页面
2. 或者在主页点击"修改系统配置"按钮
3. 输入数据库和邮箱配置信息
4. 点击保存，系统将自动跳转回主页

### 数据库配置

系统需要MySQL数据库支持，配置时需要提供：
- 数据库主机地址（如：localhost）
- 数据库用户名
- 数据库密码

系统会自动创建所需的数据库和表结构：
- `interview_schedule`：面试日程数据库
- `job_emails`：企业邮件数据库
- `job_deliveries`：投递记录数据库

### 邮箱配置

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

## 项目结构

```
面试管理系统/
├── src/                 # 后端代码
│   ├── server.js        # 主服务器文件
│   └── config.js        # 配置管理
├── public/              # 前端静态文件
│   ├── index.html       # 主页
│   ├── schedule.html    # 面试日程页面
│   ├── emails.html      # 邮件跟踪页面
│   ├── deliveries.html  # 投递汇总页面
│   ├── config.html      # 系统配置页面
│   ├── loading.html     # 加载页面
│   └── common.css       # 公共样式
├── script/              # Python脚本
│   ├── qq_email_imap.py # 邮件获取脚本
│   └── get_email_body_by_id.py # 邮件正文获取脚本
├── config.json          # 系统配置文件
├── start_fast.bat       # 启动脚本
├── requirements.txt     # Python依赖配置
├── package.json         # Node.js依赖配置
├── package-lock.json    # Node.js依赖锁定文件
├── .gitignore           # Git忽略文件
├── LICENSE              # 开源许可证
└── README.md            # 项目说明文件
```

## 技术栈

- **后端**：Node.js + Express.js
- **前端**：原生HTML/CSS/JavaScript
- **数据库**：MySQL
- **邮件处理**：Python + IMAPClient
- **部署**：本地运行

## 依赖说明

### Node.js依赖
- `express`：Web应用框架
- `mysql2`：MySQL数据库驱动

### Python依赖
- `imapclient`：IMAP邮件客户端
- `pymysql`：Python MySQL数据库驱动

## 开源协议

本项目采用MIT许可证，详情请见[LICENSE](LICENSE)文件。