import express from 'express';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import { config, loadConfig, saveConfig } from './config.js';

// 日志记录函数
const logFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'log.txt');

function logMessage(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    // 写入日志文件，确保使用UTF-8编码
    fs.appendFileSync(logFilePath, logEntry, { encoding: 'utf8' });
    
    // 在开发时也可以输出到控制台
    console.log(logEntry.trim());
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 数据库连接池
let interviewDb, emailDb, deliveryDb;

// 数据库配置
const getDbConfigs = () => ({
    interview: {
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: 'interview_schedule',
        charset: config.db.charset,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    },
    email: {
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: 'job_emails',
        charset: config.db.charset,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    },
    delivery: {
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: 'job_deliveries',
        charset: config.db.charset,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    }
});

// 初始化数据库连接
async function initDatabase() {
    try {
        logMessage('正在初始化数据库连接...');
        
        // 检查是否提供了数据库配置
        if (!config.db.host || !config.db.user || !config.db.password) {
            logMessage('数据库配置不完整，跳过数据库初始化', 'WARN');
            return;
        }
    
        logMessage('正在连接数据库...');
        // 创建数据库（如果不存在）
        const rootConnection = await mysql.createConnection({
            host: config.db.host,
            user: config.db.user,
            password: config.db.password
        });
    
        // 创建所有需要的数据库
        await rootConnection.query('CREATE DATABASE IF NOT EXISTS interview_schedule');
        logMessage('创建/检查 interview_schedule 数据库');
        
        await rootConnection.query('CREATE DATABASE IF NOT EXISTS job_emails');
        logMessage('创建/检查 job_emails 数据库');
        
        await rootConnection.query('CREATE DATABASE IF NOT EXISTS job_deliveries');
        logMessage('创建/检查 job_deliveries 数据库');
        
        await rootConnection.end();
    
        // 创建数据库连接池
        const dbConfigs = getDbConfigs();
        interviewDb = mysql.createPool(dbConfigs.interview);
        emailDb = mysql.createPool(dbConfigs.email);
        deliveryDb = mysql.createPool(dbConfigs.delivery);
        logMessage('数据库连接池创建成功');
    
        // 创建表（如果不存在）
        await interviewDb.query(`
      CREATE TABLE IF NOT EXISTS interviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company VARCHAR(255) NOT NULL,
        position VARCHAR(255) NOT NULL,
        datetime DATETIME,
        preparation BOOLEAN DEFAULT FALSE,
        completion BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        logMessage('创建/检查 interviews 表');
    
        await emailDb.query(`
      CREATE TABLE IF NOT EXISTS all_emails (
        id INT AUTO_INCREMENT PRIMARY KEY,
        imap_id VARCHAR(255),
        subject TEXT,
        sender TEXT,
        recipient TEXT,
        send_date TEXT,
        body LONGTEXT,
        delivered BOOLEAN DEFAULT FALSE,
        UNIQUE KEY unique_email (imap_id, subject(50), sender(50), send_date(50))
      )
    `);
        logMessage('创建/检查 all_emails 表');
    
        await deliveryDb.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        position VARCHAR(255),
        delivery_date DATETIME NOT NULL,
        status VARCHAR(100) NOT NULL,
        notes TEXT,
        UNIQUE KEY unique_delivery (company_name, delivery_date, status)
      )
    `);
        logMessage('创建/检查 deliveries 表');
    
        // 插入默认数据（如果表为空）
        const [interviewRows] = await interviewDb.query('SELECT COUNT(*) as count FROM interviews');
        if (interviewRows[0].count === 0) {
            const defaultData = [
                ['腾讯', '前端开发', new Date('2025-09-20T09:00'), true, false],
                ['阿里巴巴', 'Java开发', new Date('2025-09-22T14:00'), true, false],
                ['字节跳动', '产品经理', new Date('2025-09-25T10:30'), false, false],
                ['京东', '销售', new Date('2025-09-28T15:00'), false, false]
            ];
            await interviewDb.query('INSERT INTO interviews (company, position, datetime, preparation, completion) VALUES ?', [defaultData]);
            logMessage('插入默认面试数据');
        }
    
        logMessage('数据库初始化成功');
    } catch (err) {
        logMessage(`数据库初始化失败: ${err.message}`, 'ERROR');
    }
}

// API路由
// 获取当前配置
app.get('/api/config', async (req, res) => {
    logMessage('收到获取配置请求');
    await loadConfig();
    res.json(config);
    logMessage('配置信息已返回');
});

// 更新配置
app.post('/api/config', async (req, res) => {
    try {
        logMessage('收到更新配置请求');
        await saveConfig(req.body);
        logMessage('配置保存成功，正在重新初始化数据库连接');
        // 重新初始化数据库连接
        await initDatabase();
        res.json({ message: '配置更新成功', config });
        logMessage('配置更新完成并返回响应');
    } catch (err) {
        logMessage(`配置更新失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '配置更新失败: ' + err.message });
    }
});

// 面试相关API
app.get('/api/interviews', async (req, res) => {
    try {
        logMessage('收到获取面试数据请求');
        if (!interviewDb) {
            logMessage('数据库未初始化', 'WARN');
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const [rows] = await interviewDb.query('SELECT * FROM interviews ORDER BY datetime');
        const data = rows.map(row => ({
            company: row.company,
            position: row.position,
            datetime: row.datetime ? row.datetime.toISOString().slice(0, 16) : null,
            preparation: row.preparation,
            completion: row.completion,
            notes: row.notes || ''
        }));
        res.json(data);
        logMessage(`成功返回 ${data.length} 条面试数据`);
    } catch (err) {
        logMessage(`获取面试数据失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '获取面试数据失败' });
    }
});

