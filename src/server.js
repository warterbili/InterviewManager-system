const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
require('dotenv').config();
const app = express();
const PORT = 3001;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 添加CORS头部以允许跨域请求
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 数据库配置
const dbConfigs = {
  interview: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123123',
    database: 'interview_schedule',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  email: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123123',
    database: 'job_emails',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  delivery: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123123',
    database: 'job_deliveries',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }
};

let interviewDb, emailDb, deliveryDb, configManager;

// 初始化数据库连接
async function initDatabase() {
  try {
    // 创建数据库（如果不存在）
    const rootConnection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123123'
    });
    
    // 创建所有需要的数据库
    await rootConnection.query('CREATE DATABASE IF NOT EXISTS interview_schedule');
    await rootConnection.query('CREATE DATABASE IF NOT EXISTS job_emails');
    await rootConnection.query('CREATE DATABASE IF NOT EXISTS job_deliveries');
    await rootConnection.end();
    
    // 创建面试日程数据库连接
    interviewDb = mysql.createPool(dbConfigs.interview);
    
    // 创建表（如果不存在）
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS interviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company VARCHAR(255) NOT NULL,
        position VARCHAR(255) NOT NULL,
        datetime DATETIME,
        preparation BOOLEAN DEFAULT FALSE,
        completion BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await interviewDb.query(createTableQuery);
    
    // 检查表是否为空，如果为空则插入默认数据
    const [interviewRows] = await interviewDb.query('SELECT COUNT(*) as count FROM interviews');
    if (interviewRows[0].count === 0) {
      const defaultData = [
        ["腾讯", "前端开发", new Date("2025-09-20T09:00"), true, false],
        ["阿里巴巴", "Java开发", new Date("2025-09-22T14:00"), true, false],
        ["字节跳动", "产品经理", new Date("2025-09-25T10:30"), false, false],
        ["京东", "销售", new Date("2025-09-28T15:00"), false, false]
      ];
      
      const insertQuery = 'INSERT INTO interviews (company, position, datetime, preparation, completion) VALUES ?';
      await interviewDb.query(insertQuery, [defaultData]);
    }
    
    // 创建邮件状态数据库连接
    emailDb = mysql.createPool(dbConfigs.email);
    
    // 确保邮件数据库中的表结构正确
    // 创建统一的邮件表
    await emailDb.query(`
      CREATE TABLE IF NOT EXISTS \`all_emails\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        imap_id VARCHAR(255),
        subject TEXT,
        sender TEXT,
        recipient TEXT,
        send_date TEXT,
        body LONGTEXT,
        UNIQUE KEY unique_email (imap_id, subject(50), sender(50), send_date(50))
      )
    `);
    
    // 创建投递汇总数据库连接
    deliveryDb = mysql.createPool(dbConfigs.delivery);
    
    // 创建投递汇总表（如果不存在）
    const createDeliveryTableQuery = `
      CREATE TABLE IF NOT EXISTS deliveries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        delivery_date DATETIME NOT NULL,
        status VARCHAR(100) NOT NULL,
        UNIQUE KEY unique_delivery (company_name, delivery_date, status)
      )
    `;
    
    await deliveryDb.query(createDeliveryTableQuery);
    
    console.log('Databases initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// 获取所有面试信息
app.get('/api/interviews', async (req, res) => {
  try {
    const [rows] = await interviewDb.query('SELECT * FROM interviews ORDER BY datetime');
    // 将datetime转换为正确的格式
    const data = rows.map(row => ({
      company: row.company,
      position: row.position,
      datetime: row.datetime ? row.datetime.toISOString().slice(0, 16) : null, // 转换为 YYYY-MM-DDTHH:mm 格式
      preparation: row.preparation,
      completion: row.completion
    }));
    res.json(data);
  } catch (err) {
    console.error('Error fetching interview data:', err);
    res.status(500).json({ error: 'Failed to fetch interview data' });
  }
});

// 保存所有面试信息
app.post('/api/interviews', async (req, res) => {
  try {
    const data = req.body;
    
    // 先清空表数据
    await interviewDb.query('DELETE FROM interviews');
    
    // 批量插入新数据
    if (data.length > 0) {
      const values = data.map(item => [
        item.company,
        item.position,
        item.datetime ? new Date(item.datetime) : null,
        item.preparation,
        item.completion
      ]);
      
      const insertQuery = 'INSERT INTO interviews (company, position, datetime, preparation, completion) VALUES ?';
      await interviewDb.query(insertQuery, [values]);
    }
    
    res.json({ message: 'Interview data saved successfully' });
  } catch (err) {
    console.error('Error saving interview data:', err);
    res.status(500).json({ error: 'Failed to save interview data' });
  }
});

// 获取所有邮件信息
app.get('/api/emails', async (req, res) => {
  try {
    // 从统一的邮件表中获取数据
    const [rows] = await emailDb.query('SELECT * FROM all_emails ORDER BY send_date DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching email data:', err);
    res.status(500).json({ error: 'Failed to fetch email data' });
  }
});

// 搜索邮件信息
app.get('/api/emails/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword) {
      // 如果没有提供关键词，返回所有邮件
      const [rows] = await emailDb.query('SELECT * FROM all_emails ORDER BY send_date DESC');
      res.json(rows);
    } else {
      // 根据关键词搜索邮件（在主题和正文中搜索）
      const [rows] = await emailDb.query(
        'SELECT * FROM all_emails WHERE subject LIKE ? OR body LIKE ? ORDER BY send_date DESC',
        [`%${keyword}%`, `%${keyword}%`]
      );
      res.json(rows);
    }
  } catch (err) {
    console.error('Error searching email data:', err);
    res.status(500).json({ error: 'Failed to search email data' });
  }
});

