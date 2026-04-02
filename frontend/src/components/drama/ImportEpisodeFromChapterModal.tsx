/**
 * 新建集时从小说章节导入
 * 流程：选择小说 → 选择单章节（单选）→ AI 转换为剧情简介
 */
import { useState, useEffect } from 'react';
import { X, BookOpen, Search, ChevronRight, Layers, Check, AlertCircle, Loader, Sparkles } from 'lucide-react';
import { worksApi, type Work } from '../../utils/worksApi';
import { chaptersApi, type Chapter } from '../../utils/chaptersApi';
import { dramaChatComplete } from '../../utils/dramaApi';
import type { DramaEpisode } from './dramaTypes';
import './ImportFromNovelModal.css';

interface ImportEpisodeFromChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (patch: Partial<DramaEpisode>) => void;
  workId?: string | null;
  episodeNumber: number;
}

type Step = 'select' | 'preview' | 'importing';

function buildSynopsisFallback(rawContent: string, title: string): string {
  const plain = rawContent
    .replace(/\s+/g, ' ')
    .replace(/[【】[\]<>]/g, ' ')
    .trim();
  if (!plain) return `${title}：请根据原章节内容补充剧情简介。`;
  return plain.length > 220 ? `${plain.slice(0, 220)}...` : plain;
}