app.post('/api/interviews', async (req, res) => {
    try {
        if (!interviewDb) {
            logMessage('数据库未初始化', 'WARN');
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const data = req.body;
        logMessage(`收到保存面试数据请求，共 ${data.length} 条记录`);
        
        await interviewDb.query('DELETE FROM interviews');
        logMessage('已清空面试数据表');
    
        if (data.length > 0) {
            const values = data.map(item => [
                item.company,
                item.position,
                item.datetime ? new Date(item.datetime) : null,
                item.preparation,
                item.completion,
                item.notes || ''
            ]);
            await interviewDb.query('INSERT INTO interviews (company, position, datetime, preparation, completion, notes) VALUES ?', [values]);
            logMessage(`成功插入 ${data.length} 条面试记录`);
        }
    
        res.json({ message: '面试数据保存成功' });
        logMessage(`面试数据保存完成，共处理 ${data.length} 条记录`);
    } catch (err) {
        logMessage(`保存面试数据失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '保存面试数据失败' });
    }
});

// 邮件相关API
app.get('/api/emails', async (req, res) => {
    try {
        logMessage('收到获取邮件数据请求');
        if (!emailDb) {
            logMessage('数据库未初始化', 'WARN');
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const [rows] = await emailDb.query('SELECT *, delivered as is_delivered FROM all_emails ORDER BY send_date DESC');
        logMessage(`成功返回 ${rows.length} 条邮件数据`);
        res.json(rows);
    } catch (err) {
        logMessage(`获取邮件数据失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '获取邮件数据失败' });
    }
});

