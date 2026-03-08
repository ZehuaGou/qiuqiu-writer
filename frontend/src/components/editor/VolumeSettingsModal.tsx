import React, { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import './VolumeSettingsModal.css';

interface VolumeSettingsModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  volumeId?: string;
  initialTitle?: string;
  initialOutline?: string;
  initialDetailOutline?: string;
  onClose: () => void;
  onSave: (title: string, volumeId?: string, outline?: string, detailOutline?: string) => void;
  onDelete?: (volumeId: string) => void;
  readOnly?: boolean;
}

export default function VolumeSettingsModal({
  isOpen,
  mode,
  volumeId,
  initialTitle = '',
  initialOutline = '',
  initialDetailOutline = '',
  onClose,
  onSave,
  onDelete,
  readOnly
}: VolumeSettingsModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [outline, setOutline] = useState(initialOutline || '');
  const [detailOutline, setDetailOutline] = useState(initialDetailOutline || '');

  useEffect(() => {
    setTimeout(() => {
      setTitle(initialTitle);
      setOutline(initialOutline || '');
      setDetailOutline(initialDetailOutline || '');
    }, 0);
  }, [initialTitle, initialOutline, initialDetailOutline, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(title, volumeId, outline, detailOutline);
    onClose();
  };

  return (
    <div className="volume-modal-overlay">
      <div className="volume-modal-content">
        <div className="volume-modal-header">
          <h2>{mode === 'create' ? '新建卷' : '卷纲设置'}</h2>
          <button className="volume-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="volume-modal-form">
          <div className="form-group">
            <label htmlFor="volume-title">卷名称</label>
            <input
              id="volume-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入卷名称"
              autoFocus
              className="volume-title-input"
              disabled={readOnly}
            />
          </div>

          <div className="form-group">
            <label htmlFor="volume-outline">卷大纲</label>
            <textarea
              id="volume-outline"
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              placeholder="请输入卷大纲..."
              className="volume-textarea"
              rows={4}
              disabled={readOnly}
            />
          </div>

          <div className="form-group">
            <label htmlFor="volume-detail-outline">卷细纲</label>
            <textarea
              id="volume-detail-outline"
              value={detailOutline}
              onChange={(e) => setDetailOutline(e.target.value)}
              placeholder="请输入卷细纲..."
              className="volume-textarea"
              rows={6}
              disabled={readOnly}
            />
          </div>

          <div className="volume-modal-footer">
            {!readOnly && mode === 'edit' && onDelete && volumeId && (
              <button 
                type="button" 
                className="volume-btn-delete"
                onClick={() => {
                  if (window.confirm('确定要删除该卷吗？删除后卷内章节将保留但不再属于任何卷。')) {
                    onDelete(volumeId);
                    onClose();
                  }
                }}
              >
                <Trash2 size={16} /> 删除卷
              </button>
            )}
            <button 
              type="button" 
              className="volume-btn-cancel" 
              onClick={onClose}
            >
              取消
            </button>
            {!readOnly && (
              <button 
                type="submit" 
                className="volume-btn-save"
                disabled={!title.trim()}
              >
                <Save size={16} /> 保存
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