// 删除邮件
app.delete('/api/emails/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证ID是否为数字
    if (!/^[0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid email ID' });
    }
    
    // 删除邮件（从统一表中删除）
    const [result] = await emailDb.query('DELETE FROM all_emails WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    res.json({ message: 'Email deleted successfully' });
  } catch (err) {
    console.error('Error deleting email:', err);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// 获取所有投递信息
app.get('/api/deliveries', async (req, res) => {
  try {
    const [rows] = await deliveryDb.query('SELECT * FROM deliveries ORDER BY delivery_date DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching delivery data:', err);
    res.status(500).json({ error: 'Failed to fetch delivery data' });
  }
});

// 添加新的投递信息
app.post('/api/deliveries', async (req, res) => {
  try {
    const { company_name, delivery_date, status } = req.body;
    
    // 验证必填字段
    if (!company_name || !delivery_date || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // 插入新记录
    const [result] = await deliveryDb.query(
      'INSERT INTO deliveries (company_name, delivery_date, status) VALUES (?, ?, ?)',
      [company_name, delivery_date, status]
    );
    
    res.json({ 
      message: 'Delivery record added successfully',
      id: result.insertId
    });
  } catch (err) {
    console.error('Error adding delivery record:', err);
    // 检查是否是重复记录错误
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Duplicate delivery record' });
    }
    res.status(500).json({ error: 'Failed to add delivery record' });
  }
});

// 更新投递信息
app.put('/api/deliveries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name, delivery_date, status } = req.body;
    
    // 验证ID是否为数字
    if (!/^[0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid delivery ID' });
    }
    
    // 验证必填字段
    if (!company_name || !delivery_date || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // 更新记录
    const [result] = await deliveryDb.query(
      'UPDATE deliveries SET company_name = ?, delivery_date = ?, status = ? WHERE id = ?',
      [company_name, delivery_date, status, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Delivery record not found' });
    }
    
    res.json({ message: 'Delivery record updated successfully' });
  } catch (err) {
    console.error('Error updating delivery record:', err);
    // 检查是否是重复记录错误
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Duplicate delivery record' });
    }
    res.status(500).json({ error: 'Failed to update delivery record' });
  }
});

// 删除投递信息
app.delete('/api/deliveries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证ID是否为数字
    if (!/^[0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid delivery ID' });
    }
    
    // 删除记录
    const [result] = await deliveryDb.query('DELETE FROM deliveries WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Delivery record not found' });
    }
    
    res.json({ message: 'Delivery record deleted successfully' });
  } catch (err) {
    console.error('Error deleting delivery record:', err);
    res.status(500).json({ error: 'Failed to delete delivery record' });
  }
});