app.get('/api/emails/search', async (req, res) => {
    try {
        logMessage('收到搜索邮件数据请求');
        if (!emailDb) {
            logMessage('数据库未初始化', 'WARN');
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { keyword } = req.query;
        let rows;
    
        if (!keyword) {
            [rows] = await emailDb.query('SELECT *, delivered as is_delivered FROM all_emails ORDER BY send_date DESC');
            logMessage(`返回所有邮件数据，共 ${rows.length} 条记录`);
        } else {
            [rows] = await emailDb.query(
                'SELECT *, delivered as is_delivered FROM all_emails WHERE subject LIKE ? OR body LIKE ? ORDER BY send_date DESC',
                [`%${keyword}%`, `%${keyword}%`]
            );
            logMessage(`搜索关键词 "${keyword}"，返回 ${rows.length} 条匹配记录`);
        }
    
        res.json(rows);
    } catch (err) {
        logMessage(`搜索邮件数据失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '搜索邮件数据失败' });
    }
});

app.delete('/api/emails/:id', async (req, res) => {
    try {
        logMessage(`收到删除邮件请求，邮件ID: ${req.params.id}`);
        if (!emailDb) {
            logMessage('数据库未初始化', 'WARN');
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { id } = req.params;
        if (!/^[0-9]+$/.test(id)) {
            logMessage(`无效的邮件ID: ${id}`, 'WARN');
            return res.status(400).json({ error: '无效的邮件ID' });
        }
    
        const [result] = await emailDb.query('DELETE FROM all_emails WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            logMessage(`删除邮件失败，邮件未找到，ID: ${id}`, 'WARN');
            return res.status(404).json({ error: '邮件未找到' });
        }
    
        res.json({ message: '邮件删除成功' });
        logMessage(`邮件删除成功，ID: ${id}`);
    } catch (err) {
        logMessage(`删除邮件失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '删除邮件失败' });
    }
});

// 更新邮件投递状态
app.put('/api/emails/:id/delivered', async (req, res) => {
    try {
        logMessage(`收到更新邮件投递状态请求，邮件ID: ${req.params.id}`);
        if (!emailDb) {
            logMessage('数据库未初始化', 'WARN');
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { id } = req.params;
        const { delivered } = req.body;
    
        if (!/^[0-9]+$/.test(id)) {
            logMessage(`无效的邮件ID: ${id}`, 'WARN');
            return res.status(400).json({ error: '无效的邮件ID' });
        }
    
        const [result] = await emailDb.query(
            'UPDATE all_emails SET delivered = ? WHERE id = ?',
            [delivered ? 1 : 0, id]
        );
    
        if (result.affectedRows === 0) {
            logMessage(`更新邮件投递状态失败，邮件未找到，ID: ${id}`, 'WARN');
            return res.status(404).json({ error: '邮件未找到' });
        }
    
        res.json({ message: '邮件投递状态更新成功' });
        logMessage(`邮件投递状态更新成功，ID: ${id}，状态: ${delivered ? '已投递' : '未投递'}`);
    } catch (err) {
        logMessage(`更新邮件投递状态失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '更新邮件投递状态失败' });
    }
});

app.get('/api/emails/:id/body/realtime', async (req, res) => {
    try {
        logMessage(`收到获取邮件正文请求，邮件ID: ${req.params.id}`);
        const { id } = req.params;
        if (!/^[0-9]+$/.test(id)) {
            logMessage(`无效的邮件ID: ${id}`, 'WARN');
            return res.status(400).json({ error: '无效的邮件ID' });
        }
    
        const [rows] = await emailDb.query('SELECT imap_id FROM all_emails WHERE id = ?', [id]);
        if (rows.length === 0) {
            logMessage(`邮件未找到，ID: ${id}`, 'WARN');
            return res.status(404).json({ error: '邮件未找到' });
        }
    
        const imapId = rows[0].imap_id;
        if (!imapId) {
            logMessage(`该邮件没有IMAP ID，ID: ${id}`, 'WARN');
            return res.status(404).json({ error: '该邮件没有IMAP ID' });
        }
    
        // 使用spawn执行Python脚本获取实时邮件正文
        const pythonPath = 'python';
        const scriptPath = path.join(__dirname, '..', 'script', 'get_email_body_by_id.py');
        logMessage(`正在执行邮件正文获取脚本，IMAP ID: ${imapId}`);
    
        const pythonProcess = spawn(pythonPath, [scriptPath, imapId, config.email.address, config.email.password, config.email.imap_server], {
            cwd: __dirname,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
    
        let stdoutData = '';
        let stderrData = '';
    
        pythonProcess.stdout.on('data', (data) => {
          stdoutData += data.toString();
          logMessage(`邮件正文脚本输出: ${data.toString().trim().substring(0, 100)}...`);
        });
    
        pythonProcess.stderr.on('data', (data) => {
          stderrData += data.toString();
          logMessage(`邮件正文脚本日志: ${data.toString().trim()}`, 'DEBUG');
        });
    
        pythonProcess.on('close', (code) => {
            if (code === 0) {
                logMessage(`邮件正文获取成功，ID: ${id}`);
                res.json({ body: stdoutData });
            } else {
                logMessage(`邮件正文脚本执行失败，退出码: ${code}, 错误: ${stderrData}`, 'ERROR');
                res.status(500).json({ error: '获取邮件正文失败', details: stderrData });
            }
        });
    
        pythonProcess.on('error', (error) => {
            logMessage(`执行邮件正文脚本时出错: ${error.message}`, 'ERROR');
            res.status(500).json({ error: '无法启动获取邮件正文脚本', details: error.message });
        });
    } catch (err) {
        logMessage(`获取邮件正文失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '获取邮件正文失败' });
    }
});

