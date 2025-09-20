import email
import pymysql
from email.header import decode_header
import datetime
import sys
import os
from imapclient import IMAPClient
import ssl
import logging

# 导入配置模块
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import config

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', encoding='utf-8')
logger = logging.getLogger(__name__)

def connect_to_qq_mail(email, password, imap_server):
    """连接到邮箱并登录"""
    try:
        # 创建一个安全的SSL连接
        client = IMAPClient(imap_server, ssl=True, ssl_context=ssl.create_default_context())
        
        # 使用邮箱地址和授权码登录
        client.login(email, password)
        
        logger.info(f"Successfully connected and logged in to email: {email}")
        return client
    except Exception as e:
        logger.error(f"Failed to connect to email: {e}")
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
                    logger.warning(f"解码邮件内容时出错: {e}")
                    continue
    else:
        try:
            body = decode_content(msg.get_payload(decode=True), msg.get_content_charset())
        except Exception as e:
            logger.warning(f"解码单部分邮件内容时出错: {e}")
            body = ""
    
    return body[:10000] + "..." if len(body) > 10000 else body

def save_emails_to_database(emails, db_config):
    """将邮件保存到数据库"""
    try:
        with pymysql.connect(
            host=db_config['host'],
            user=db_config['user'],
            password=db_config['password'],
            database=db_config['database'],
            charset=db_config['charset'],
            autocommit=True
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS all_emails (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    imap_id VARCHAR(255) NOT NULL,
                    subject TEXT,
                    sender TEXT,
                    recipient TEXT,
                    send_date TEXT,
                    body LONGTEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_email (imap_id),
                    INDEX idx_sender (sender(100)),
                    INDEX idx_date (send_date(50)),
                    INDEX idx_subject (subject(100))
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)
                
                if not emails:
                    logger.info("No emails to save to database")
                    return 0
                
                insert_query = """
                INSERT IGNORE INTO all_emails 
                (imap_id, subject, sender, recipient, send_date, body) 
                VALUES (%s, %s, %s, %s, %s, %s)
                """
                
                email_data = [
                    (e['imap_id'], e['subject'][:500] or '', e['sender'][:255] or '',
                     e['recipient'][:255] or '', e['send_date'][:100] or '', e['body'])
                    for e in emails
                ]
                
                logger.info(f"Preparing to insert {len(email_data)} emails into database")
                batch_size = 100
                inserted_count = 0
                for i in range(0, len(email_data), batch_size):
                    batch = email_data[i:i+batch_size]
                    logger.debug(f"Inserting batch {i//batch_size + 1}: {len(batch)} emails")
                    result = cursor.executemany(insert_query, batch)
                    # executemany的返回值是受影响的行数，对于INSERT IGNORE，这表示实际插入的行数
                    inserted_count += result
                    logger.info(f"Batch inserted {result} emails, total {inserted_count} emails")
                
                logger.info(f"Successfully inserted {inserted_count} emails")
                return inserted_count
    except Exception as e:
        logger.error(f"Database connection or operation failed: {e}")
        return 0

def fetch_emails(client, start_date=None, end_date=None, email_address=None):
    """获取邮件"""
    try:
        client.select_folder('INBOX')
        logger.info("Selected INBOX folder")
        
        # 构建搜索条件
        search_criteria = ['ALL']
        if start_date and end_date:
            try:
                start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
                end_dt = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1)
                search_criteria = ['SINCE', start_dt, 'BEFORE', end_dt]
                logger.info(f"Searching with date range: {start_date} to {end_date}")
            except ValueError as e:
                logger.error(f"Invalid date format: {e}")
        
        email_ids = client.search(search_criteria)
        logger.info(f"Found {len(email_ids)} emails")
        
        # 限制处理数量
        max_emails = 1000
        if len(email_ids) > max_emails:
            logger.info(f"Will process first {max_emails} emails")
            email_ids = email_ids[:max_emails]
        
        emails = []
        batch_size = 50
        logger.info(f"Start processing emails, total {len(email_ids)} emails")
        for i in range(0, len(email_ids), batch_size):
            batch_ids = email_ids[i:i+batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}: email ID range {min(batch_ids)}-{max(batch_ids)}")
            
            try:
                msg_data = client.fetch(batch_ids, ['RFC822'])
                logger.info(f"Successfully fetched email data for batch {i//batch_size + 1}")
                for msg_id in batch_ids:
                    if msg_id not in msg_data or b'RFC822' not in msg_data[msg_id]:
                        logger.warning(f"No data found for email ID {msg_id}")
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
                    body = get_email_body(msg)
                    
                    # 过滤自己发送的邮件
                    if email_address and email_address in sender:
                        logger.info(f"Skipping self-sent email: {subject[:50]}...")
                        continue
                    
                    email_info = {
                        'imap_id': str(msg_id),
                        'subject': subject or '',
                        'sender': sender or '',
                        'recipient': recipient or '',
                        'send_date': send_date or '',
                        'body': body or ''
                    }
                    emails.append(email_info)
                    logger.debug(f"Successfully processed email: {subject[:50]}...")
            except Exception as e:
                logger.error(f"Error fetching email batch data: {e}")
                continue
        
        logger.info(f"Email processing completed, processed {len(emails)} emails")
        return emails
        
    except Exception as e:
        logger.error(f"Error fetching emails: {e}")
        return []

def main():
    """主函数"""
    # 获取配置
    email = sys.argv[1] if len(sys.argv) >= 4 else config.config['email']['address']
    password = sys.argv[2] if len(sys.argv) >= 4 else config.config['email']['password']
    imap_server = sys.argv[3] if len(sys.argv) >= 4 else config.config['email']['imap_server']
    start_date = sys.argv[4] if len(sys.argv) > 4 else None
    end_date = sys.argv[5] if len(sys.argv) > 5 else None
    
    db_config = {
        'host': config.config['db']['host'],
        'user': config.config['db']['user'],
        'password': config.config['db']['password'],
        'database': 'job_emails',
        'charset': config.config['db']['charset']
    }
    
    # 验证配置
    if not all([email, password, imap_server]):
        logger.error("Missing required email configuration")
        return 0
    if not all([db_config['host'], db_config['user'], db_config['password']]):
        logger.error("Missing required database configuration")
        return 0
    
    try:
        logger.info(f"Connecting to email: {email}@{imap_server}")
        if start_date and end_date:
            logger.info(f"Searching with date range: {start_date} to {end_date}")
        
        mail = connect_to_qq_mail(email, password, imap_server)
        logger.info("Start fetching emails...")
        emails = fetch_emails(mail, start_date, end_date, email)
        logger.info(f"Email fetching completed, fetched {len(emails)} emails")
        
        try:
            mail.logout()
            logger.info("Email connection closed")
        except Exception as e:
            logger.warning(f"Error closing email connection: {e}")
        
        if not emails:
            logger.info("No emails fetched")
            print("没有获取到任何邮件")  # 确保输出到stdout
            return 0
        
        logger.info(f"Start saving {len(emails)} emails to database...")
        inserted_count = save_emails_to_database(emails, db_config)
        logger.info(f"Email saving completed, inserted {inserted_count} new emails")
        print(f"成功插入 {inserted_count} 封邮件")  # 确保输出到stdout
        return inserted_count
        
    except Exception as e:
        logger.error(f"Error occurred: {e}")
        print(f"发生错误: {e}")  # 确保输出到stdout
        return 0

if __name__ == "__main__":
    result = main()
    print(f"脚本执行完成，返回值: {result}")  # 添加最终输出
