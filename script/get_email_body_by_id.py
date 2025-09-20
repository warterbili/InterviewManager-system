import email
from email.header import decode_header
import sys
import os
import logging
from imapclient import IMAPClient

# 导入配置模块
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import config

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def connect_to_qq_mail(email_addr, password, imap_server):
    """连接到邮箱并登录
    
    Args:
        email_addr (str): 邮箱地址
        password (str): 邮箱授权码
        imap_server (str): IMAP服务器地址
        
    Returns:
        IMAPClient: IMAP连接对象
    """
    # 创建一个安全的SSL连接
    import ssl
    mail = IMAPClient(imap_server, ssl=True, ssl_context=ssl.create_default_context())
    
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
        mail.select_folder('INBOX')
        
        # 尝试将imap_id转换为整数
        try:
            imap_id_int = int(imap_id)
        except ValueError:
            logger.error(f"Invalid IMAP ID format: {imap_id}")
            return None
        
        # 获取邮件的原始数据
        try:
            msg_data = mail.fetch([imap_id_int], ['RFC822'])
        except Exception as e:
            logger.error(f"无法从服务器获取邮件数据，IMAP ID: {imap_id_int}, 错误: {e}")
            # 尝试获取邮箱中的邮件列表进行调试
            try:
                all_ids = mail.search(['ALL'])
                logger.info(f"邮箱中可用的IMAP ID数量: {len(all_ids)}")
                if len(all_ids) > 0:
                    logger.info(f"最近的10个IMAP ID: {sorted(all_ids, reverse=True)[:10]}")
            except Exception as search_error:
                logger.error(f"无法获取邮箱中的邮件列表: {search_error}")
            return None
        
        # 检查数据
        if not msg_data:
            logger.error(f"No message data returned from server for IMAP ID: {imap_id_int}")
            # 尝试获取邮箱中的邮件列表进行调试
            try:
                all_ids = mail.search(['ALL'])
                logger.info(f"邮箱中可用的IMAP ID数量: {len(all_ids)}")
                if len(all_ids) > 0:
                    logger.info(f"最近的10个IMAP ID: {sorted(all_ids, reverse=True)[:10]}")
            except Exception as search_error:
                logger.error(f"无法获取邮箱中的邮件列表: {search_error}")
            return None
        
        # 检查返回的数据中是否包含请求的ID
        if imap_id_int not in msg_data:
            logger.error(f"Requested IMAP ID {imap_id_int} not found in response. Available IDs: {list(msg_data.keys())}")
            return None
            
        # 获取邮件内容
        msg_content = msg_data[imap_id_int][b'RFC822']
        
        if not isinstance(msg_content, bytes):
            logger.error(f"Message content is not bytes: {type(msg_content)}")
            return None
            
        msg = email.message_from_bytes(msg_content)
        
        # 获取邮件正文
        body = get_email_body(msg)
        
        return body
    except Exception as e:
        logger.error(f"获取邮件正文时出错: {e}")
        # 添加更多调试信息
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return None

def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("用法: python get_email_body_by_id.py <imap_id> [email] [password] [imap_server]", file=sys.stderr)
        sys.exit(1)
    
    imap_id = sys.argv[1]
    email = sys.argv[2] if len(sys.argv) > 2 else config.config['email']['address']
    password = sys.argv[3] if len(sys.argv) > 3 else config.config['email']['password']
    imap_server = sys.argv[4] if len(sys.argv) > 4 else config.config['email']['imap_server']
    
    # 如果配置文件中也没有配置，则不使用默认值
    if not email:
        email = config.config['email']['address']
    if not password:
        password = config.config['email']['password']
    if not imap_server:
        imap_server = config.config['email']['imap_server']
    
    # 检查必要配置
    if not email or not password or not imap_server:
        print("缺少必要的邮箱配置信息，请提供邮箱地址、授权码和IMAP服务器地址", file=sys.stderr)
        sys.exit(1)
    
    try:
        # 连接到邮箱
        mail = connect_to_qq_mail(email, password, imap_server)
        
        # 调试：打印IMAP ID
        logger.info(f"正在获取IMAP ID为 {imap_id} 的邮件")
        
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
            logger.error(f"无法获取邮件正文，IMAP ID {imap_id} 可能不存在或已删除")
            print(f"无法获取邮件正文，IMAP ID {imap_id} 可能不存在或已删除", file=sys.stderr)
            print("提示：请尝试重新获取邮件数据以更新数据库中的IMAP ID", file=sys.stderr)
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"主函数执行时发生错误: {e}")
        print(f"发生错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()