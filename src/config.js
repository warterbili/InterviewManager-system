import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径（在ES模块中替代__dirname）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 日志记录函数
const logFilePath = path.join(__dirname, '..', 'log.txt');

function logMessage(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    // 写入日志文件，确保使用UTF-8编码
    fs.appendFileSync(logFilePath, logEntry, { encoding: 'utf8' });
    
    // 在开发时也可以输出到控制台
    console.log(logEntry.trim());
}

// 配置存储
export const config = {
    db: {
        host: '',
        user: '',
        password: '',
        charset: 'utf8mb4'
    },
    email: {
        address: '',
        password: '',
        imap_server: 'imap.qq.com'
    }
};

export async function loadConfig() {
    try {
        // 获取项目根目录
        const projectRoot = path.join(__dirname, '..');
        const configPath = path.join(projectRoot, 'config.json');
        
        // 检查配置文件是否存在
        if (fs.existsSync(configPath)) {
            logMessage('正在加载配置文件...');
            // 读取配置文件
            const rawData = fs.readFileSync(configPath, 'utf-8');
            const loadedConfig = JSON.parse(rawData);
            
            // 更新配置
            config.db = { ...config.db, ...loadedConfig.db };
            config.email = { ...config.email, ...loadedConfig.email };
            
            logMessage('配置文件加载成功');
        } else {
            logMessage('配置文件不存在，使用默认配置', 'WARN');
        }
    } catch (err) {
        logMessage(`配置文件加载失败: ${err.message}`, 'ERROR');
    }
}

export async function saveConfig(newConfig) {
    try {
        logMessage('正在保存配置...');
        
        // 获取项目根目录
        const projectRoot = path.join(__dirname, '..');
        const configPath = path.join(projectRoot, 'config.json');
        
        // 更新配置
        if (newConfig.db) {
            config.db = { ...config.db, ...newConfig.db };
        }
        if (newConfig.email) {
            config.email = { ...config.email, ...newConfig.email };
        }
        
        // 保存到文件
        const configToSave = {
            db: config.db,
            email: config.email
        };
        
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf-8');
        
        logMessage('配置保存成功');
    } catch (err) {
        logMessage(`配置保存失败: ${err.message}`, 'ERROR');
        throw new Error(`配置保存失败: ${err.message}`);
    }
}