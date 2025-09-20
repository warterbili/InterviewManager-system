import json
import os

# 配置存储
config = {
    'db': {
        'host': '',
        'user': '',
        'password': '',
        'charset': 'utf8mb4'
    },
    'email': {
        'address': '',
        'password': '',
        'imap_server': 'imap.qq.com'
    }
}

def load_config():
    """从config.json文件加载配置"""
    try:
        # 获取项目根目录
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        config_path = os.path.join(project_root, 'config.json')
        
        # 读取配置文件
        with open(config_path, 'r', encoding='utf-8') as f:
            loaded_config = json.load(f)
        
        # 更新配置
        config['db'].update(loaded_config.get('db', {}))
        config['email'].update(loaded_config.get('email', {}))
    except Exception as err:
        # print(f'配置文件加载失败: {err}')
        pass

# 在模块导入时自动加载配置
load_config()