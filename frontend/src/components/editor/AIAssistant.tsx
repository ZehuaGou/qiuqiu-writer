import { MessageSquare, Sparkles, Upload, FileText, Send, ChevronUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { streamChatMessage } from '../../utils/chatApi';
import type { ChatMessage } from '../../utils/chatApi';
import { authApi } from '../../utils/authApi';
import './AIAssistant.css';

interface AIAssistantProps {
  workId?: number | string | null;
}

export default function AIAssistant({ workId }: AIAssistantProps) {
  const [activeTab, setActiveTab] = useState<'inspiration' | 'chat'>('chat');
  const [message, setMessage] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // 检查登录状态
  useEffect(() => {
    setIsAuthenticated(authApi.isAuthenticated());
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    setCharCount(value.length);
  };

  const handleSend = async () => {
    const content = message.trim();
    if (!content || isSending) return;

    // 检查登录状态和作品ID
    if (!isAuthenticated) {
      setError('请先登录后再使用AI对话功能');
      return;
    }

    if (!workId) {
      setError('请先选择作品后再使用AI对话功能');
      return;
    }

    setError(null);
    // 先把用户消息加入本地对话
    const userMsg: ChatMessage = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setMessage('');
    setCharCount(0);

    try {
      setIsSending(true);
      let assistantBuffer = '';

      // 调试日志
      console.log('[AIAssistant] 发送消息，workId:', workId, 'isAuthenticated:', isAuthenticated);

      await streamChatMessage(
        content,
        [...messages, userMsg],
        (event) => {
          if (event.type === 'text' && typeof event.data === 'string') {
            assistantBuffer += event.data;
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last || last.role !== 'assistant') {
                next.push({ role: 'assistant', content: assistantBuffer });
              } else {
                next[next.length - 1] = { ...last, content: assistantBuffer };
              }
              return next;
            });
          } else if (event.type === 'error') {
            const msg = typeof event.data === 'string' ? event.data : '对话出错';
            setError(msg);
          } else if (event.type === 'end') {
            setIsSending(false);
          }
        },
        workId  // 传递 workId 参数
      );

      // 如果服务端没有显式发送 end 事件，也在结束时确保状态复位
      setIsSending(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '发送失败，请稍后重试';
      setError(msg);
      console.error('对话发送失败:', e);
    } finally {
      // 避免重复调用，但确保异常情况下也能复位
      setIsSending(false);
    }
  };

  return (
    <aside className="ai-assistant">
      <div className="assistant-tabs">
        <button
          className={`tab-button ${activeTab === 'inspiration' ? 'active' : ''}`}
          onClick={() => setActiveTab('inspiration')}
        >
          <Sparkles size={16} />
          <span>灵感卡片</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={16} />
          <span>AI对话</span>
        </button>
      </div>

      {activeTab === 'chat' && (
        <div className="chat-content">
          <div className="chat-header">
            <div className="froggy-avatar">
              <span className="froggy-icon">🐸</span>
            </div>
            <div className="froggy-greeting">
              <p className="greeting-text">
                嗨!我是智能写作助手蛙蛙。今天想写什么故事?
              </p>
              <p className="disclaimer">内容由AI生成,仅供参考</p>
            </div>
          </div>

          {/* 对话消息列表 */}
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                还没有对话，先问问蛙蛙今天写什么吧～
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chat-message chat-message-${msg.role === 'user' ? 'user' : 'assistant'}`}
              >
                <div className="chat-message-bubble">
                  {msg.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="chat-message chat-message-assistant">
                <div className="chat-message-bubble chat-message-loading">
                  正在思考中…
                </div>
              </div>
            )}
          </div>

          <div className="chat-input-area">
            <div className="input-actions">
              <button className="input-action-btn">
                <Upload size={14} />
                <span>@上传文件</span>
              </button>
              <button className="input-action-btn">
                <FileText size={14} />
                <span>@引用内容</span>
              </button>
            </div>
            {!isAuthenticated ? (
              <div className="chat-login-prompt">
                <p>请先登录后再使用AI对话功能</p>
              </div>
            ) : !workId ? (
              <div className="chat-login-prompt">
                <p>请先选择作品后再使用AI对话功能</p>
              </div>
            ) : (
              <>
                <textarea
                  className="chat-input"
                  placeholder="输入你的问题..."
                  value={message}
                  onChange={handleInputChange}
                  rows={4}
                  disabled={!isAuthenticated || !workId}
                />
                <div className="input-footer">
                  <span className="char-count">{charCount}/50000字</span>
                  <button
                    className="send-button"
                    onClick={handleSend}
                    disabled={isSending || !message.trim() || !isAuthenticated || !workId}
                  >
                    <Send size={16} />
                    <span>{isSending ? '发送中...' : '发送'}</span>
                  </button>
                </div>
              </>
            )}
            {error && <div className="chat-error">{error}</div>}
          </div>

          <div className="chat-prompt">
            <p>写作遇到烦恼?试试问问蛙蛙!</p>
          </div>
        </div>
      )}

      {activeTab === 'inspiration' && (
        <div className="inspiration-content">
          <p className="placeholder-text">灵感卡片功能开发中...</p>
        </div>
      )}

      <div className="assistant-footer">
        <div className="footer-item">
          <span>灵感思考版</span>
        </div>
        <div className="footer-item">
          <span>蛙蛙默认工具</span>
          <select className="tool-select">
            <option>默认</option>
          </select>
        </div>
        <div className="footer-item">
          <span>16</span>
          <button className="up-arrow">
            <ChevronUp size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

