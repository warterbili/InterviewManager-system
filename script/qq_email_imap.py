import imaplib
import email
import pymysql
from email.header import decode_header
import datetime
import hashlib
import sys
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

def connect_to_qq_mail(email, password, imap_server):
    """连接到邮箱并登录"""
    # 创建一个安全的SSL连接
    mail = imaplib.IMAP4_SSL(imap_server)
    
    # 使用邮箱地址和授权码登录
    mail.login(email, password)
    
    print(f"已成功连接并登录到邮箱: {email}")
    return mail

def get_email_body(msg):
    """获取邮件正文内容"""
    body = ""
    
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            
            # 跳过附件
            if "attachment" in content_disposition:
                continue
            
            # 获取文本内容
            if content_type == "text/plain" or content_type == "text/html":
                try:
                    charset = part.get_content_charset()
                    payload = part.get_payload(decode=True)
                    
                    # 如果有明确的字符集，直接使用
                    if charset:
                        try:
                            body = payload.decode(charset)
                        except (UnicodeDecodeError, LookupError):
                            # 如果指定的字符集无法解码，尝试其他常见编码
                            for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
                                try:
                                    body = payload.decode(encoding)
                                    break
                                except UnicodeDecodeError:
                                    continue
                            else:
                                # 如果所有编码都失败，使用错误处理模式
                                body = payload.decode('utf-8', errors='ignore')
                    else:
                        # 尝试多种常见编码，优先使用UTF-8
                        for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
                            try:
                                body = payload.decode(encoding)
                                break
                            except UnicodeDecodeError:
                                continue
                        else:
                            # 如果所有编码都失败，使用错误处理模式
                            body = payload.decode('utf-8', errors='ignore')
                    
                    # 优先获取纯文本内容
                    if content_type == "text/plain":
                        break
                except Exception as e:
                    continue
    else:
        try:
            charset = msg.get_content_charset()
            payload = msg.get_payload(decode=True)
            
            # 如果有明确的字符集，直接使用
            if charset:
                try:
                    body = payload.decode(charset)
                except (UnicodeDecodeError, LookupError):
                    # 如果指定的字符集无法解码，尝试其他常见编码
                    for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
                        try:
                            body = payload.decode(encoding)
                            break
                        except UnicodeDecodeError:
                            continue
                    else:
                        # 如果所有编码都失败，使用错误处理模式
                        body = payload.decode('utf-8', errors='ignore')
            else:
                # 尝试多种常见编码，优先使用UTF-8
                for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
                    try:
                        body = payload.decode(encoding)
                        break
                    except UnicodeDecodeError:
                        continue
                else:
                    # 如果所有编码都失败，使用错误处理模式
                    body = payload.decode('utf-8', errors='ignore')
        except Exception as e:
            body = ""
    
    return body