export default function ImportEpisodeFromChapterModal({
  isOpen,
  onClose,
  onImport,
  workId,
  episodeNumber,
}: ImportEpisodeFromChapterModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [novels, setNovels] = useState<Work[]>([]);
  const [loadingNovels, setLoadingNovels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNovel, setSelectedNovel] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [importingTitle, setImportingTitle] = useState('');

  // 打开时初始化
  useEffect(() => {
    if (!isOpen) return;
    setStep('select');
    setSelectedNovel(null);
    setChapters([]);
    setSelectedChapterId(null);
    setError('');
    setSearchQuery('');

    setLoadingNovels(true);
    worksApi.listWorks({ work_type: 'long', size: 100 })
      .then(res => setNovels(res.works))
      .catch(() => setError('加载小说列表失败'))
      .finally(() => setLoadingNovels(false));
  }, [isOpen]);

  const handleSelectNovel = async (novel: Work) => {
    setSelectedNovel(novel);
    setStep('preview');
    setLoadingChapters(true);
    setError('');
    try {
      let allChapters: Chapter[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await chaptersApi.listChapters({
          work_id: novel.id,
          page,
          size: 100,
          sort_by: 'chapter_number',
          sort_order: 'asc',
          skipCache: true,
        });
        allChapters = [...allChapters, ...res.chapters];
        hasMore = res.chapters.length === 100;
        page++;
      }
      setChapters(allChapters);
    } catch {
      setError('加载章节失败，请重试');
    } finally {
      setLoadingChapters(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedNovel || selectedChapterId === null) return;
    const ch = chapters.find(c => c.id === selectedChapterId);
    if (!ch) return;

    setStep('importing');
    setImportingTitle(ch.title);
    setError('');

    let chapterContent = '';
    try {
      const doc = await chaptersApi.getChapterDocument(ch.id);
      if (doc.content) chapterContent = doc.content;
    } catch { /* 忽略内容拉取失败，回退到 outline */ }

    const rawContent = chapterContent || ch.content || (ch.metadata?.outline as string) || '';
    let synopsis = buildSynopsisFallback(rawContent, ch.title || `第${episodeNumber}集`);

    if (rawContent && workId) {
      const prompt = [
        `请将以下小说章节内容转换为剧本集数的剧情简介（100-200字），要求：`,
        `1. 保留核心情节和关键冲突`,
        `2. 语言简洁，适合剧本创作参考`,
        `3. 直接输出简介内容，不要标题或说明`,
        `\n章节标题：${ch.title}`,
        `\n章节内容：\n${rawContent.slice(0, 3000)}`,
      ].join('\n');

      try {
        const result = await dramaChatComplete(prompt, workId);
        if (result.trim()) synopsis = result.trim();
      } catch { /* AI 失败时保留原文 */ }
    }

    const patch: Partial<DramaEpisode> = {
      title: ch.title || `第${episodeNumber}集`,
      synopsis,
      sourceChapterId: ch.id,
      sourceChapterTitle: ch.title,
    };

    onImport(patch);
    onClose();
  };

  const filteredNovels = novels.filter(n =>
    !searchQuery || (n.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="import-modal-overlay" onClick={onClose}>
      <div className="import-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="import-modal-header">
          <div className="import-modal-title-group">
            <BookOpen size={18} className="import-modal-icon" />
            <h2 className="import-modal-title">
              {step === 'select'
                ? `新建第${episodeNumber}集 · 从小说导入`
                : step === 'preview'
                ? `选择章节 · 「${selectedNovel?.title}」`
                : 'AI 转换中...'}
            </h2>
          </div>
          <button className="import-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Steps */}
        <div className="import-steps">
          <div className={`import-step ${step === 'select' ? 'active' : 'done'}`}>
            <div className="import-step-dot">{step !== 'select' ? <Check size={10} /> : '1'}</div>
            <span>选择小说</span>
          </div>
          <div className="import-step-line" />
          <div className={`import-step ${step === 'preview' || step === 'importing' ? 'active' : ''}`}>
            <div className="import-step-dot">{step === 'importing' ? <Check size={10} /> : '2'}</div>
            <span>选择章节</span>
          </div>
          <div className="import-step-line" />
          <div className={`import-step ${step === 'importing' ? 'active' : ''}`}>
            <div className="import-step-dot">3</div>
            <span>完成导入</span>
          </div>
        </div>

        {/* Body */}
        <div className="import-modal-body">
          {error && (
            <div className="import-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Step 1: 选择小说 */}
          {step === 'select' && (
            <div className="import-select-step">
              <div className="import-search-bar">
                <Search size={14} className="import-search-icon" />
                <input
                  className="import-search-input"
                  placeholder="搜索小说..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {loadingNovels ? (
                <div className="import-loading">
                  <Loader size={20} className="spin" />
                  <span>加载中...</span>
                </div>
              ) : filteredNovels.length === 0 ? (
                <div className="import-empty">
                  <BookOpen size={32} />
                  <p>{searchQuery ? '没有找到匹配的小说' : '还没有小说作品'}</p>
                </div>
              ) : (
                <div className="import-novel-list">
                  {filteredNovels.map(novel => (
                    <button
                      key={novel.id}
                      className="import-novel-item"
                      onClick={() => handleSelectNovel(novel)}
                    >
                      <div className="import-novel-cover">
                        {novel.cover_image
                          ? <img src={novel.cover_image} alt={novel.title} />
                          : <BookOpen size={20} />
                        }
                      </div>
                      <div className="import-novel-info">
                        <span className="import-novel-title">{novel.title}</span>
                        <div className="import-novel-meta">
                          <span>{novel.word_count?.toLocaleString() || 0} 字</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="import-novel-arrow" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: 选择章节（单选） */}
          {step === 'preview' && selectedNovel && (
            <div className="import-preview-step">
              {loadingChapters ? (
                <div className="import-loading">
                  <Loader size={20} className="spin" />
                  <span>加载章节中...</span>
                </div>
              ) : (
                <div className="import-section">
                  <div className="import-section-header">
                    <div className="import-section-title">
                      <Layers size={15} />
                      <span>选择一个章节作为本集内容（{chapters.length} 章）</span>
                    </div>
                  </div>
                  {chapters.length === 0 ? (
                    <div className="import-empty">
                      <p>该小说暂无章节</p>
                    </div>
                  ) : (
                    <div className="import-chapter-list">
                      {chapters.map((ch, i) => (
                        <label key={ch.id} className="import-chapter-item">
                          <input
                            type="radio"
                            name="episode-chapter"
                            checked={selectedChapterId === ch.id}
                            onChange={() => setSelectedChapterId(ch.id)}
                          />
                          <span className="import-chapter-num">{i + 1}</span>
                          <span className="import-chapter-title">{ch.title}</span>
                          {ch.metadata?.outline && (
                            <span className="import-chapter-has-outline" title="有大纲">✓</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: 转换中 */}
          {step === 'importing' && (
            <div className="import-loading import-loading-center">
              <Loader size={28} className="spin" />
              <p>AI 正在转换「{importingTitle}」</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>将章节内容转为剧情简介...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && !loadingChapters && (
          <div className="import-modal-footer">
            <button className="import-btn-secondary" onClick={() => setStep('select')}>
              返回
            </button>
            <button
              className="import-btn-primary"
              onClick={handleConfirmImport}
              disabled={selectedChapterId === null}
            >
              <Sparkles size={14} />
              AI 转换导入
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
