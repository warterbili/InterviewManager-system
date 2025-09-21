import email
import pymysql
from email.header import decode_header
import datetime
import sys
import os
from imapclient import IMAPClient
import ssl
import logging
import io

# 导入配置模块
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import script.config as config

# 配置日志
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', encoding='utf-8')
# logger = logging.getLogger(__name__)

# 设置标准输出编码为UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def connect_to_qq_mail(email, password, imap_server):
    """连接到邮箱并登录"""
    try:
        # 创建一个安全的SSL连接
        client = IMAPClient(imap_server, ssl=True, ssl_context=ssl.create_default_context())
        
        # 使用邮箱地址和授权码登录
        client.login(email, password)
        
        print(f"成功连接并登录邮箱: {email}")
        return client
    except Exception as e:
        print(f"连接邮箱失败: {e}")
        raise

def get_email_body(msg):
    """获取邮件正文内容"""
    def decode_content(payload, charset=None):
        if not payload:
            return ""
        if charset:
            try:
                return payload.decode(charset, errors='ignore')
            except:
                pass
        for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
            try:
                return payload.decode(encoding)
            except UnicodeDecodeError:
                continue
        return payload.decode('utf-8', errors='ignore')
    
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if "attachment" in str(part.get("Content-Disposition", "")):
                continue
            content_type = part.get_content_type()
            if content_type in ["text/plain", "text/html"]:
                try:
                    decoded = decode_content(part.get_payload(decode=True), part.get_content_charset())
                    if content_type == "text/html":
                        import re
                        decoded = re.sub(r'<[^>]+>', '', decoded).strip()
                        decoded = re.sub(r'\s+', ' ', decoded)
                    body = decoded
                    if content_type == "text/plain":
                        break
                except Exception as e:
                    print(f"解码邮件内容时出错: {e}")
                    continue
    else:
        try:
            body = decode_content(msg.get_payload(decode=True), msg.get_content_charset())
        except Exception as e:
            print(f"解码单部分邮件内容时出错: {e}")
            body = ""
    
    return body[:10000] + "..." if len(body) > 10000 else body