// 根路径返回主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 面试日程页面
app.get('/schedule', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'schedule.html'));
});

// 邮件状态页面
app.get('/emails', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'emails.html'));
});

// 投递汇总页面
app.get('/deliveries', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'deliveries.html'));
});

// 触发邮件获取功能
app.post('/api/fetch-emails', async (req, res) => {
  try {
    // 使用环境变量或默认配置
    const email = process.env.EMAIL_ADDRESS || '1608157098@qq.com';
    const password = process.env.EMAIL_PASSWORD || 'dduplvjlpgqjgjjh';
    const imap_server = process.env.IMAP_SERVER || 'imap.qq.com';
    
    // 获取请求中的日期范围参数
    const { startDate, endDate } = req.body || {};
    
    // 构建Python脚本参数
    const pythonPath = 'python'; // 根据你的环境可能需要调整
    const scriptPath = path.join(__dirname, '..', 'script', 'qq_email_imap.py');
    
    // 准备参数，包括用户邮箱和授权码
    let args = [scriptPath, email, password, imap_server];
    if (startDate && endDate) {
      args = [scriptPath, email, password, imap_server, startDate, endDate];
    }
    
    console.log(`正在执行邮件获取脚本: ${scriptPath}`, args);
    
    const pythonProcess = spawn(pythonPath, args, {
      cwd: __dirname
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.error(`邮件获取脚本错误: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // 从输出中提取新增邮件数量
        let insertedCount = 0;
        const insertedMatch = stdoutData.match(/新增\s+(\d+)\s+封邮件/);
        if (insertedMatch) {
          insertedCount = parseInt(insertedMatch[1]);
        }
        
        res.json({ 
          success: true, 
          message: `邮件获取完成，新增 ${insertedCount} 封邮件`, 
          insertedCount: insertedCount
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: '邮件获取失败', 
          error: stderrData 
        });
      }
    });
    
    pythonProcess.on('error', (error) => {
      console.error('执行邮件获取脚本时出错:', error);
      res.status(500).json({ 
        success: false, 
        message: '无法启动邮件获取脚本', 
        error: error.message 
      });
    });
  } catch (err) {
    console.error('Error fetching emails:', err);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// 根据IMAP ID实时获取邮件正文
app.get('/api/emails/:id/body/realtime', async (req, res) => {
  try {
    // 使用环境变量或默认配置
    const email = process.env.EMAIL_ADDRESS || '1608157098@qq.com';
    const password = process.env.EMAIL_PASSWORD || 'dduplvjlpgqjgjjh';
    const imap_server = process.env.IMAP_SERVER || 'imap.qq.com';
    
    const { id } = req.params;
    
    // 验证ID是否为数字
    if (!/^[0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid email ID' });
    }
    
    // 获取邮件的IMAP ID
    const [rows] = await emailDb.query('SELECT imap_id FROM all_emails WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    const imapId = rows[0].imap_id;
    if (!imapId) {
      return res.status(404).json({ error: 'IMAP ID not found for this email' });
    }
    
    // 使用spawn执行Python脚本获取实时邮件正文
    const pythonPath = 'python'; // 根据你的环境可能需要调整
    const scriptPath = path.join(__dirname, '..', 'script', 'get_email_body_by_id.py');
    
    const pythonProcess = spawn(pythonPath, [scriptPath, imapId, email, password, imap_server], {
      cwd: __dirname,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.error(`获取邮件正文脚本错误: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        res.json({ body: stdoutData });
      } else {
        console.error(`获取邮件正文脚本执行失败，退出码: ${code}`, stderrData);
        res.status(500).json({ 
          error: 'Failed to fetch email body from server', 
          details: stderrData 
        });
      }
    });
    
    pythonProcess.on('error', (error) => {
      console.error('执行获取邮件正文脚本时出错:', error);
      res.status(500).json({ 
        error: '无法启动获取邮件正文脚本', 
        details: error.message 
      });
    });
  } catch (err) {
    console.error('Error fetching email body:', err);
    res.status(500).json({ error: 'Failed to fetch email body' });
  }
});

// 触发邮件获取功能

// 配置管理页面
app.get('/config', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'config.html'));
});

// 初始化数据库并启动服务器
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
});



