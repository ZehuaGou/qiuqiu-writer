/**
 * 章节历史记录弹窗
 * 展示当前章节的版本列表（后端 chapter_versions），后续可扩展「恢复到此版本」
 */

import { useState, useEffect } from 'react';
import { X, History } from 'lucide-react';
import { chaptersApi, type ChapterVersion } from '../../utils/chaptersApi';
import LoadingSpinner from '../common/LoadingSpinner';
import './ChapterHistoryModal.css';

interface ChapterHistoryModalProps {
  isOpen: boolean;
  chapterId: string | null;
  chapterTitle?: string;
  onClose: () => void;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ChapterHistoryModal({
  isOpen,
  chapterId,
  chapterTitle,
  onClose,
}: ChapterHistoryModalProps) {
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !chapterId) {
      setVersions([]);
      return;
    }
    const id = parseInt(chapterId, 10);
    if (isNaN(id)) return;

    setLoading(true);
    chaptersApi
      .getChapterVersions(id, 1, 50)
      .then((list) => setVersions(Array.isArray(list) ? list : []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [isOpen, chapterId]);

  if (!isOpen) return null;

  return (
    <div className="chapter-history-overlay" onClick={onClose}>
      <div className="chapter-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chapter-history-header">
          <span className="chapter-history-title">
            <History size={18} />
            历史记录
            {chapterTitle && <span className="chapter-history-sub"> · {chapterTitle}</span>}
          </span>
          <button type="button" className="chapter-history-close" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        <div className="chapter-history-body">
          {loading ? (
            <div className="chapter-history-loading">
              <LoadingSpinner />
            </div>
          ) : versions.length === 0 ? (
            <p className="chapter-history-empty">暂无历史版本。保存或创建版本后会显示在这里。</p>
          ) : (
            <ul className="chapter-history-list">
              {versions.map((v) => (
                <li key={v.id} className="chapter-history-item">
                  <div className="chapter-history-item-head">
                    <span className="chapter-history-version">版本 {v.version_number}</span>
                    <span className="chapter-history-date">{formatDate(v.created_at)}</span>
                  </div>
                  {v.change_description && (
                    <p className="chapter-history-desc">{v.change_description}</p>
                  )}
                  {v.word_count != null && v.word_count > 0 && (
                    <span className="chapter-history-meta">{v.word_count} 字</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
