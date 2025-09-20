import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        const projectRoot = path.dirname(__dirname);
        const configPath = path.join(projectRoot, 'config.json');
        
        // 检查配置文件是否存在
        if (fs.existsSync(configPath)) {
            // 读取配置文件
            const rawData = fs.readFileSync(configPath, 'utf-8');
            const loadedConfig = JSON.parse(rawData);
            
            // 更新配置
            config.db = { ...config.db, ...loadedConfig.db };
            config.email = { ...config.email, ...loadedConfig.email };
        }
    } catch (err) {
        // console.error('配置文件加载失败:', err);
    }
}

export async function saveConfig(newConfig) {
    try {
        // 获取项目根目录
        const projectRoot = path.dirname(__dirname);
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
    } catch (err) {
        throw new Error(`配置保存失败: ${err.message}`);
    }
}