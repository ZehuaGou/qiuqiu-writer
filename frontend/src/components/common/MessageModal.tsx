import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import DraggableResizableModal from './DraggableResizableModal';
import './MessageModal.css';

export type MessageType = 'success' | 'error' | 'warning' | 'info';

interface MessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: MessageType;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  /** 仅提示、无按钮，自动关闭（替换成功等） */
  toast?: boolean;
  autoCloseMs?: number;
}

export default function MessageModal({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  onConfirm,
  confirmText = '确定',
  cancelText = '取消',
  toast = false,
  autoCloseMs,
}: MessageModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(timer);
    } else {
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !toast || autoCloseMs == null || autoCloseMs <= 0) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [isOpen, toast, autoCloseMs, onClose]);

  if (!visible && !isOpen) return null;

  const getIcon = (size = 20) => {
    switch (type) {
      case 'success': return <CheckCircle size={size} className="icon-success" />;
      case 'error': return <AlertCircle size={size} className="icon-error" />;
      case 'warning': return <AlertTriangle size={size} className="icon-warning" />;
      case 'info': default: return <Info size={size} className="icon-info" />;
    }
  };

  const getDefaultTitle = () => {
    if (title) return title;
    switch (type) {
      case 'success': return '成功';
      case 'error': return '错误';
      case 'warning': return '警告';
      case 'info': default: return '提示';
    }
  };

  // Toast：透明灰色小浮层，不挡操作、自动消失
  if (toast) {
    return (
      <div className="message-toast-wrap" aria-live="polite">
        <div className="message-toast">
          {getIcon(18)}
          <span className="message-toast-text">{message}</span>
        </div>
      </div>
    );
  }

  // 模态框：带遮罩的完整弹窗
  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={400}
      initialHeight={250}
      className="message-modal"
      handleClassName=".message-modal-header"
      overlayClassName={isOpen ? 'open' : ''}
    >
      <div className="message-modal-header">
        <h3>
          {getIcon(20)}
          <span>{getDefaultTitle()}</span>
        </h3>
        <button className="message-modal-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
          
          <div className="message-modal-body">
            {message}
          </div>

          <div className="message-modal-footer">
            {onConfirm && (
              <button className="message-btn secondary" onClick={onClose}>
                {cancelText}
              </button>
            )}
            <button 
              className="message-btn primary" 
              onClick={() => {
                if (onConfirm) onConfirm();
                onClose();
              }}
            >
              {confirmText}
            </button>
          </div>
    </DraggableResizableModal>
  );
}