def fetch_emails_by_date_range(mail, start_date=None, end_date=None, target_email=None):
    """根据日期范围获取邮件并解析其基本信息"""
    # 选择收件箱
    mail.select('inbox')
    
    # 如果没有提供日期范围，则默认获取最近7天的邮件
    if not start_date and not end_date:
        end_date = datetime.datetime.now()
        start_date = end_date - datetime.datetime.timedelta(days=7)
    elif isinstance(start_date, str):
        start_date = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        end_date = datetime.datetime.strptime(end_date, "%Y-%m-%d") if end_date else datetime.datetime.now()
    
    # 确保开始和结束日期也是时区感知的
    if start_date.tzinfo is None:
        start_date = start_date.astimezone()
    if end_date.tzinfo is None:
        end_date = end_date.astimezone()
    
    print(f"获取邮件日期范围: {start_date.strftime('%Y-%m-%d')} 到 {end_date.strftime('%Y-%m-%d')}")
    
    # 获取所有邮件
    status, messages = mail.search(None, 'ALL')
    
    # 获取邮件ID列表
    mail_ids = messages[0].split()
    
    print(f"共找到 {len(mail_ids)} 封邮件。")
    
    all_emails = []
    
    # 从最新的邮件开始检查（限制检查最近的200封邮件）
    recent_mail_ids = mail_ids[-200:] if len(mail_ids) > 200 else mail_ids
    
    for mail_id in reversed(recent_mail_ids):
        # 获取邮件的原始数据
        status, msg_data = mail.fetch(mail_id, '(RFC822)')
        
        # 解析邮件内容
        msg = email.message_from_bytes(msg_data[0][1])
        
        # 解码邮件主题
        subject, encoding = decode_header(msg['Subject'])[0]
        if isinstance(subject, bytes):
            # 尝试多种编码解码主题
            if encoding:
                try:
                    subject = subject.decode(encoding)
                except (UnicodeDecodeError, LookupError):
                    # 如果指定编码失败，尝试其他常见编码
                    for enc in ['utf-8', 'gbk', 'gb2312', 'latin1']:
                        try:
                            subject = subject.decode(enc)
                            break
                        except UnicodeDecodeError:
                            continue
                    else:
                        # 如果所有编码都失败，使用错误处理模式
                        subject = subject.decode('utf-8', errors='ignore')
            else:
                # 尝试多种常见编码，优先使用UTF-8
                for enc in ['utf-8', 'gbk', 'gb2312', 'latin1']:
                    try:
                        subject = subject.decode(enc)
                        break
                    except UnicodeDecodeError:
                        continue
                else:
                    # 如果所有编码都失败，使用错误处理模式
                    subject = subject.decode('utf-8', errors='ignore')
        
        # 获取发件人
        from_ = msg.get('From')
        
        # 获取收件人
        to_ = msg.get('To')
        
        # 获取发送日期
        date_ = msg.get('Date')
        
        # 获取邮件正文
        body = get_email_body(msg)
        
        # 解析邮件 Date 字段中的日期部分（兼容多种格式）
        try:
            email_date = email.utils.parsedate_to_datetime(date_)
            # 转换为本地时区
            email_local_date = email_date.astimezone()
        except Exception as e:
            print(f"日期解析错误: {e}, 原始日期: {date_}", file=sys.stderr)
            continue
        
        # 检查邮件日期是否在指定范围内
        if start_date <= email_local_date <= end_date:
            # 如果提供了目标邮箱地址，则检查邮件是否是发送给该邮箱的
            if target_email and to_ and target_email.lower() not in to_.lower():
                # 如果不是发送给目标邮箱的邮件，则跳过
                continue
            
            # 安全打印邮件信息，避免编码错误
            try:
                print(f"\n=== 邮件ID: {mail_id.decode()} ===")
                print(f"主题: {subject}")
                print(f"发件人: {from_}")
                print(f"收件人: {to_}")
                print(f"发送日期: {date_}")
            except UnicodeEncodeError:
                # 如果打印时出现编码错误，使用安全的打印方式
                print(f"\n=== 邮件ID: {mail_id.decode()} ===".encode('utf-8', errors='ignore').decode('utf-8'))
                print(f"主题: {subject}".encode('utf-8', errors='ignore').decode('utf-8'))
                print(f"发件人: {from_}".encode('utf-8', errors='ignore').decode('utf-8'))
                print(f"收件人: {to_}".encode('utf-8', errors='ignore').decode('utf-8'))
                print(f"发送日期: {date_}".encode('utf-8', errors='ignore').decode('utf-8'))
            
            # 收集所有邮件信息（不再筛选关键词）
            all_emails.append({
                'subject': subject,
                'from': from_,
                'to': to_,
                'date': date_,
                'body': body,
                'imap_id': mail_id.decode()
            })
    
    return all_emails

