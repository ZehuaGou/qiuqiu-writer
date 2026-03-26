import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, ChevronDown, Menu, X, Wifi, WifiOff } from 'lucide-react';
import ScriptSideNav, { type ScriptNavItem, type ScriptEpisode } from '../components/editor/ScriptSideNav';
import TagsManager from '../components/editor/TagsManager';
import ChapterOutline from '../components/editor/ChapterOutline';
import ScriptCharacters from '../components/editor/ScriptCharacters';
import ScriptEditor from '../components/editor/ScriptEditor';
import WorkInfoManager from '../components/editor/WorkInfoManager';
import CollabAIPanel from '../components/editor/CollabAIPanel';
import ShareWorkModal from '../components/ShareWorkModal';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useYjsEditor } from '../hooks/useYjsEditor';
import { chaptersApi, type Chapter } from '../utils/chaptersApi';
import { worksApi, type Work } from '../utils/worksApi';
import type { WorkData } from '../components/editor/work-info/types';
import './ScriptEditorPage.css';

export default function ScriptEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workId = searchParams.get('workId');
  const isMobile = useIsMobile();
  const [activeNav, setActiveNav] = useState<ScriptNavItem>('work-info');
  const [scriptName, setScriptName] = useState('新剧本');
  const [work, setWork] = useState<Work | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [isEpisodeEditorOpen, setIsEpisodeEditorOpen] = useState(false);
  const [episodes, setEpisodes] = useState<Chapter[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [totalWordCount, setTotalWordCount] = useState(0);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // 加载作品信息
  useEffect(() => {
    if (!workId) return;
    worksApi.getWork(workId).then((w) => {
      setWork(w);
      setScriptName(w.title);
      setTotalWordCount(w.word_count ?? 0);
    }).catch(() => {});
  }, [workId]);

  // 加载剧集（章节）列表
  useEffect(() => {
    if (!workId) return;
    chaptersApi.listChapters({ work_id: workId }).then((data) => {
      const list = data.chapters;
      setEpisodes(list);
      if (list.length > 0 && selectedEpisode === null) {
        setSelectedEpisode(list[0].id);
      }
    }).catch(() => {});
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 新增剧集
  const handleAddEpisode = useCallback(async () => {
    if (!workId) return;
    try {
      const newEp = await chaptersApi.createChapter({
        work_id: workId,
        title: `第${episodes.length + 1}集`,
        chapter_number: episodes.length + 1,
      });
      setEpisodes((prev) => [...prev, newEp]);
      setSelectedEpisode(newEp.id);
      setIsEpisodeEditorOpen(true);
    } catch {
      // ignore
    }
  }, [workId, episodes.length]);

  // Yjs 协作编辑器（按当前剧集连接）
  const documentId =
    workId && selectedEpisode !== null
      ? `work_${workId}_chapter_${selectedEpisode}`
      : '';

  const { editor, connectionStatus } = useYjsEditor({
    documentId,
    placeholder: '开始编写剧本...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
    editable: !!documentId,
    onUpdate: (html) => {
      // 更新本地字数显示
      const text = html.replace(/<[^>]+>/g, '');
      const matches = text.match(/[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g);
      setTotalWordCount(matches?.length ?? 0);
    },
  });

  // 将章节列表转换为 ScriptEpisode 格式
  const episodeList: ScriptEpisode[] = episodes.map((ch) => ({
    id: ch.id,
    title: ch.title,
    word_count: ch.word_count ?? 0,
  }));

  // 当前选中剧集的章节 ID（用于 CollabAIPanel）
  const currentChapterId = selectedEpisode ?? undefined;

  const connIcon =
    connectionStatus === 'connected' ? (
      <Wifi size={12} style={{ color: 'var(--color-success, #52c41a)' }} />
    ) : connectionStatus === 'connecting' ? (
      <Wifi size={12} style={{ opacity: 0.5 }} />
    ) : (
      <WifiOff size={12} style={{ opacity: 0.4 }} />
    );

  return (
    <div className="script-editor-page">
      {/* 移动端菜单抽屉 */}
      {isMobile && mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <h2>菜单</h2>
              <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="mobile-menu-content">
              <ScriptSideNav
                activeNav={activeNav}
                onNavChange={(nav) => {
                  setActiveNav(nav);
                  if (nav === 'work-info') setIsEpisodeEditorOpen(false);
                  setMobileMenuOpen(false);
                }}
                selectedEpisode={selectedEpisode}
                onEpisodeSelect={(ep) => {
                  setSelectedEpisode(ep);
                  setIsEpisodeEditorOpen(true);
                  setMobileMenuOpen(false);
                }}
                episodes={episodeList}
                onAddEpisode={handleAddEpisode}
              />
            </div>
          </div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <header className="script-editor-header">
        <div className="header-left">
          {/* 移动端菜单按钮 */}
          {isMobile && (
            <button
              className="btn btn-text mobile-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          )}
          <button className="btn btn-text" onClick={() => navigate('/script')}>
            <ArrowLeft size={16} />
            {!isMobile && <span>退出</span>}
          </button>
          <div className="work-info">
            <input
              type="text"
              className="script-name-input"
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              placeholder="请输入剧本名称"
            />
            {!isMobile && (
              <div className="work-tags">
                <span className="status-tag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {connIcon}
                  {connectionStatus === 'connected'
                    ? '协作中'
                    : connectionStatus === 'connecting'
                    ? '连接中...'
                    : '已保存'}
                </span>
                <span className="word-count-tag">
                  总字数: {totalWordCount}
                  <Info size={12} />
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <div className="header-actions">
            {!isMobile && (
              <button className="btn btn-text">
                <span>皮肤:</span>
                <ChevronDown size={14} />
              </button>
            )}
            {!isMobile && <button className="btn btn-secondary btn-sm">替换</button>}
            {!isMobile && <button className="btn btn-secondary btn-sm">回收站</button>}
            <button className="btn btn-secondary btn-sm" onClick={() => setShareModalOpen(true)}>分享</button>
          </div>
        </div>
      </header>

      <div className="script-editor-body">
        {/* 左侧边栏 */}
        {!isMobile && (
          <ScriptSideNav
            activeNav={activeNav}
            onNavChange={(nav) => {
              setActiveNav(nav);
              if (nav === 'work-info') setIsEpisodeEditorOpen(false);
            }}
            selectedEpisode={selectedEpisode}
            onEpisodeSelect={(ep) => {
              setSelectedEpisode(ep);
              setIsEpisodeEditorOpen(true);
            }}
            episodes={episodeList}
            onAddEpisode={handleAddEpisode}
          />
        )}

        {/* 主编辑区 */}
        <div className="script-editor-main">
          {/* 根据导航项显示不同内容 */}
          {!isEpisodeEditorOpen && activeNav === 'tags' && <TagsManager />}
          {!isEpisodeEditorOpen && activeNav === 'outline' && <ChapterOutline volumes={[]} />}
          {!isEpisodeEditorOpen && activeNav === 'characters' && <ScriptCharacters />}
          {!isEpisodeEditorOpen && activeNav === 'work-info' && (
            <div className="work-info-panel-wrapper">
              <WorkInfoManager
                workId={workId}
                workData={work ? { metadata: { ...(work.metadata || {}) } } as WorkData : undefined}
              />
            </div>
          )}
          {isEpisodeEditorOpen && selectedEpisode !== null && (
            <ScriptEditor editor={editor} />
          )}
        </div>

        {/* 右侧边栏：协作AI面板 */}
        {!isMobile && workId && (
          <CollabAIPanel
            workId={workId}
            chapters={episodeList.map((ep) => ({
              id: ep.id,
              title: ep.title,
            }))}
            currentChapterId={currentChapterId}
          />
        )}
        {/* 无 workId 时退化为单用户 AI 助手 */}
        {!isMobile && !workId && (
          <div className="placeholder-content" style={{ width: 280 }}>
            <p>请先创建剧本以使用协作功能</p>
          </div>
        )}
      </div>

      <ShareWorkModal
        isOpen={shareModalOpen}
        workId={workId || ''}
        workTitle={scriptName}
        editorPath="/script/editor"
        onClose={() => setShareModalOpen(false)}
      />
    </div>
  );
}