def save_emails_to_database(emails, db_config):
    """将邮件保存到数据库"""
    try:
        print(f"[DEBUG] 尝试连接数据库: {db_config['database']}")
        with pymysql.connect(
            host=db_config['host'],
            user=db_config['user'],
            password=db_config['password'],
            database=db_config['database'],
            charset=db_config['charset'],
            autocommit=True
        ) as connection:
            print("[DEBUG] 数据库连接成功")
            with connection.cursor() as cursor:
                print("[DEBUG] 创建/检查邮件表...")
                cursor.execute("""
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)
                print("[DEBUG] 邮件表创建/检查完成")
                
                if not emails:
                    print("[DEBUG] 没有邮件需要保存到数据库")
                    return 0
                
                # 先检查数据库中已有的邮件数量
                cursor.execute("SELECT COUNT(*) as count FROM all_emails")
                result = cursor.fetchone()
                existing_count = result[0] if result else 0
                print(f"[DEBUG] 数据库中已有邮件数量: {existing_count}")
                
                insert_query = """
                INSERT INTO all_emails 
                (imap_id, subject, sender, recipient, send_date, body, delivered) 
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                subject=VALUES(subject), sender=VALUES(sender), recipient=VALUES(recipient), 
                send_date=VALUES(send_date), body=VALUES(body), delivered=VALUES(delivered)
                """
                
                email_data = [
                    (str(e['imap_id']), e['subject'] or '', e['sender'] or '',
                     e['recipient'] or '', e['send_date'] or '', e['body'], False)
                    for e in emails
                ]
                
                print(f"[DEBUG] 准备将 {len(email_data)} 封邮件插入数据库")
                if email_data:
                    print(f"[DEBUG] 第一条邮件数据预览: ID={email_data[0][0]}, Subject={email_data[0][1][:50]}...")
                
                batch_size = 100
                processed_count = len(email_data)  # 记录处理的邮件数量
                inserted_count = 0  # 记录实际插入的邮件数量
                
                for i in range(0, len(email_data), batch_size):
                    batch = email_data[i:i+batch_size]
                    print(f"[DEBUG] 正在插入第 {i//batch_size + 1} 批邮件，共 {len(batch)} 封")
                    # 执行插入或更新操作
                    cursor.executemany(insert_query, batch)
                    # 获取受影响的行数
                    affected_rows = cursor.rowcount
                    inserted_count += affected_rows
                    print(f"[DEBUG] 第 {i//batch_size + 1} 批邮件处理完成，影响 {affected_rows} 行")
                
                print(f"[DEBUG] 邮件保存完成，总共处理 {processed_count} 封邮件，实际插入 {inserted_count} 封新邮件")
                return inserted_count
    except Exception as e:
        print(f"[DEBUG] 数据库连接或操作失败: {e}")
        import traceback
        traceback.print_exc()
        return 0

def fetch_emails(client, start_date=None, end_date=None, email_address=None):
    """获取邮件"""
    try:
        client.select_folder('INBOX')
        print("已选择收件箱文件夹")
        
        # 构建搜索条件
        search_criteria = ['ALL']
        if start_date and end_date:
            try:
                start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
                end_dt = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1)
                search_criteria = ['SINCE', start_dt, 'BEFORE', end_dt]
                print(f"使用日期范围搜索: {start_date} 到 {end_date}")
            except ValueError as e:
                print(f"日期格式无效: {e}")
                # 如果日期格式无效，则使用默认搜索条件
                search_criteria = ['ALL']
        else:
            # 如果没有指定日期范围，则使用默认搜索条件
            search_criteria = ['ALL']
        
        email_ids = client.search(search_criteria)
        print(f"找到 {len(email_ids)} 封邮件")
        
        # 限制处理数量
        max_emails = 1000
        if len(email_ids) > max_emails:
            print(f"将处理前 {max_emails} 封邮件")
            email_ids = email_ids[:max_emails]
        
        emails = []
        batch_size = 50
        print(f"开始处理邮件，总共 {len(email_ids)} 封")
        for i in range(0, len(email_ids), batch_size):
            batch_ids = email_ids[i:i+batch_size]
            print(f"正在处理第 {i//batch_size + 1} 批邮件，邮件ID范围 {min(batch_ids)}-{max(batch_ids)}")
            
            try:
                msg_data = client.fetch(batch_ids, ['RFC822'])
                print(f"第 {i//batch_size + 1} 批邮件数据获取完成")
                for msg_id in batch_ids:
                    if msg_id not in msg_data or b'RFC822' not in msg_data[msg_id]:
                        print(f"未找到邮件ID {msg_id} 的数据")
                        continue
                    
                    msg = email.message_from_bytes(msg_data[msg_id][b'RFC822'])
                    
                    # 解码主题
                    subject = ""
                    subject_header = decode_header(msg.get('Subject', ''))
                    for part, encoding in subject_header:
                        if isinstance(part, bytes):
                            subject += part.decode(encoding or 'utf-8', errors='ignore')
                        else:
                            subject += str(part)
                    
                    # 获取基本信息
                    sender = msg.get('From', '')
                    recipient = msg.get('To', '')
                    send_date = msg.get('Date', '')
                    
                    # 获取邮件正文
                    body = get_email_body(msg)
                    
                    emails.append({
                        'imap_id': msg_id,
                        'subject': subject,
                        'sender': sender,
                        'recipient': recipient,
                        'send_date': send_date,
                        'body': body
                    })
                    
                    # 每处理10封邮件输出一次进度
                    if len(emails) % 10 == 0:
                        print(f"已处理 {len(emails)} 封邮件")
                
                print(f"第 {i//batch_size + 1} 批邮件处理完成")
            except Exception as e:
                print(f"处理第 {i//batch_size + 1} 批邮件时出错: {e}")
                continue
        
        print(f"邮件获取完成，总共处理 {len(emails)} 封邮件")
        return emails
    except Exception as e:
        print(f"获取邮件时出错: {e}")
        return []

def main():
    """主函数"""
    try:
        if len(sys.argv) < 4:
            print("用法: python qq_email_imap.py <email> <password> <imap_server> [start_date] [end_date]", file=sys.stderr)
            sys.exit(1)
        
        email = sys.argv[1]
        password = sys.argv[2]
        imap_server = sys.argv[3]
        start_date = sys.argv[4] if len(sys.argv) > 4 else None
        end_date = sys.argv[5] if len(sys.argv) > 5 else None
        
        print(f"[DEBUG] 开始执行邮件获取脚本")
        print(f"[DEBUG] 邮箱: {email}")
        if start_date and end_date:
            print(f"[DEBUG] 日期范围: {start_date} 到 {end_date}")
        
        # 连接邮箱
        client = connect_to_qq_mail(email, password, imap_server)
        
        # 获取邮件
        emails = fetch_emails(client, start_date, end_date, email)
        processed_count = len(emails)  # 记录处理的邮件数量
        
        print(f"[DEBUG] 获取到的邮件总数: {processed_count}")
        
        # 保存到数据库
        inserted_count = 0
        if emails:
            db_config = {
                'host': config.config['db']['host'],
                'user': config.config['db']['user'],
                'password': config.config['db']['password'],
                'database': 'job_emails',
                'charset': config.config['db']['charset']
            }
            print(f"[DEBUG] 数据库配置: {db_config}")
            inserted_count = save_emails_to_database(emails, db_config)
            print(f"[DEBUG] 总共处理 {processed_count} 封邮件，新增 {inserted_count} 封邮件")
            print(f"总共处理 {processed_count} 封邮件，新增 {inserted_count} 封邮件")
        else:
            print("[DEBUG] 没有获取到任何邮件")
            print("[DEBUG] 总共处理 0 封邮件，新增 0 封邮件")
            print("没有获取到任何邮件")
            print("总共处理 0 封邮件，新增 0 封邮件")
        
        # 关闭连接
        try:
            client.logout()
            print("[DEBUG] 邮箱连接已关闭")
        except Exception as e:
            print(f"[DEBUG] 关闭邮箱连接时出错: {e}")
    except Exception as e:
        print(f"[DEBUG] 主函数执行时发生错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
