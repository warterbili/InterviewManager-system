import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// 读取配置文件
const configPath = path.join('.', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function checkAllEmails() {
    try {
        // 创建数据库连接
        const connection = await mysql.createConnection({
            host: config.db.host,
            user: config.db.user,
            password: config.db.password,
            database: 'job_emails',
            charset: config.db.charset
        });

        // 查询所有邮件，按日期排序
        const [rows] = await connection.execute(
            "SELECT id, subject, send_date FROM all_emails ORDER BY send_date"
        );

        console.log(`\n数据库中的所有邮件 (按日期排序):`);
        console.log(`总共找到 ${rows.length} 封邮件`);
        
        // 显示前10封和后10封邮件
        console.log('\n最早的10封邮件:');
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const row = rows[i];
            console.log(`ID: ${row.id}, 日期: ${row.send_date}, 主题: ${row.subject}`);
        }
        
        if (rows.length > 20) {
            console.log('\n... (中间省略)');
            console.log('\n最新的10封邮件:');
            for (let i = Math.max(0, rows.length - 10); i < rows.length; i++) {
                const row = rows[i];
                console.log(`ID: ${row.id}, 日期: ${row.send_date}, 主题: ${row.subject}`);
            }
        } else if (rows.length > 10) {
            console.log('\n剩余的邮件:');
            for (let i = 10; i < rows.length; i++) {
                const row = rows[i];
                console.log(`ID: ${row.id}, 日期: ${row.send_date}, 主题: ${row.subject}`);
            }
        }

        // 关闭连接
        await connection.end();
    } catch (error) {
        console.error('查询失败:', error.message);
    }
}

checkAllEmails();