/**
 * 章节历史记录弹窗 - 参考文档历史风格
 * 左侧：主内容区（对比/更改）；右侧：历史记录列表（按月分组）；顶部：返回、还原、编辑记录 N/M、上一项/下一项
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { chaptersApi, type YjsSnapshotMeta } from '../../utils/chaptersApi';
import { getContentJSONFromYjsSnapshotBase64, getTextFromProsemirrorJSON } from '../../utils/yjsSnapshot';
import { diffLines, type DiffLine } from '../../utils/simpleDiff';
import LoadingSpinner from '../common/LoadingSpinner';
import './ChapterHistoryModal.css';

interface ChapterHistoryModalProps {
  isOpen: boolean;
  chapterId: string | null;
  chapterTitle?: string;
  onClose: () => void;
  getCurrentContent?: () => string;
  onCreateVersion?: () => Promise<void>;
  onRestore?: (snapshotId: number) => Promise<void>;
}

/** 格式：1月7日 19:45 */
function formatDateShort(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** 分组用：1月 */
function formatMonth(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: 'numeric' }) + '月';
  } catch {
    return '';
  }
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="chapter-history-diff">
      {lines.map((line, idx) => (
        <div key={idx} className={`chapter-history-diff-line ${line.type}`}>
          <span className="chapter-history-diff-prefix">
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          <span className="chapter-history-diff-text">{line.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChapterHistoryModal({
  isOpen,
  chapterId,
  onClose,
  getCurrentContent,
  onCreateVersion,
  onRestore,
}: ChapterHistoryModalProps) {
  const [snapshots, setSnapshots] = useState<YjsSnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [diffLinesState, setDiffLinesState] = useState<DiffLine[] | null>(null);
  const [versionTextState, setVersionTextState] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [showChanges, setShowChanges] = useState(true);

  const getCurrentContentRef = useRef(getCurrentContent);
  getCurrentContentRef.current = getCurrentContent;
  const loadingSnapshotIdRef = useRef<number | null>(null);

  const loadSnapshots = useCallback(() => {
    if (!chapterId) return;
    const id = parseInt(chapterId, 10);
    if (Number.isNaN(id)) return;
    setLoading(true);
    chaptersApi
      .listYjsSnapshots(id, 1, 50)
      .then((res) => setSnapshots(res.snapshots || []))
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [chapterId]);

  useEffect(() => {
    if (!isOpen || !chapterId) {
      setSnapshots([]);
      setSelectedId(null);
      setDiffLinesState(null);
      return;
    }
    loadSnapshots();
  }, [isOpen, chapterId, loadSnapshots]);

  const selectedIndex = selectedId != null ? snapshots.findIndex((s) => s.id === selectedId) : -1;
  const currentPosition = selectedIndex >= 0 ? selectedIndex + 1 : 0;
  const totalCount = snapshots.length;

  const loadDiffFor = useCallback(async (snapshotId: number) => {
    const id = chapterId ? parseInt(chapterId, 10) : NaN;
    if (!chapterId || Number.isNaN(id)) return;
    const getCurrent = getCurrentContentRef.current;
    if (!getCurrent) return;
    loadingSnapshotIdRef.current = snapshotId;
    setDiffLoading(true);
    setDiffLinesState(null);
    setVersionTextState(null);
    try {
      const data = await chaptersApi.getYjsSnapshot(id, snapshotId);
      if (loadingSnapshotIdRef.current !== snapshotId) return;
      const versionJson = getContentJSONFromYjsSnapshotBase64(data.snapshot);
      const versionText = getTextFromProsemirrorJSON(versionJson);
      setVersionTextState(versionText);
      const currentText = getCurrent();
      setDiffLinesState(diffLines(versionText, currentText));
    } catch {
      if (loadingSnapshotIdRef.current !== snapshotId) return;
      setDiffLinesState([]);
      setVersionTextState(null);
    } finally {
      if (loadingSnapshotIdRef.current === snapshotId) {
        loadingSnapshotIdRef.current = null;
        setDiffLoading(false);
      }
    }
  }, [chapterId]);

  useEffect(() => {
    if (selectedId != null) loadDiffFor(selectedId);
    else {
      setDiffLinesState(null);
      setVersionTextState(null);
      loadingSnapshotIdRef.current = null;
    }
  }, [selectedId, loadDiffFor]);

  const handleCreateVersion = async () => {
    if (!onCreateVersion) return;
    setCreating(true);
    try {
      await onCreateVersion();
      loadSnapshots();
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async () => {
    if (selectedId == null || !onRestore) return;
    setRestoringId(selectedId);
    try {
      await onRestore(selectedId);
      onClose();
    } finally {
      setRestoringId(null);
    }
  };

  const goPrev = () => {
    if (selectedIndex <= 0) return;
    setSelectedId(snapshots[selectedIndex - 1].id);
  };

  const goNext = () => {
    if (selectedIndex < 0 || selectedIndex >= snapshots.length - 1) return;
    setSelectedId(snapshots[selectedIndex + 1].id);
  };

  const groupedByMonth = (() => {
    const map = new Map<string, YjsSnapshotMeta[]>();
    snapshots.forEach((s) => {
      const key = formatMonth(s.created_at) || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries());
  })();

  if (!isOpen) return null;

  return (
    <div className="chapter-history-overlay" onClick={onClose}>
      <div className="chapter-history-modal chapter-history-modal--doc-style" onClick={(e) => e.stopPropagation()}>
        {/* 顶部栏 */}
        <div className="chapter-history-topbar">
          <button type="button" className="chapter-history-back-doc" onClick={onClose}>
            <ArrowLeft size={18} />
            返回文档
          </button>
          <div className="chapter-history-topbar-center">
            {selectedId != null && onRestore && (
              <button
                type="button"
                className="chapter-history-restore-primary"
                onClick={handleRestore}
                disabled={restoringId !== null}
              >
                还原此历史记录
              </button>
            )}
            {totalCount > 0 && selectedId != null && (
              <span className="chapter-history-edit-record">
                编辑记录 {currentPosition}/{totalCount}
              </span>
            )}
            {totalCount > 0 && selectedId != null && (
              <div className="chapter-history-nav">
                <button
                  type="button"
                  className="chapter-history-nav-btn"
                  onClick={goPrev}
                  disabled={selectedIndex <= 0}
                  aria-label="上一项"
                >
                  <ChevronLeft size={18} />
                  上一项
                </button>
                <button
                  type="button"
                  className="chapter-history-nav-btn"
                  onClick={goNext}
                  disabled={selectedIndex < 0 || selectedIndex >= totalCount - 1}
                  aria-label="下一项"
                >
                  下一项
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
          <div className="chapter-history-topbar-right">
            <span className="chapter-history-topbar-title">历史记录</span>
            <Info size={14} className="chapter-history-info-icon" aria-hidden />
          </div>
        </div>

        {/* 主体：左侧内容 + 右侧列表 */}
        <div className="chapter-history-main">
          <div className="chapter-history-content">
            {selectedId == null ? (
              <p className="chapter-history-placeholder">
                在右侧选择一条历史记录可查看与当前内容的差异。
              </p>
            ) : diffLoading ? (
              <div className="chapter-history-loading">
                <LoadingSpinner />
              </div>
            ) : !showChanges ? (
              versionTextState != null ? (
                <div className="chapter-history-version-content">
                  {versionTextState || <span className="chapter-history-empty-inline">（该版本无正文）</span>}
                </div>
              ) : (
                <p className="chapter-history-placeholder">加载中…</p>
              )
            ) : diffLinesState && diffLinesState.length > 0 ? (
              <div className="chapter-history-diff-wrap">
                <DiffView lines={diffLinesState} />
              </div>
            ) : diffLinesState ? (
              <p className="chapter-history-empty">当前内容与该版本一致，无差异。</p>
            ) : null}
          </div>

          <aside className="chapter-history-sidebar">
            <div className="chapter-history-sidebar-header">
              <h3 className="chapter-history-sidebar-title">历史记录</h3>
              {onCreateVersion && (
                <button
                  type="button"
                  className="chapter-history-create-btn"
                  onClick={handleCreateVersion}
                  disabled={creating}
                >
                  <Plus size={14} />
                  {creating ? '创建中…' : '创建版本'}
                </button>
              )}
            </div>
            {loading ? (
              <div className="chapter-history-loading">
                <LoadingSpinner />
              </div>
            ) : groupedByMonth.length === 0 ? (
              <p className="chapter-history-empty">暂无历史版本。</p>
            ) : (
              <div className="chapter-history-groups">
                {groupedByMonth.map(([monthLabel, items]) => (
                  <div key={monthLabel} className="chapter-history-group">
                    <div className="chapter-history-group-label">{monthLabel}</div>
                    <ul className="chapter-history-list">
                      {items.map((s) => {
                        const globalIndex = snapshots.findIndex((x) => x.id === s.id);
                        const isFirst = globalIndex === 0;
                        const isLast = globalIndex === snapshots.length - 1;
                        const desc = s.label || (isFirst ? '最近更新' : isLast ? '创建了文档' : '');
                        const isSelected = s.id === selectedId;
                        return (
                          <li
                            key={s.id}
                            className={`chapter-history-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedId(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedId(s.id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <span className="chapter-history-item-time">{formatDateShort(s.created_at)}</span>
                            {desc && <span className="chapter-history-item-desc">{desc}</span>}
                            <span className="chapter-history-item-meta">· 本章</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>

        {/* 底部：显示更改开关 */}
        {selectedId != null && (
          <div className="chapter-history-footer">
            <label className="chapter-history-toggle-label">
              <span>显示更改</span>
              <button
                type="button"
                role="switch"
                aria-checked={showChanges}
                className={`chapter-history-toggle ${showChanges ? 'on' : ''}`}
                onClick={() => setShowChanges((v) => !v)}
              >
                <span className="chapter-history-toggle-thumb" />
              </button>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