// 获取邮件
app.post('/api/fetch-emails', async (req, res) => {
    try {
        logMessage('收到获取邮件请求');
        const { startDate, endDate } = req.body || {};
    
        // 从请求头获取邮箱配置
        const email = req.headers['x-email-address'] || config.email.address;
        const password = req.headers['x-email-password'] || config.email.password;
        const imap_server = req.headers['x-imap-server'] || config.email.imap_server;
    
        // 设置响应超时时间
        res.setTimeout(300000); // 5分钟超时
    
        // 构建Python脚本参数
        const pythonPath = 'python';
        const scriptPath = path.join(__dirname, '..', 'script', 'qq_email_imap.py');
        logMessage(`正在执行邮件获取脚本: ${scriptPath}`);
    
        // 基本参数
        let args = [scriptPath, email, password, imap_server];
    
        // 如果提供了日期范围，则添加日期参数
        if (startDate && endDate) {
            args.push(startDate, endDate);
            logMessage(`获取指定日期范围的邮件: ${startDate} 到 ${endDate}`);
        }
    
        const pythonProcess = spawn(pythonPath, args, {
            cwd: __dirname,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
    
        let stdoutData = '';
        let stderrData = '';
    
        // 设置子进程超时
        const timeout = setTimeout(() => {
            pythonProcess.kill('SIGTERM');
            logMessage('邮件获取脚本执行超时，已发送终止信号', 'WARN');
      
            // 如果SIGTERM不起作用，1秒后发送SIGKILL
            const forceKillTimeout = setTimeout(() => {
                pythonProcess.kill('SIGKILL');
                logMessage('邮件获取脚本强制终止', 'WARN');
            }, 1000);
      
            pythonProcess.on('exit', () => {
                clearTimeout(forceKillTimeout);
            });
        }, 300000); // 5分钟超时
    
        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
            // 实时记录进度信息
            const dataStr = data.toString();
            logMessage(`邮件获取脚本输出: ${dataStr.trim().substring(0, 100)}...`);
        });
    
        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            logMessage(`邮件获取脚本日志: ${data.toString().trim()}`, 'DEBUG');
        });
    
        pythonProcess.on('close', (code, signal) => {
            clearTimeout(timeout); // 清除超时定时器
      
            if (signal === 'SIGTERM' || signal === 'SIGKILL') {
                logMessage('邮件获取脚本被终止', 'WARN');
                res.status(408).json({ 
                    success: false, 
                    message: '邮件获取超时，已终止操作', 
                    error: 'Timeout' 
                });
                return;
            }
      
            if (code === 0) {
                let processedCount = 0;
                let insertedCount = 0;
                let message = '';
                logMessage('邮件获取脚本执行完成');
                logMessage(`[DEBUG] Python脚本输出原始数据: ${stdoutData}`);
                
                // 尝试匹配"总共处理 X 封邮件，新增 Y 封邮件"格式（中文）
                const countMatch = stdoutData.match(/总共处理\s+(\d+)\s+封邮件，新增\s+(\d+)\s+封邮件/);
                logMessage(`[DEBUG] 计数匹配结果: ${countMatch}`);
                if (countMatch) {
                    processedCount = parseInt(countMatch[1]);
                    insertedCount = parseInt(countMatch[2]);
                    logMessage(`[DEBUG] 解析得到处理邮件数: ${processedCount}, 新增邮件数: ${insertedCount}`);
                } else {
                    // 尝试匹配可能的其他格式
                    const alternativeMatch = stdoutData.match(/获取到\s+(\d+)\s+封新邮件/);
                    logMessage(`[DEBUG] 替代匹配结果: ${alternativeMatch}`);
                    if (alternativeMatch) {
                        insertedCount = parseInt(alternativeMatch[1]);
                        processedCount = insertedCount;
                        logMessage(`[DEBUG] 通过替代方式解析得到邮件数: ${processedCount}`);
                    } else {
                        // 尝试匹配"没有获取到任何邮件"格式（中文）
                        const noEmailsMatch = stdoutData.match(/没有获取到任何邮件/);
                        logMessage(`[DEBUG] 无邮件匹配结果: ${noEmailsMatch}`);
                        if (noEmailsMatch) {
                            processedCount = 0;
                            insertedCount = 0;
                            logMessage(`[DEBUG] 没有获取到任何邮件`);
                        } else {
                            // 如果所有匹配都失败，尝试从stdoutData中查找数字
                            const numberMatches = stdoutData.match(/(\d+)/g);
                            logMessage(`[DEBUG] 数字匹配结果: ${numberMatches}`);
                            if (numberMatches && numberMatches.length > 0) {
                                // 取最后一个数字作为邮件数量
                                insertedCount = parseInt(numberMatches[numberMatches.length - 1]);
                                processedCount = insertedCount;
                                logMessage(`[DEBUG] 通过数字查找方式解析得到邮件数: ${processedCount}`);
                            }
                        }
                    }
                }
                
                logMessage(`邮件获取完成，处理 ${processedCount} 封邮件，新增 ${insertedCount} 封邮件`);
        
                // 构建消息
                if (processedCount === 0) {
                    message = '邮件获取完成，没有找到新邮件';
                } else {
                    message = `邮件获取完成，获取到 ${insertedCount} 封新邮件`;
                }
        
                logMessage(`[DEBUG] 返回给前端的数据: processedCount=${insertedCount}, message=${message}`);
                res.json({ 
                    success: true, 
                    message: message,
                    processedCount: insertedCount  // 返回新增邮件数量
                });
            } else {
                logMessage(`邮件获取失败或被中断，错误: ${stderrData}`, 'ERROR');
                res.status(500).json({ 
                    success: false, 
                    message: '邮件获取失败或被中断', 
                    error: stderrData 
                });
            }
        });
    
        pythonProcess.on('error', (error) => {
            clearTimeout(timeout); // 清除超时定时器
            logMessage(`执行邮件获取脚本时出错: ${error.message}`, 'ERROR');
            res.status(500).json({ 
                success: false, 
                message: '无法启动邮件获取脚本', 
                error: error.message 
            });
        });
    } catch (err) {
        logMessage(`获取邮件失败: ${err.message}`, 'ERROR');
        res.status(500).json({ error: '获取邮件失败' });
    }
});

