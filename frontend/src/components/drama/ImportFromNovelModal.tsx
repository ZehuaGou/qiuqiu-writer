/**
 * 从小说导入到剧本的弹窗
 * 流程：选择小说 → 预览角色/章节 → AI转换导入
 */
import { useState, useEffect } from 'react';
import { X, BookOpen, Search, ChevronRight, Users, Layers, Check, AlertCircle, Loader, Sparkles } from 'lucide-react';
import { worksApi, type Work } from '../../utils/worksApi';
import { chaptersApi, type Chapter } from '../../utils/chaptersApi';
import { dramaChatComplete } from '../../utils/dramaApi';
import type { DramaCharacter, DramaEpisode, DramaMeta } from './dramaTypes';
import './ImportFromNovelModal.css';

interface ImportFromNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (patch: Partial<DramaMeta>) => void;
  workId?: string | null;
}

type Step = 'select' | 'preview' | 'importing';

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ImportFromNovelModal({ isOpen, onClose, onImport, workId }: ImportFromNovelModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [novels, setNovels] = useState<Work[]>([]);
  const [loadingNovels, setLoadingNovels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNovel, setSelectedNovel] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<number>>(new Set());
  const [importCharacters, setImportCharacters] = useState(true);
  const [error, setError] = useState('');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, title: '' });

  // 加载小说列表
  useEffect(() => {
    if (!isOpen) return;
    setStep('select');
    setSelectedNovel(null);
    setChapters([]);
    setError('');
    setSearchQuery('');

    setLoadingNovels(true);
    worksApi.listWorks({ work_type: 'long', size: 100 })
      .then(res => setNovels(res.works))
      .catch(() => setError('加载小说列表失败'))
      .finally(() => setLoadingNovels(false));
  }, [isOpen]);

  // 选择小说后加载章节
  const handleSelectNovel = async (novel: Work) => {
    setSelectedNovel(novel);
    setStep('preview');
    setLoadingChapters(true);
    setError('');
    try {
      // 分页拉取全部章节（后端 size 上限 100）
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
      // 默认全选
      setSelectedChapterIds(new Set(allChapters.map(c => c.id)));
    } catch {
      setError('加载章节失败，请重试');
    } finally {
      setLoadingChapters(false);
    }
  };

  const toggleChapter = (id: number) => {
    setSelectedChapterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllChapters = () => {
    if (selectedChapterIds.size === chapters.length) {
      setSelectedChapterIds(new Set());
    } else {
      setSelectedChapterIds(new Set(chapters.map(c => c.id)));
    }
  };

  // 从小说 metadata 提取角色
  const extractCharacters = (novel: Work): DramaCharacter[] => {
    const rawChars = novel.metadata?.characters || [];
    return rawChars.map((c, i) => ({
      id: genId(),
      name: (c.display_name as string) || (c.name as string) || `角色${i + 1}`,
      role: (c.role as string) || (i === 0 ? '主角' : '配角'),
      description: (c.description as string) || '',
      appearance: (c.appearance as string) || '',
      personality: (c.personality as string) || '',
    }));
  };

  const handleConfirmImport = async () => {
    if (!selectedNovel) return;
    setStep('importing');
    setError('');

    const selectedChapters = chapters.filter(c => selectedChapterIds.has(c.id));
    setImportProgress({ current: 0, total: selectedChapters.length, title: '' });

    // 并发拉取每章正文内容
    const contentMap = new Map<number, string>();
    await Promise.allSettled(
      selectedChapters.map(async (ch) => {
        try {
          const doc = await chaptersApi.getChapterDocument(ch.id);
          if (doc.content) contentMap.set(ch.id, doc.content);
        } catch { /* 忽略单章拉取失败 */ }
      })
    );

    // 逐章调用 AI 转换为剧情简介
    const episodes: DramaEpisode[] = [];
    for (let i = 0; i < selectedChapters.length; i++) {
      const ch = selectedChapters[i];
      setImportProgress({ current: i + 1, total: selectedChapters.length, title: ch.title });

      const chapterContent = contentMap.get(ch.id) || (ch.metadata?.outline as string) || '';
      let synopsis = chapterContent; // 默认用原文

      if (chapterContent && workId) {
        const prompt = [
          `请将以下小说章节内容转换为剧本集数的剧情简介（100-200字），要求：`,
          `1. 保留核心情节和关键冲突`,
          `2. 语言简洁，适合剧本创作参考`,
          `3. 直接输出简介内容，不要标题或说明`,
          `\n章节标题：${ch.title}`,
          `\n章节内容：\n${chapterContent.slice(0, 3000)}`,
        ].join('\n');

        try {
          const result = await dramaChatComplete(prompt, workId);
          if (result.trim()) synopsis = result.trim();
        } catch {
          // AI 失败时保留原文内容
        }
      }

      episodes.push({
        id: genId(),
        number: i + 1,
        title: ch.title || `第${i + 1}集`,
        synopsis,
        script: '',
        scenes: [],
        sourceChapterId: ch.id,
        sourceChapterTitle: ch.title,
      });
    }

    const characters = importCharacters ? extractCharacters(selectedNovel) : [];
    let extractedOutline = selectedNovel.description || '';
    let extractedCharacters = characters;

    // AI 提取角色和大纲
    if (workId && selectedChapters.length > 0) {
      setImportProgress({ current: selectedChapters.length, total: selectedChapters.length, title: '正在提取大纲与角色...' });
      
      // 聚合小说内容，取前 8000 字用于提取
      let combinedContent = '';
      for (const ch of selectedChapters) {
        if (combinedContent.length > 8000) break;
        const content = contentMap.get(ch.id) || '';
        if (content) {
          combinedContent += `\n【${ch.title}】\n${content}\n`;
        }
      }
      
      if (combinedContent) {
        const prompt = [
          `请根据以下小说内容，提取出剧本的整体大纲（约300字），以及出场的主要角色列表。`,
          `要求：严格返回 JSON 格式，不要包含任何额外的 Markdown 标记或其他文本。`,
          `JSON 格式如下：`,
          `{`,
          `  "outline": "大纲内容",`,
          `  "characters": [`,
          `    { "name": "角色名", "role": "角色身份(如男主/反派)", "description": "简短描述", "appearance": "外貌特征", "personality": "性格特点" }`,
          `  ]`,
          `}`,
          `\n小说内容：\n${combinedContent.slice(0, 8000)}`
        ].join('\n');

        try {
          const result = await dramaChatComplete(prompt, workId, {
            systemPrompt: '你是一个专业的剧本大纲和角色提取助手。请只输出合法的JSON对象，不要任何Markdown标记。'
          });
          
          let jsonStr = result.trim();
          const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            jsonStr = jsonMatch[1].trim();
          } else {
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }
          }
          
          const parsed = JSON.parse(jsonStr);
          if (parsed.outline) {
            extractedOutline = parsed.outline;
          }
          if (importCharacters && Array.isArray(parsed.characters) && parsed.characters.length > 0) {
            extractedCharacters = parsed.characters.map((c: Record<string, string>) => ({
              id: genId(),
              name: c.name || '未知角色',
              role: c.role || '配角',
              description: c.description || '',
              appearance: c.appearance || '',
              personality: c.personality || ''
            }));
          }
        } catch (e) {
          console.error('Failed to extract outline and characters:', e);
          // 失败时回退到默认的描述和元数据中的角色
        }
      }
    }

    const patch: Partial<DramaMeta> = {
      episodes,
      ...(extractedCharacters.length > 0 ? { characters: extractedCharacters } : {}),
      outline: extractedOutline,
      sourceNovelId: selectedNovel.id,
      sourceNovelTitle: selectedNovel.title,
    };

    onImport(patch);
    onClose();
  };

  const filteredNovels = novels.filter(n =>
    !searchQuery || (n.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const novelCharacters = selectedNovel ? extractCharacters(selectedNovel) : [];

  if (!isOpen) return null;

  return (
    <div className="import-modal-overlay" onClick={onClose}>
      <div className="import-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="import-modal-header">
          <div className="import-modal-title-group">
            <BookOpen size={18} className="import-modal-icon" />
            <h2 className="import-modal-title">
              {step === 'select' ? '选择小说' : step === 'preview' ? `导入「${selectedNovel?.title}」` : '导入中...'}
            </h2>
          </div>
          <button className="import-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="import-steps">
          <div className={`import-step ${step === 'select' ? 'active' : 'done'}`}>
            <div className="import-step-dot">{step !== 'select' ? <Check size={10} /> : '1'}</div>
            <span>选择小说</span>
          </div>
          <div className="import-step-line" />
          <div className={`import-step ${step === 'preview' || step === 'importing' ? 'active' : ''}`}>
            <div className="import-step-dot">2</div>
            <span>预览内容</span>
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
                          {novel.metadata?.characters && (
                            <span>· {(novel.metadata.characters as unknown[]).length} 个角色</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="import-novel-arrow" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: 预览 */}
          {step === 'preview' && selectedNovel && (
            <div className="import-preview-step">
              {loadingChapters ? (
                <div className="import-loading">
                  <Loader size={20} className="spin" />
                  <span>加载章节中...</span>
                </div>
              ) : (
                <>
                  {/* 角色导入选项 */}
                  {novelCharacters.length > 0 && (
                    <div className="import-section">
                      <div className="import-section-header">
                        <div className="import-section-title">
                          <Users size={15} />
                          <span>角色 ({novelCharacters.length})</span>
                        </div>
                        <label className="import-toggle">
                          <input
                            type="checkbox"
                            checked={importCharacters}
                            onChange={e => setImportCharacters(e.target.checked)}
                          />
                          <span>导入角色</span>
                        </label>
                      </div>
                      {importCharacters && (
                        <div className="import-char-preview">
                          {novelCharacters.slice(0, 6).map(c => (
                            <div key={c.id} className="import-char-chip">
                              <div className="import-char-avatar">{c.name.slice(0, 1)}</div>
                              <span>{c.name}</span>
                              <span className="import-char-role">{c.role}</span>
                            </div>
                          ))}
                          {novelCharacters.length > 6 && (
                            <span className="import-more">+{novelCharacters.length - 6} 个</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 章节选择 */}
                  <div className="import-section">
                    <div className="import-section-header">
                      <div className="import-section-title">
                        <Layers size={15} />
                        <span>章节转集数</span>
                      </div>
                      <button className="import-select-all" onClick={toggleAllChapters}>
                        {selectedChapterIds.size === chapters.length ? '取消全选' : '全选'}
                        <span className="import-select-count">
                          {selectedChapterIds.size}/{chapters.length}
                        </span>
                      </button>
                    </div>

                    <div className="import-chapter-list">
                      {chapters.map((ch, i) => (
                        <label key={ch.id} className="import-chapter-item">
                          <input
                            type="checkbox"
                            checked={selectedChapterIds.has(ch.id)}
                            onChange={() => toggleChapter(ch.id)}
                          />
                          <span className="import-chapter-num">{i + 1}</span>
                          <span className="import-chapter-title">{ch.title}</span>
                          {ch.metadata?.outline && (
                            <span className="import-chapter-has-outline" title="有大纲">✓</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>

                  {selectedChapterIds.size === 0 && (
                    <p className="import-warn">请至少选择一个章节</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: 导入中 */}
          {step === 'importing' && (
            <div className="import-loading import-loading-center">
              <Loader size={28} className="spin" />
              {importProgress.total > 0 ? (
                <>
                  <p>AI 转换中 {importProgress.current}/{importProgress.total}</p>
                  {importProgress.title && (
                    <p className="import-progress-title">「{importProgress.title}」</p>
                  )}
                  <div className="import-progress-bar">
                    <div
                      className="import-progress-fill"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <p>正在准备...</p>
              )}
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
              disabled={selectedChapterIds.size === 0}
            >
              <Sparkles size={14} />
              AI 转换 {selectedChapterIds.size} 集
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
