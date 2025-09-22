import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// 读取配置文件
const configPath = path.join('.', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function checkEmailsByDateRange(startDate, endDate) {
    try {
        // 创建数据库连接
        const connection = await mysql.createConnection({
            host: config.db.host,
            user: config.db.user,
            password: config.db.password,
            database: 'job_emails',
            charset: config.db.charset
        });

        // 查询指定日期范围的邮件
        const [rows] = await connection.execute(
            "SELECT id, subject, send_date FROM all_emails WHERE send_date >= ? AND send_date <= ? ORDER BY send_date",
            [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
        );

        console.log(`\n${startDate} 到 ${endDate} 日期范围内的邮件:`);
        console.log(`总共找到 ${rows.length} 封邮件`);
        rows.forEach(row => {
            console.log(`ID: ${row.id}, 日期: ${row.send_date}, 主题: ${row.subject}`);
        });

        // 关闭连接
        await connection.end();
    } catch (error) {
        console.error('查询失败:', error.message);
    }
}

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length >= 2) {
    checkEmailsByDateRange(args[0], args[1]);
} else {
    console.log('用法: node check_emails_by_date.js <开始日期> <结束日期>');
    console.log('例如: node check_emails_by_date.js 2025-09-15 2025-09-22');
}