// 投递相关API
app.get('/api/deliveries', async (req, res) => {
    try {
        if (!deliveryDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const [rows] = await deliveryDb.query('SELECT * FROM deliveries ORDER BY delivery_date DESC');
        const data = rows.map(row => ({
            id: row.id,
            company_name: row.company_name,
            position: row.position || '',
            delivery_date: row.delivery_date,
            status: row.status,
            notes: row.notes || ''
        }));
        res.json(data);
    } catch (err) {
        // console.error('获取投递数据失败:', err);
        res.status(500).json({ error: '获取投递数据失败' });
    }
});

app.post('/api/deliveries', async (req, res) => {
    try {
        if (!deliveryDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { company_name, position, delivery_date, status } = req.body;
    
        // 检查必填字段
        if (!company_name || !delivery_date || !status) {
            return res.status(400).json({ error: '公司名称、投递日期和状态是必填字段' });
        }
    
        // 插入数据
        const [result] = await deliveryDb.query(
            'INSERT INTO deliveries (company_name, position, delivery_date, status) VALUES (?, ?, ?, ?)',
            [company_name, position || '', delivery_date, status]
        );
    
        res.json({ message: '投递记录添加成功', id: result.insertId });
    } catch (err) {
        // 检查是否是重复记录错误
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '重复记录：该投递记录已存在' });
        }
        // console.error('添加投递记录失败:', err);
        res.status(500).json({ error: '添加投递记录失败' });
    }
});

