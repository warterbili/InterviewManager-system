import imaplib
import email
from email.header import decode_header
import sys
import os
from dotenv import load_dotenv
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

def connect_to_qq_mail(email_addr, password, imap_server):
    """连接到邮箱并登录
    
    Args:
        email_addr (str): 邮箱地址
        password (str): 邮箱授权码
        imap_server (str): IMAP服务器地址
        
    Returns:
        imaplib.IMAP4_SSL: IMAP连接对象
    """
    # 创建一个安全的SSL连接
    mail = imaplib.IMAP4_SSL(imap_server)
    
    # 使用邮箱地址和授权码登录
    mail.login(email_addr, password)
    
    return mail

def decode_payload(payload, charset=None):
    """解码邮件内容
    
    Args:
        payload (bytes): 邮件内容
        charset (str, optional): 字符集
        
    Returns:
        str: 解码后的邮件内容
    """
    # 如果没有指定字符集，尝试多种常见编码
    if charset is None:
        # 尝试多种常见编码，优先使用UTF-8
        for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
            try:
                return payload.decode(encoding)
            except UnicodeDecodeError:
                continue
        # 如果所有编码都失败，使用错误处理模式
        return payload.decode('utf-8', errors='ignore')
    else:
        # 如果有明确的字符集，直接使用
        try:
            return payload.decode(charset, errors='ignore')
        except Exception as e:
            # 如果指定的字符集无法解码，尝试其他常见编码
            for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
                try:
                    return payload.decode(encoding)
                except UnicodeDecodeError:
                    continue
            # 如果所有编码都失败，使用错误处理模式
            return payload.decode('utf-8', errors='ignore')


def get_email_body(msg):
    """获取邮件正文内容
    
    Args:
        msg (email.message.Message): 邮件消息对象
        
    Returns:
        str: 邮件正文内容
    """
    body = ""
    
    if msg.is_multipart():
        # 处理多部分邮件
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            
            # 跳过附件
            if "attachment" in content_disposition:
                continue
            
            # 只处理文本内容
            if content_type in ["text/plain", "text/html"]:
                try:
                    # 获取内容和字符集
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset()
                    
                    # 解码内容
                    body = decode_payload(payload, charset)
                    
                    # 优先获取纯文本内容
                    if content_type == "text/plain":
                        break
                except Exception as e:
                    logger.warning(f"解码多部分邮件内容时出错: {e}")
                    continue
    else:
        # 处理单部分邮件
        try:
            payload = msg.get_payload(decode=True)
            charset = msg.get_content_charset()
            
            # 解码内容
            body = decode_payload(payload, charset)
        except Exception as e:
            logger.warning(f"解码单部分邮件内容时出错: {e}")
            body = ""
    
    return body

def fetch_email_body_by_imap_id(mail, imap_id):
    """根据IMAP ID获取邮件正文"""
    try:
        # 选择收件箱
        mail.select('inbox')
        
        # 获取邮件的原始数据
        status, msg_data = mail.fetch(imap_id, '(RFC822)')
        
        # 解析邮件内容
        msg = email.message_from_bytes(msg_data[0][1])
        
        # 获取邮件正文
        body = get_email_body(msg)
        
        return body
    except Exception as e:
        print(f"获取邮件正文时出错: {e}", file=sys.stderr)
        return None

def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("用法: python get_email_body_by_id.py <imap_id> [email] [password] [imap_server]", file=sys.stderr)
        sys.exit(1)
    
    imap_id = sys.argv[1]
    email = sys.argv[2] if len(sys.argv) > 2 else os.getenv('EMAIL_ADDRESS')
    password = sys.argv[3] if len(sys.argv) > 3 else os.getenv('EMAIL_PASSWORD')
    imap_server = sys.argv[4] if len(sys.argv) > 4 else os.getenv('IMAP_SERVER')
    
    # 如果环境变量中也没有配置，则报错退出
    if not email:
        print("错误: 未提供邮箱地址，且环境变量 EMAIL_ADDRESS 未设置", file=sys.stderr)
        sys.exit(1)
    if not password:
        print("错误: 未提供邮箱授权码，且环境变量 EMAIL_PASSWORD 未设置", file=sys.stderr)
        sys.exit(1)
    if not imap_server:
        imap_server = 'imap.qq.com'
    
    try:
        # 连接到邮箱
        mail = connect_to_qq_mail(email, password, imap_server)
        
        # 获取邮件正文
        body = fetch_email_body_by_imap_id(mail, imap_id)
        
        # 关闭连接
        try:
            mail.logout()
        except Exception as e:
            logger.warning(f"关闭邮箱连接时出错: {e}")
        
        if body is not None:
            # 确保输出编码正确
            print(body, flush=True)
            sys.exit(0)
        else:
            print("无法获取邮件正文", file=sys.stderr)
            sys.exit(1)
            
    except Exception as e:
        print(f"发生错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()