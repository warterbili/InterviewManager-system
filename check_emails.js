import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// 读取配置文件
const configPath = path.join('.', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function checkEmails() {
    try {
        // 创建数据库连接
        const connection = await mysql.createConnection({
            host: config.db.host,
            user: config.db.user,
            password: config.db.password,
            database: 'job_emails',
            charset: config.db.charset
        });

        // 查询邮件统计信息
        const [rows] = await connection.execute(
            'SELECT COUNT(*) as total, MIN(send_date) as min_date, MAX(send_date) as max_date FROM all_emails'
        );

        console.log('邮件统计信息:');
        console.log('总邮件数:', rows[0].total);
        console.log('最早邮件日期:', rows[0].min_date);
        console.log('最新邮件日期:', rows[0].max_date);

        // 查询特定日期范围的邮件
        const [specificRows] = await connection.execute(
            "SELECT id, subject, send_date FROM all_emails WHERE send_date LIKE '2025-09-%' ORDER BY send_date"
        );

        console.log('\n2025年9月的邮件:');
        specificRows.forEach(row => {
            console.log(`ID: ${row.id}, 日期: ${row.send_date}, 主题: ${row.subject}`);
        });

        // 关闭连接
        await connection.end();
    } catch (error) {
        console.error('查询失败:', error.message);
    }
}

checkEmails();