app.put('/api/deliveries/:id', async (req, res) => {
    try {
        if (!deliveryDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { id } = req.params;
        const { company_name, position, delivery_date, status, notes } = req.body;
    
        if (!/^[0-9]+$/.test(id)) {
            return res.status(400).json({ error: '无效的投递ID' });
        }
    
        if (!company_name || !delivery_date || !status) {
            return res.status(400).json({ error: '缺少必要字段' });
        }
    
        const [result] = await deliveryDb.query(
            'UPDATE deliveries SET company_name = ?, position = ?, delivery_date = ?, status = ?, notes = ? WHERE id = ?',
            [company_name, position || '', delivery_date, status, notes || '', id]
        );
    
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '投递记录未找到' });
        }
    
        res.json({ message: '投递记录更新成功' });
    } catch (err) {
        // console.error('更新投递记录失败:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '重复的投递记录' });
        }
        res.status(500).json({ error: '更新投递记录失败' });
    }
});

app.delete('/api/deliveries/:id', async (req, res) => {
    try {
        if (!deliveryDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { id } = req.params;
        if (!/^[0-9]+$/.test(id)) {
            return res.status(400).json({ error: '无效的投递ID' });
        }
    
        const [result] = await deliveryDb.query('DELETE FROM deliveries WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '投递记录未找到' });
        }
    
        res.json({ message: '投递记录删除成功' });
    } catch (err) {
        // console.error('删除投递记录失败:', err);
        res.status(500).json({ error: '删除投递记录失败' });
    }
});

// 页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/loading', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'loading.html'));
});

app.get('/schedule', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'schedule.html'));
});

app.get('/emails', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'emails.html'));
});

app.get('/deliveries', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'deliveries.html'));
});

app.get('/config', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'config.html'));
});

// 退出系统接口
app.post('/api/exit', (req, res) => {
    logMessage('收到退出系统请求');
    res.json({ message: '服务器正在关闭...' });
    logMessage('服务器即将关闭');
    // 延迟关闭服务器，确保响应能发送回去
    setTimeout(() => {
        process.exit(0);
    }, 500);
});

// 初始化数据库并启动服务器
logMessage('正在启动面试管理系统...');
loadConfig().then(() => {
    logMessage('配置文件加载完成');
    return initDatabase();
}).then(() => {
    logMessage('数据库初始化完成');
    app.listen(PORT, () => {
        logMessage(`服务器运行在 http://localhost:${PORT}`);
    });
}).catch(err => {
    logMessage(`启动服务器失败: ${err.message}`, 'ERROR');
});