import express from 'express';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { config, loadConfig, saveConfig } from './config.js';

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
    // 检查是否提供了数据库配置
        if (!config.db.host || !config.db.user || !config.db.password) {
            return;
        }
    
        // 创建数据库（如果不存在）
        const rootConnection = await mysql.createConnection({
            host: config.db.host,
            user: config.db.user,
            password: config.db.password
        });
    
        // 创建所有需要的数据库
        await rootConnection.query('CREATE DATABASE IF NOT EXISTS interview_schedule');
        await rootConnection.query('CREATE DATABASE IF NOT EXISTS job_emails');
        await rootConnection.query('CREATE DATABASE IF NOT EXISTS job_deliveries');
        await rootConnection.end();
    
        // 创建数据库连接池
        const dbConfigs = getDbConfigs();
        interviewDb = mysql.createPool(dbConfigs.interview);
        emailDb = mysql.createPool(dbConfigs.email);
        deliveryDb = mysql.createPool(dbConfigs.delivery);
    
        // 创建表（如果不存在）
        await interviewDb.query(`
      CREATE TABLE IF NOT EXISTS interviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company VARCHAR(255) NOT NULL,
        position VARCHAR(255) NOT NULL,
        datetime DATETIME,
        preparation BOOLEAN DEFAULT FALSE,
        completion BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
        await emailDb.query(`
      CREATE TABLE IF NOT EXISTS all_emails (
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
    
        await deliveryDb.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        delivery_date DATETIME NOT NULL,
        status VARCHAR(100) NOT NULL,
        UNIQUE KEY unique_delivery (company_name, delivery_date, status)
      )
    `);
    
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
        }
    
        // console.log('数据库初始化成功');
    } catch (err) {
        // console.error('数据库初始化失败:', err);
    }
}

// API路由
// 获取当前配置
app.get('/api/config', async (req, res) => {
    await loadConfig();
    res.json(config);
});

// 更新配置
app.post('/api/config', async (req, res) => {
    try {
        await saveConfig(req.body);
        // 重新初始化数据库连接
        await initDatabase();
        res.json({ message: '配置更新成功', config });
    } catch (err) {
        res.status(500).json({ error: '配置更新失败: ' + err.message });
    }
});

// 面试相关API
app.get('/api/interviews', async (req, res) => {
    try {
        if (!interviewDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const [rows] = await interviewDb.query('SELECT * FROM interviews ORDER BY datetime');
        const data = rows.map(row => ({
            company: row.company,
            position: row.position,
            datetime: row.datetime ? row.datetime.toISOString().slice(0, 16) : null,
            preparation: row.preparation,
            completion: row.completion
        }));
        res.json(data);
    } catch (err) {
        // console.error('获取面试数据失败:', err);
        res.status(500).json({ error: '获取面试数据失败' });
    }
});

app.post('/api/interviews', async (req, res) => {
    try {
        if (!interviewDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const data = req.body;
        await interviewDb.query('DELETE FROM interviews');
    
        if (data.length > 0) {
            const values = data.map(item => [
                item.company,
                item.position,
                item.datetime ? new Date(item.datetime) : null,
                item.preparation,
                item.completion
            ]);
            await interviewDb.query('INSERT INTO interviews (company, position, datetime, preparation, completion) VALUES ?', [values]);
        }
    
        res.json({ message: '面试数据保存成功' });
    } catch (err) {
        // console.error('保存面试数据失败:', err);
        res.status(500).json({ error: '保存面试数据失败' });
    }
});

// 邮件相关API
app.get('/api/emails', async (req, res) => {
    try {
        if (!emailDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const [rows] = await emailDb.query('SELECT * FROM all_emails ORDER BY send_date DESC');
        res.json(rows);
    } catch (err) {
        // console.error('获取邮件数据失败:', err);
        res.status(500).json({ error: '获取邮件数据失败' });
    }
});

app.get('/api/emails/search', async (req, res) => {
    try {
        if (!emailDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { keyword } = req.query;
        let rows;
    
        if (!keyword) {
            [rows] = await emailDb.query('SELECT * FROM all_emails ORDER BY send_date DESC');
        } else {
            [rows] = await emailDb.query(
                'SELECT * FROM all_emails WHERE subject LIKE ? OR body LIKE ? ORDER BY send_date DESC',
                [`%${keyword}%`, `%${keyword}%`]
            );
        }
    
        res.json(rows);
    } catch (err) {
        // console.error('搜索邮件数据失败:', err);
        res.status(500).json({ error: '搜索邮件数据失败' });
    }
});

app.delete('/api/emails/:id', async (req, res) => {
    try {
        if (!emailDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { id } = req.params;
        if (!/^[0-9]+$/.test(id)) {
            return res.status(400).json({ error: '无效的邮件ID' });
        }
    
        const [result] = await emailDb.query('DELETE FROM all_emails WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '邮件未找到' });
        }
    
        res.json({ message: '邮件删除成功' });
    } catch (err) {
        // console.error('删除邮件失败:', err);
        res.status(500).json({ error: '删除邮件失败' });
    }
});

app.get('/api/emails/:id/body/realtime', async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[0-9]+$/.test(id)) {
            return res.status(400).json({ error: '无效的邮件ID' });
        }
    
        const [rows] = await emailDb.query('SELECT imap_id FROM all_emails WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: '邮件未找到' });
        }
    
        const imapId = rows[0].imap_id;
        if (!imapId) {
            return res.status(404).json({ error: '该邮件没有IMAP ID' });
        }
    
        // 使用spawn执行Python脚本获取实时邮件正文
        const pythonPath = 'python';
        const scriptPath = path.join(__dirname, '..', 'script', 'get_email_body_by_id.py');
    
        const pythonProcess = spawn(pythonPath, [scriptPath, imapId, config.email.address, config.email.password, config.email.imap_server], {
            cwd: __dirname,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
    
        let stdoutData = '';
        let stderrData = '';
    
        pythonProcess.stdout.on('data', (data) => {
          stdoutData += data.toString();
          // console.log(`获取邮件正文脚本输出: ${data.toString().trim()}`);
        });
    
        pythonProcess.stderr.on('data', (data) => {
          stderrData += data.toString();
          // console.log(`获取邮件正文脚本日志: ${data.toString().trim()}`);
        });
    
        pythonProcess.on('close', (code) => {
            if (code === 0) {
                res.json({ body: stdoutData });
            } else {
                // console.error(`获取邮件正文脚本执行失败，退出码: ${code}`, stderrData);
                res.status(500).json({ error: '获取邮件正文失败', details: stderrData });
            }
        });
    
        pythonProcess.on('error', (error) => {
            // console.error('执行获取邮件正文脚本时出错:', error);
            res.status(500).json({ error: '无法启动获取邮件正文脚本', details: error.message });
        });
    } catch (err) {
        // console.error('获取邮件正文失败:', err);
        res.status(500).json({ error: '获取邮件正文失败' });
    }
});

// 获取邮件
app.post('/api/fetch-emails', async (req, res) => {
    try {
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
    
        // 基本参数
        let args = [scriptPath, email, password, imap_server];
    
        // 如果提供了日期范围，则添加日期参数
        if (startDate && endDate) {
            args.push(startDate, endDate);
        }
    
        // console.log(`正在执行邮件获取脚本: ${scriptPath}`, args);
    
        const pythonProcess = spawn(pythonPath, args, {
            cwd: __dirname
        });
    
        let stdoutData = '';
        let stderrData = '';
    
        // 设置子进程超时
        const timeout = setTimeout(() => {
            pythonProcess.kill('SIGTERM');
            // console.log('邮件获取脚本执行超时，已发送终止信号');
      
            // 如果SIGTERM不起作用，1秒后发送SIGKILL
            const forceKillTimeout = setTimeout(() => {
                pythonProcess.kill('SIGKILL');
                // console.log('邮件获取脚本强制终止');
            }, 1000);
      
            pythonProcess.on('exit', () => {
                clearTimeout(forceKillTimeout);
            });
        }, 300000); // 5分钟超时
    
        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
            // 实时记录进度信息
            const dataStr = data.toString();
            // console.log(`邮件获取脚本输出: ${dataStr.trim()}`);
        });
    
        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            // console.log(`邮件获取脚本日志: ${data.toString().trim()}`);
        });
    
        pythonProcess.on('close', (code, signal) => {
            clearTimeout(timeout); // 清除超时定时器
      
            if (signal === 'SIGTERM' || signal === 'SIGKILL') {
                // console.log('邮件获取脚本被终止');
                res.status(408).json({ 
                    success: false, 
                    message: '邮件获取超时，已终止操作', 
                    error: 'Timeout' 
                });
                return;
            }
      
            if (code === 0) {
                let insertedCount = 0;
                // console.log('stdoutData:', stdoutData); // 调试日志
                
                // 尝试匹配"成功插入 X 封邮件"格式（中文）
                const insertedMatch = stdoutData.match(/成功插入\s+(\d+)\s+封邮件/);
                // console.log('insertedMatch:', insertedMatch); // 调试日志
                if (insertedMatch) {
                    insertedCount = parseInt(insertedMatch[1]);
                }
                
                // 尝试匹配"没有获取到任何邮件"格式（中文）
                if (insertedCount === 0) {
                    const noEmailsMatch = stdoutData.match(/没有获取到任何邮件/);
                    // console.log('noEmailsMatch:', noEmailsMatch); // 调试日志
                    if (noEmailsMatch) {
                        insertedCount = 0;
                    }
                }
                
                // 尝试匹配数字格式（从任何包含数字的行中提取）
                if (insertedCount === 0) {
                    const numberMatch = stdoutData.match(/(\d+)/);
                    // console.log('numberMatch:', numberMatch); // 调试日志
                    if (numberMatch) {
                        insertedCount = parseInt(numberMatch[1]);
                    }
                }
                
                // 尝试匹配脚本执行完成的返回值
                const scriptCompleteMatch = stdoutData.match(/脚本执行完成，返回值:\s+(\d+)/);
                // console.log('scriptCompleteMatch:', scriptCompleteMatch); // 调试日志
                if (scriptCompleteMatch) {
                    insertedCount = parseInt(scriptCompleteMatch[1]);
                }
                
                // console.log('最终insertedCount:', insertedCount); // 调试日志
                // console.log('返回的JSON:', { 
                //     success: true, 
                //     message: `邮件获取完成，新增 ${insertedCount} 封邮件`, 
                //     insertedCount: insertedCount
                // }); // 调试日志
        
                res.json({ 
                    success: true, 
                    message: `邮件获取完成，新增 ${insertedCount} 封邮件`, 
                    insertedCount: insertedCount
                });
            } else {
                res.status(500).json({ 
                    success: false, 
                    message: '邮件获取失败或被中断', 
                    error: stderrData 
                });
            }
        });
    
        pythonProcess.on('error', (error) => {
            clearTimeout(timeout); // 清除超时定时器
            // console.error('执行邮件获取脚本时出错:', error);
            res.status(500).json({ 
                success: false, 
                message: '无法启动邮件获取脚本', 
                error: error.message 
            });
        });
    } catch (err) {
        // console.error('获取邮件失败:', err);
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
        res.json(rows);
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
    
        const { company_name, delivery_date, status } = req.body;
        if (!company_name || !delivery_date || !status) {
            return res.status(400).json({ error: '缺少必要字段' });
        }
    
        const [result] = await deliveryDb.query(
            'INSERT INTO deliveries (company_name, delivery_date, status) VALUES (?, ?, ?)',
            [company_name, delivery_date, status]
        );
    
        res.json({ message: '投递记录添加成功', id: result.insertId });
    } catch (err) {
        // console.error('添加投递记录失败:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '重复的投递记录' });
        }
        res.status(500).json({ error: '添加投递记录失败' });
    }
});

app.put('/api/deliveries/:id', async (req, res) => {
    try {
        if (!deliveryDb) {
            return res.status(503).json({ error: '数据库未初始化，请先配置数据库连接信息' });
        }
    
        const { id } = req.params;
        const { company_name, delivery_date, status } = req.body;
    
        if (!/^[0-9]+$/.test(id)) {
            return res.status(400).json({ error: '无效的投递ID' });
        }
    
        if (!company_name || !delivery_date || !status) {
            return res.status(400).json({ error: '缺少必要字段' });
        }
    
        const [result] = await deliveryDb.query(
            'UPDATE deliveries SET company_name = ?, delivery_date = ?, status = ? WHERE id = ?',
            [company_name, delivery_date, status, id]
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
    res.json({ message: '服务器正在关闭...' });
    // 延迟关闭服务器，确保响应能发送回去
    setTimeout(() => {
        process.exit(0);
    }, 500);
});

// 初始化数据库并启动服务器
loadConfig().then(() => {
    return initDatabase();
}).then(() => {
    app.listen(PORT, () => {
        // console.log(`服务器运行在 http://localhost:${PORT}`);
    });
}).catch(err => {
    // console.error('启动服务器失败:', err);
});