def save_to_database(emails):
    """将所有邮件信息保存到MySQL数据库的统一表中，避免重复"""
    conn = pymysql.connect(
        host='localhost',
        user='root',
        password='123123',
        database='job_emails',
        charset='utf8mb4',
        autocommit=True
    )
    cursor = conn.cursor()
    
    # 创建统一的邮件表（如果不存在）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS `all_emails` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            imap_id VARCHAR(255),
            subject TEXT,
            sender TEXT,
            recipient TEXT,
            send_date TEXT,
            body LONGTEXT,
            UNIQUE KEY unique_email (imap_id, subject(50), sender(50), send_date(50))
        )
    ''')
    
    inserted_count = 0
    
    for email in emails:
        # 确保所有字符串都正确编码
        subject = email['subject']
        if isinstance(subject, str):
            # 确保字符串可以正确编码为UTF-8
            try:
                subject.encode('utf-8')
            except UnicodeEncodeError:
                # 如果无法编码，使用错误处理模式
                subject = subject.encode('utf-8', errors='ignore').decode('utf-8')
        
        sender = email['from']
        if isinstance(sender, str):
            try:
                sender.encode('utf-8')
            except UnicodeEncodeError:
                sender = sender.encode('utf-8', errors='ignore').decode('utf-8')
        
        recipient = email.get('to', '')
        if isinstance(recipient, str):
            try:
                recipient.encode('utf-8')
            except UnicodeEncodeError:
                recipient = recipient.encode('utf-8', errors='ignore').decode('utf-8')
        
        date = email['date']
        if isinstance(date, str):
            try:
                date.encode('utf-8')
            except UnicodeEncodeError:
                date = date.encode('utf-8', errors='ignore').decode('utf-8')
        
        body = email.get('body', '')
        if isinstance(body, str):
            try:
                body.encode('utf-8')
            except UnicodeEncodeError:
                body = body.encode('utf-8', errors='ignore').decode('utf-8')
        
        imap_id = email.get('imap_id', '')
        if isinstance(imap_id, str):
            try:
                imap_id.encode('utf-8')
            except UnicodeEncodeError:
                imap_id = imap_id.encode('utf-8', errors='ignore').decode('utf-8')
        
        # 检查邮件是否已存在
        cursor.execute("SELECT COUNT(*) FROM `all_emails` WHERE imap_id = %s AND subject = %s AND sender = %s AND send_date = %s", 
                      (imap_id, subject, sender, date))
        if cursor.fetchone()[0] == 0:
            # 如果邮件不存在，则插入
            cursor.execute('''
                INSERT INTO `all_emails` (imap_id, subject, sender, recipient, send_date, body)
                VALUES (%s, %s, %s, %s, %s, %s)
            ''', (imap_id, subject, sender, recipient, date, body))
            inserted_count += 1
    
    # 提交更改并关闭连接
    conn.commit()
    conn.close()
    
    print(f"已将 {inserted_count} 封新邮件信息保存到MySQL数据库（忽略 {len(emails) - inserted_count} 封重复邮件）。")
    return inserted_count

def main():
    """主函数"""
    try:
        # 解析命令行参数
        email = None
        password = None
        imap_server = None
        start_date = None
        end_date = None
        
        if len(sys.argv) >= 4:
            email = sys.argv[1]
            password = sys.argv[2]
            imap_server = sys.argv[3]
            
            if len(sys.argv) >= 6:
                start_date = sys.argv[4]
                end_date = sys.argv[5]
        
        # 如果没有提供邮箱信息，使用环境变量或默认配置
        if not email:
            email = os.getenv('EMAIL_ADDRESS', '1608157098@qq.com')
        if not password:
            password = os.getenv('EMAIL_PASSWORD', 'dduplvjlpgqjgjjh')
        if not imap_server:
            imap_server = os.getenv('IMAP_SERVER', 'imap.qq.com')
        
        if not email or not password or not imap_server:
            print("缺少必要的邮箱配置信息，请提供邮箱地址、授权码和IMAP服务器地址")
            return 0
        
        # 连接到邮箱
        mail = connect_to_qq_mail(email, password, imap_server)
        
        # 根据日期范围获取邮件，只获取发送给目标邮箱的邮件
        emails = fetch_emails_by_date_range(mail, start_date, end_date, email)
        
        # 保存到数据库
        inserted_count = save_to_database(emails)
        
        # 关闭连接
        mail.logout()
        
        print(f"\n处理完成，共处理了 {len(emails)} 封邮件，新增 {inserted_count} 封邮件。")
        return inserted_count
        
    except Exception as e:
        print(f"发生错误: {e}", file=sys.stderr)
        return 0

if __name__ == "__main__":
    main()