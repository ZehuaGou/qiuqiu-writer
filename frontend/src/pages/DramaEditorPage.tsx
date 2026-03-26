/**
 * DramaEditorPage — 剧本编辑器
 * 布局：左侧集数/角色导航 + 中间编辑区 + 右侧 AI 对话面板
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Film, Users, Layers, BookOpen, Settings, FileText,
  Plus, Trash2, Save, Sparkles, Edit2, X, Wifi, WifiOff,
  Check, Download, Video, ChevronLeft, ChevronRight as ChevronRightIcon,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Clapperboard, Play
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { worksApi, type Work } from '../utils/worksApi';
import { authApi } from '../utils/authApi';
import { chaptersApi } from '../utils/chaptersApi';
import { useYjsEditor } from '../hooks/useYjsEditor';
import { dramaChatStream, dramaChatComplete, dramaGenerateImage, dramaExtractScenes, dramaExtractCharacters, getDramaExtractOptions, type DramaExtractModelOption, type DramaSceneGenerationStyleOption } from '../utils/dramaApi';
import CollabAIPanel from '../components/editor/CollabAIPanel';
import ImportFromNovelModal from '../components/drama/ImportFromNovelModal';
import ShareWorkModal from '../components/ShareWorkModal';
import WorkInfoManager from '../components/editor/WorkInfoManager';
import ScriptEditor from '../components/editor/ScriptEditor';
import type { WorkData } from '../components/editor/work-info/types';
import type { DramaCharacter, DramaEpisode, DramaMeta } from '../components/drama/dramaTypes';
import './DramaEditorPage.css';

interface DramaScene {
  id: string;
  location: string;
  time: string;
  description: string;
}

type LeftTab = 'work-info' | 'episodes' | 'characters' | 'outline' | 'settings';
type SceneGenerationStyle = 'balanced' | 'cinematic' | 'concise' | 'detailed';

const FALLBACK_SCENE_STYLES: DramaSceneGenerationStyleOption[] = [
  { id: 'balanced', label: '平衡', description: '镜头感与信息量均衡，适合通用场景提取。' },
  { id: 'cinematic', label: '电影感', description: '强调光影、构图、镜头语言和画面张力。' },
  { id: 'concise', label: '简洁', description: '保留关键视觉要素，描述简短直接。' },
  { id: 'detailed', label: '细节丰富', description: '强化空间层次、材质、动作细节与氛围元素。' },
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function parseMeta(work: Work): DramaMeta {
  const m = work.metadata || {};
  return {
    genre: (m.genre as string) || '',
    style: (m.style as string) || '',
    totalEpisodes: (m.totalEpisodes as number) || 1,
    outline: (m.outline as string) || '',
    characters: (m.characters as unknown as DramaCharacter[]) || [],
    episodes: (m.episodes as unknown as DramaEpisode[]) || [],
    sourceNovelId: m.sourceNovelId as string | undefined,
    sourceNovelTitle: m.sourceNovelTitle as string | undefined,
  };
}

// ─── 左侧导航 ────────────────────────────────────────────────
function DramaSideNav({
  meta,
  activeEpisodeId,
  onSelectEpisode,
  activeTab,
  onTabChange,
  onAddEpisode,
  onDeleteEpisode,
  onExtractOutline,
  extractingOutline,
  onExtractCharacters,
  extractingCharacters,
  onGenerateCharacterImage,
  generatingCharacterImage,
  onSelectCharacter,
}: {
  meta: DramaMeta;
  activeEpisodeId: string | null;
  onSelectEpisode: (id: string) => void;
  activeTab: LeftTab;
  onTabChange: (t: LeftTab) => void;
  onAddEpisode: () => void;
  onDeleteEpisode: (id: string) => void;
  onExtractOutline?: () => void;
  extractingOutline?: boolean;
  onExtractCharacters?: () => void;
  extractingCharacters?: boolean;
  onGenerateCharacterImage?: (id: string) => void;
  generatingCharacterImage?: string | null;
  onSelectCharacter?: (c: DramaCharacter) => void;
}) {
  return (
    <div className="drama-sidenav">
      {/* Tab 切换 */}
      <div className="drama-sidenav-tabs">
        <button
          className={`drama-sidenav-tab ${activeTab === 'work-info' ? 'active' : ''}`}
          onClick={() => onTabChange('work-info')}
          title="作品信息"
        >
          <BookOpen size={16} />
          <span>作品</span>
        </button>
        <button
          className={`drama-sidenav-tab ${activeTab === 'episodes' ? 'active' : ''}`}
          onClick={() => onTabChange('episodes')}
          title="集数"
        >
          <Layers size={16} />
          <span>集数</span>
        </button>
        <button
          className={`drama-sidenav-tab ${activeTab === 'characters' ? 'active' : ''}`}
          onClick={() => onTabChange('characters')}
          title="角色"
        >
          <Users size={16} />
          <span>角色</span>
        </button>
        <button
          className={`drama-sidenav-tab ${activeTab === 'outline' ? 'active' : ''}`}
          onClick={() => onTabChange('outline')}
          title="大纲"
        >
          <FileText size={16} />
          <span>大纲</span>
        </button>
        <button
          className={`drama-sidenav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
          title="设置"
        >
          <Settings size={16} />
          <span>设置</span>
        </button>
      </div>

      {/* 作品信息占位（内容在主区域） */}
      {activeTab === 'work-info' && (
        <div className="drama-sidenav-content">
          <div className="drama-sidenav-empty">
            <BookOpen size={24} />
            <p>作品信息在右侧展示</p>
          </div>
        </div>
      )}

      {/* 集数列表 */}
      {activeTab === 'episodes' && (
        <div className="drama-sidenav-content">
          <div className="drama-sidenav-header">
            <span className="drama-sidenav-count">{meta.episodes.length} 集</span>
            <button className="drama-sidenav-add" onClick={onAddEpisode} title="添加集数">
              <Plus size={14} />
            </button>
          </div>
          <div className="drama-ep-nav-list">
            {meta.episodes.length === 0 ? (
              <div className="drama-sidenav-empty">
                <p>还没有集数</p>
                <button className="drama-sidenav-add-btn" onClick={onAddEpisode}>
                  <Plus size={13} /> 添加第一集
                </button>
              </div>
            ) : (
              meta.episodes.map(ep => (
                <div
                  key={ep.id}
                  className={`drama-ep-nav-item ${activeEpisodeId === ep.id ? 'active' : ''}`}
                  onClick={() => onSelectEpisode(ep.id)}
                >
                  <div className="drama-ep-nav-num">{ep.number}</div>
                  <div className="drama-ep-nav-info">
                    <span className="drama-ep-nav-title">{ep.title}</span>
                    {ep.synopsis && (
                      <span className="drama-ep-nav-synopsis">{ep.synopsis}</span>
                    )}
                  </div>
                  {ep.videoUrl && (
                    <div className="drama-ep-nav-video-dot" title="已生成视频" />
                  )}
                  <button
                    className="drama-ep-nav-delete"
                    title="删除本集"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteEpisode(ep.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 角色列表 */}
      {activeTab === 'characters' && (
        <div className="drama-sidenav-content">
          <div className="drama-sidenav-header">
            <span className="drama-sidenav-count">{meta.characters.length} 个角色</span>
            {onExtractCharacters && (
              <button 
                className="drama-sidenav-add" 
                onClick={onExtractCharacters} 
                title="从剧本/简介提取角色"
                disabled={extractingCharacters}
              >
                <Sparkles size={14} />
              </button>
            )}
          </div>
          <div className="drama-char-nav-list">
            {meta.characters.length === 0 ? (
              <div className="drama-sidenav-empty">
                <p>还没有角色</p>
                {onExtractCharacters && (
                  <button className="drama-sidenav-add-btn" onClick={onExtractCharacters} disabled={extractingCharacters}>
                    <Sparkles size={13} /> {extractingCharacters ? '提取中...' : 'AI 提取角色'}
                  </button>
                )}
              </div>
            ) : (
              meta.characters.map(c => (
                <div 
                  key={c.id} 
                  className="drama-char-nav-item"
                  onClick={() => onSelectCharacter?.(c)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="drama-char-nav-avatar-wrapper">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} className="drama-char-nav-avatar img" />
                    ) : (
                      <div className="drama-char-nav-avatar">{c.name.slice(0, 1)}</div>
                    )}
                    {onGenerateCharacterImage && (
                      <button 
                        className="drama-char-nav-avatar-btn"
                        onClick={(e) => { e.stopPropagation(); onGenerateCharacterImage(c.id); }}
                        disabled={generatingCharacterImage === c.id}
                        title="生成角色照片"
                      >
                        <Sparkles size={12} />
                      </button>
                    )}
                  </div>
                  <div className="drama-char-nav-info">
                    <span className="drama-char-nav-name">{c.name}</span>
                    <span className="drama-char-nav-role">{c.role}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 大纲 */}
      {activeTab === 'outline' && (
        <div className="drama-sidenav-content drama-sidenav-outline">
          <div className="drama-sidenav-header">
            <span className="drama-sidenav-count">故事大纲</span>
            {onExtractOutline && (
              <button 
                className="drama-sidenav-add" 
                onClick={onExtractOutline} 
                title="从剧本/简介提取大纲"
                disabled={extractingOutline}
              >
                <Sparkles size={14} />
              </button>
            )}
          </div>
          <p className="drama-outline-preview">
            {meta.outline || (
              <span className="drama-outline-empty">
                暂无大纲，在设置中填写
                {onExtractOutline && (
                  <button className="drama-sidenav-add-btn" onClick={onExtractOutline} disabled={extractingOutline} style={{ marginTop: '10px' }}>
                    <Sparkles size={13} /> {extractingOutline ? '提取中...' : 'AI 提取大纲'}
                  </button>
                )}
              </span>
            )}
          </p>
          {meta.genre && <span className="drama-outline-tag">{meta.genre}</span>}
          {meta.style && <span className="drama-outline-tag">{meta.style}</span>}
        </div>
      )}

      {/* 设置占位（内容在右侧面板） */}
      {activeTab === 'settings' && (
        <div className="drama-sidenav-content">
          <div className="drama-sidenav-empty">
            <Settings size={24} />
            <p>设置内容在右侧面板中</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 集数编辑器 ──────────────────────────────────────────────
function EpisodeEditor({
  episode,
  onChange,
  onGenerateVideo,
  generatingVideo,
  onGenerateScript,
  generatingScript,
  onGenerateScenes,
  generatingScenes,
  onGenerateSceneImage,
  generatingSceneImage,
  editor,
}: {
  episode: DramaEpisode;
  onChange: (patch: Partial<DramaEpisode>) => void;
  onGenerateVideo: (episodeId: string) => void;
  generatingVideo: string | null;
  onGenerateScript: (episodeId: string) => void;
  generatingScript: string | null;
  onGenerateScenes: (episodeId: string) => void;
  generatingScenes: string | null;
  onGenerateSceneImage?: (episodeId: string, sceneId: string) => void;
  generatingSceneImage?: string | null;
  editor?: Editor | null;
}) {
  const [tab, setTab] = useState<'synopsis' | 'script' | 'scenes' | 'video'>('synopsis');

  const addScene = () => {
    const scene: DramaScene = { id: genId(), location: '新场景', time: '白天', description: '' };
    onChange({ scenes: [...(episode.scenes || []), scene] });
  };

  const updateScene = (id: string, patch: Partial<DramaScene>) => {
    onChange({ scenes: (episode.scenes || []).map(s => s.id === id ? { ...s, ...patch } : s) });
  };

  const deleteScene = (id: string) => {
    onChange({ scenes: (episode.scenes || []).filter(s => s.id !== id) });
  };

  const isGenerating = generatingVideo === episode.id;
  const isGeneratingScript = generatingScript === episode.id;

  return (
    <div className="drama-ep-editor">
      <div className="drama-ep-editor-header">
        <div className="drama-ep-editor-title-row">
          <h2 className="drama-ep-editor-title">
            第{episode.number}集 · {episode.title}
          </h2>
          {episode.sourceChapterTitle && (
            <span className="drama-ep-source-hint">来自《{episode.sourceChapterTitle}》</span>
          )}
        </div>
        <div className="drama-ep-tabs">
          {(['synopsis', 'script', 'scenes', 'video'] as const).map(t => (
            <button
              key={t}
              className={`drama-ep-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'synopsis' ? '剧情简介' : t === 'script' ? '剧本正文' : t === 'scenes' ? '场景列表' : '视频生成'}
              {t === 'video' && episode.videoUrl && <span className="drama-ep-tab-dot" />}
            </button>
          ))}
        </div>
      </div>

      <div className="drama-ep-editor-body">
        {tab === 'synopsis' && (
          <textarea
            className="drama-textarea full"
            placeholder="这一集发生了什么？主要冲突和转折点是什么？"
            value={episode.synopsis}
            onChange={e => onChange({ synopsis: e.target.value })}
          />
        )}

        {tab === 'script' && (
          <div className="drama-script-area">
            <div className="drama-script-toolbar">
              <button
                className="drama-ai-generate-btn"
                onClick={() => onGenerateScript(episode.id)}
                disabled={isGeneratingScript || !episode.synopsis}
                title={!episode.synopsis ? '请先填写剧情简介' : 'AI 生成剧本'}
              >
                <Sparkles size={14} />
                {isGeneratingScript ? 'AI 生成中...' : 'AI 生成剧本'}
              </button>
              {!episode.synopsis && (
                <span className="drama-script-hint">需要先填写「剧情简介」</span>
              )}
            </div>
            {editor ? (
              <ScriptEditor editor={editor} />
            ) : (
              <textarea
                className="drama-textarea full script-font"
                placeholder={`INT. 场景名称 - 时间\n\n角色动作描述\n\n角色名\n台词内容\n\n...`}
                value={episode.script}
                onChange={e => onChange({ script: e.target.value })}
              />
            )}
          </div>
        )}

        {tab === 'scenes' && (
          <div className="drama-scenes-area">
            <div className="drama-scenes-toolbar">
              <button
                className="drama-ai-generate-btn"
                onClick={() => onGenerateScenes(episode.id)}
                disabled={generatingScenes === episode.id || (!episode.synopsis && !episode.script)}
                title={(!episode.synopsis && !episode.script) ? '请先填写剧情简介或剧本' : 'AI 提取场景'}
              >
                <Sparkles size={14} />
                {generatingScenes === episode.id ? 'AI 生成中...' : 'AI 提取场景'}
              </button>
              <button className="drama-add-btn" onClick={addScene}>
                <Plus size={14} /> 添加场景
              </button>
            </div>
            {(episode.scenes || []).length === 0 ? (
              <div className="drama-panel-empty"><Layers size={28} /><p>还没有场景</p></div>
            ) : (
              <div className="drama-scene-list">
                {(episode.scenes || []).map((scene, idx) => (
                  <div key={scene.id} className="drama-scene-item">
                    <div className="drama-scene-num">{idx + 1}</div>
                    <div className="drama-scene-fields">
                      <div className="drama-scene-row">
                        <input className="drama-input sm" placeholder="地点" value={scene.location}
                          onChange={e => updateScene(scene.id, { location: e.target.value })} />
                        <select className="drama-select sm" value={scene.time}
                          onChange={e => updateScene(scene.id, { time: e.target.value })}>
                          {['白天', '夜晚', '清晨', '黄昏', '室内', '室外'].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <textarea className="drama-textarea sm" placeholder="场景描述..." value={scene.description}
                        onChange={e => updateScene(scene.id, { description: e.target.value })} rows={2} />
                      {onGenerateSceneImage && (
                        <div className="drama-scene-image-wrapper">
                          {scene.imageUrl && (
                            <img src={scene.imageUrl} alt="场景图" className="drama-scene-img" />
                          )}
                          <button 
                            className="drama-scene-img-btn"
                            onClick={() => onGenerateSceneImage(episode.id, scene.id)}
                            disabled={generatingSceneImage === scene.id}
                          >
                            <Sparkles size={12} /> {generatingSceneImage === scene.id ? '生成中...' : (scene.imageUrl ? '重新生成' : '生成场景图')}
                          </button>
                        </div>
                      )}
                    </div>
                    <button className="drama-icon-btn danger" onClick={() => deleteScene(scene.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'video' && (
          <div className="drama-video-area">
            {episode.videoUrl ? (
              <div className="drama-video-player">
                <video src={episode.videoUrl} controls className="drama-video-element" />
                <div className="drama-video-actions">
                  <button className="drama-add-btn" onClick={() => onGenerateVideo(episode.id)} disabled={isGenerating}>
                    <Video size={14} /> {isGenerating ? '生成中...' : '重新生成'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="drama-video-empty">
                <div className="drama-video-empty-icon">
                  <Clapperboard size={48} />
                </div>
                <h3>生成本集视频</h3>
                <p>基于剧本正文和场景描述，使用 AI 模型生成对应视频</p>
                <div className="drama-video-requirements">
                  <div className={`drama-video-req ${episode.script ? 'met' : ''}`}>
                    <Check size={13} /> 剧本正文{episode.script ? '已填写' : '（未填写）'}
                  </div>
                  <div className={`drama-video-req ${(episode.scenes || []).length > 0 ? 'met' : ''}`}>
                    <Check size={13} /> 场景列表{(episode.scenes || []).length > 0 ? `（${episode.scenes.length} 个场景）` : '（未添加）'}
                  </div>
                </div>
                <button
                  className="drama-generate-video-btn"
                  onClick={() => onGenerateVideo(episode.id)}
                  disabled={isGenerating || !episode.script}
                >
                  {isGenerating ? (
                    <><span className="drama-spinner" /> 生成中，请稍候...</>
                  ) : (
                    <><Play size={16} /> 开始生成视频</>
                  )}
                </button>
                {!episode.script && (
                  <p className="drama-video-hint">请先在「剧本正文」tab 中填写内容</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────
export default function DramaEditorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const workId = searchParams.get('workId');

  const [work, setWork] = useState<Work | null>(null);
  const [meta, setMeta] = useState<DramaMeta>({
    genre: '', style: '', totalEpisodes: 1, outline: '', characters: [], episodes: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>('work-info');
  const [episodeChapterMap, setEpisodeChapterMap] = useState<Record<number, number>>({});
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [generatingVideo, setGeneratingVideo] = useState<string | null>(null);
  const [generatingScript, setGeneratingScript] = useState<string | null>(null);
  const [generatingScenes, setGeneratingScenes] = useState<string | null>(null);
  const [generatingCharacterImage, setGeneratingCharacterImage] = useState<string | null>(null);
  const [generatingSceneImage, setGeneratingSceneImage] = useState<string | null>(null);
  const [extractingOutline, setExtractingOutline] = useState(false);
  const [extractingCharacters, setExtractingCharacters] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [sceneExtractModalOpen, setSceneExtractModalOpen] = useState(false);
  const [sceneExtractEpisodeId, setSceneExtractEpisodeId] = useState<string | null>(null);
  const [sceneExtractModelId, setSceneExtractModelId] = useState<string>('');
  const [sceneExtractStyle, setSceneExtractStyle] = useState<SceneGenerationStyle>('balanced');
  const [sceneExtractModels, setSceneExtractModels] = useState<DramaExtractModelOption[]>([]);
  const [sceneExtractStyles, setSceneExtractStyles] = useState<DramaSceneGenerationStyleOption[]>(FALLBACK_SCENE_STYLES);
  const [loadingExtractOptions, setLoadingExtractOptions] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<DramaCharacter | null>(null);
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [editingCharacterData, setEditingCharacterData] = useState<DramaCharacter | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载作品 + 当前用户
  useEffect(() => {
    if (!workId) { navigate('/drama'); return; }
    Promise.all([
      worksApi.getWork(workId),
      authApi.getCurrentUser().catch(() => null),
    ]).then(([w, user]) => {
      setWork(w);
      const m = parseMeta(w);
      setMeta(m);
      if (m.episodes.length > 0) setActiveEpisodeId(m.episodes[0].id);
      if (user) setCurrentUserId(String(user.id));
    }).catch(() => navigate('/drama')).finally(() => setLoading(false));
  }, [workId, navigate]);

  useEffect(() => {
    let active = true;
    setLoadingExtractOptions(true);
    getDramaExtractOptions()
      .then((res) => {
        if (!active) return;
        setSceneExtractModels(res.models || []);
        const styles = Array.isArray(res.scene_generation_styles) && res.scene_generation_styles.length > 0
          ? res.scene_generation_styles
          : FALLBACK_SCENE_STYLES;
        setSceneExtractStyles(styles);
      })
      .catch(() => {
        if (!active) return;
        setSceneExtractModels([]);
        setSceneExtractStyles(FALLBACK_SCENE_STYLES);
      })
      .finally(() => {
        if (active) setLoadingExtractOptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // 按集建立 Chapter 映射（用于 Yjs 协作编辑）
  useEffect(() => {
    if (!workId || meta.episodes.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { chapters } = await chaptersApi.listChapters({ work_id: workId });
        if (cancelled) return;
        const map: Record<number, number> = {};
        for (const ch of chapters) {
          if (ch.chapter_number) map[ch.chapter_number] = ch.id;
        }
        for (const ep of meta.episodes) {
          if (!map[ep.number]) {
            const newCh = await chaptersApi.createChapter({
              work_id: workId,
              title: ep.title,
              chapter_number: ep.number,
            });
            if (cancelled) return;
            map[ep.number] = newCh.id;
          }
        }
        if (!cancelled) setEpisodeChapterMap(map);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [workId, meta.episodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动保存（防抖 1.5s）
  const scheduleSave = useCallback((newMeta: DramaMeta) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!workId) return;
      setSaving(true);
      try {
        await worksApi.updateWork(workId, { metadata: newMeta as unknown as Work['metadata'] });
        setSavedAt(new Date());
      } catch { /* ignore */ }
      finally { setSaving(false); }
    }, 1500);
  }, [workId]);

  const handleMetaChange = (patch: Partial<DramaMeta>) => {
    const updated = { ...meta, ...patch };
    setMeta(updated);
    scheduleSave(updated);
  };

  const handleEpisodeChange = (id: string, patch: Partial<DramaEpisode>) => {
    const updated = {
      ...meta,
      episodes: meta.episodes.map(e => e.id === id ? { ...e, ...patch } : e)
    };
    setMeta(updated);
    scheduleSave(updated);
  };

  const handleAddEpisode = () => {
    const num = meta.episodes.length + 1;
    const ep: DramaEpisode = {
      id: genId(), number: num, title: `第${num}集`,
      synopsis: '', script: '', scenes: []
    };
    const updated = { ...meta, episodes: [...meta.episodes, ep] };
    setMeta(updated);
    setActiveEpisodeId(ep.id);
    scheduleSave(updated);
  };

  const handleDeleteEpisode = (id: string) => {
    const remaining = meta.episodes.filter(e => e.id !== id).map((e, i) => ({ ...e, number: i + 1 }));
    const updated = { ...meta, episodes: remaining };
    setMeta(updated);
    if (activeEpisodeId === id) {
      setActiveEpisodeId(remaining.length > 0 ? remaining[0].id : null);
    }
    scheduleSave(updated);
  };

  const handleUpdateTitle = async (title: string) => {
    if (!workId) return;
    await worksApi.updateWork(workId, { title });
    setWork(prev => prev ? { ...prev, title } : prev);
  };

  const handleImport = (patch: Partial<DramaMeta>) => {
    const updated = { ...meta, ...patch };
    if (patch.episodes && patch.episodes.length > 0) {
      setActiveEpisodeId(patch.episodes[0].id);
      setLeftTab('episodes');
    }
    setMeta(updated);
    scheduleSave(updated);
  };

  const handleGenerateVideo = async (episodeId: string) => {
    // TODO: 对接视频生成模型 API
    setGeneratingVideo(episodeId);
    // 模拟生成过程（实际对接后替换）
    setTimeout(() => {
      setGeneratingVideo(null);
      alert('视频生成功能即将上线，敬请期待！');
    }, 1500);
  };

  const handleGenerateScript = async (episodeId: string) => {
    const episode = meta.episodes.find(e => e.id === episodeId);
    if (!episode || !workId) return;

    const characters = meta.characters.map(c => `${c.name}（${c.role}）`).join('、');
    const prompt = [
      `请根据以下信息，为第${episode.number}集「${episode.title}」生成专业的剧本正文。`,
      `\n剧情简介：${episode.synopsis}`,
      characters ? `\n主要角色：${characters}` : '',
      meta.outline ? `\n故事背景：${meta.outline}` : '',
      '\n\n要求：使用标准剧本格式，包含场景说明（INT./EXT.）、角色动作描述和对白。直接输出剧本内容，不要额外说明。',
    ].filter(Boolean).join('');

    setGeneratingScript(episodeId);
    handleEpisodeChange(episodeId, { script: '' });

    let accumulated = '';
    try {
      await dramaChatStream(
        prompt,
        (chunk: string) => {
          accumulated += chunk;
          handleEpisodeChange(episodeId, { script: accumulated });
        },
        workId,
      );
    } catch {
      handleEpisodeChange(episodeId, { script: episode.script });
    } finally {
      setGeneratingScript(null);
    }
  };

  const handleGenerateScenes = (episodeId: string) => {
    const ep = meta.episodes.find(e => e.id === episodeId);
    if (!ep || !workId) return;

    if (!ep.script || ep.script.trim() === '') {
      alert('请先生成或填写剧本内容，然后再生成场景。');
      return;
    }
    setSceneExtractEpisodeId(episodeId);
    if (selectedModel && !sceneExtractModelId) {
      setSceneExtractModelId(selectedModel);
    }
    setSceneExtractModalOpen(true);
  };

  const handleConfirmSceneExtract = async () => {
    if (!workId || !sceneExtractEpisodeId) return;
    const ep = meta.episodes.find(e => e.id === sceneExtractEpisodeId);
    if (!ep || !ep.script || ep.script.trim() === '') return;

    setGeneratingScenes(sceneExtractEpisodeId);
    try {
      const generatedScenes = await dramaExtractScenes(
        ep.script,
        workId,
        12,
        sceneExtractModelId || null,
        sceneExtractStyle,
      );
      if (Array.isArray(generatedScenes) && generatedScenes.length > 0) {
        const newScenes = generatedScenes.map((s, index) => ({
          id: s.id || `scene-${index + 1}`,
          location: s.location || '未命名场景',
          time: s.time || '未标注时间',
          description: s.description || '',
        }));
        handleEpisodeChange(sceneExtractEpisodeId, { scenes: newScenes });
        handleCloseSceneExtractModal();
      } else {
        alert('AI 未提取到有效场景，请尝试补充剧本细节后重试');
      }
    } catch (e) {
      console.error('Failed to generate scenes:', e);
      alert(e instanceof Error ? e.message : '生成场景失败，请重试');
    } finally {
      setGeneratingScenes(null);
    }
  };

  const handleCloseSceneExtractModal = () => {
    setSceneExtractModalOpen(false);
    setSceneExtractEpisodeId(null);
  };

  const handleExtractCharacters = async () => {
    if (!workId) return;
    setExtractingCharacters(true);
    try {
      // Aggregate all episode content
      let combinedContent = '';
      for (const ep of meta.episodes) {
        combinedContent += `\n第${ep.number}集：${ep.title}\n${ep.synopsis}\n${ep.script}`;
      }
      if (!combinedContent.trim()) {
        alert('没有可用的剧本内容用于提取角色');
        return;
      }
      const availableModelIds = new Set(sceneExtractModels.map(model => model.model_id));
      const preferredModelId = selectedModel && availableModelIds.has(selectedModel)
        ? selectedModel
        : sceneExtractModelId && availableModelIds.has(sceneExtractModelId)
          ? sceneExtractModelId
          : (sceneExtractModels[0]?.model_id || null);
      const charactersData = await dramaExtractCharacters(
        combinedContent.slice(0, 8000),
        workId,
        12,
        preferredModelId,
      );
      if (Array.isArray(charactersData)) {
        const newCharacters = charactersData.map(c => ({
          id: genId(),
          name: c.name || '未知角色',
          role: c.role || '配角',
          description: c.description || '',
          appearance: c.appearance || '',
          personality: c.personality || ''
        }));
        
        // Merge with existing characters or replace
        // Here we just append new characters that don't exist by name
        const existingNames = new Set(meta.characters.map(c => c.name));
        const addedCharacters = newCharacters.filter(c => !existingNames.has(c.name));
        
        if (addedCharacters.length > 0) {
          handleMetaChange({ characters: [...meta.characters, ...addedCharacters] });
        } else if (meta.characters.length === 0) {
           handleMetaChange({ characters: newCharacters });
        }
      }
    } catch (err) {
      console.error('Failed to extract characters:', err);
      alert(err instanceof Error ? err.message : '提取角色失败，请检查网络或重试');
    } finally {
      setExtractingCharacters(false);
    }
  };

  const handleGenerateCharacterImage = async (characterId: string, style: 'portrait' | 'grid4' = 'portrait') => {
    const char = meta.characters.find(c => c.id === characterId);
    if (!char || !workId) return;

    setGeneratingCharacterImage(characterId);
    try {
      let prompt = `为剧本角色生成一张肖像照片。角色名：${char.name}，身份：${char.role}，外貌特征：${char.appearance}，性格：${char.personality}，描述：${char.description}`;
      
      if (style === 'grid4') {
        prompt = `为剧本角色生成一张【角色设定集】图片。要求：必须在一张图片上以 2x2 网格排版的形式，展示该角色的4个不同角度、姿势或表情（如正面、侧面、全身、特写）。确保4个格子里是同一个人的不同视图，背景保持干净。\n角色信息 -> 角色名：${char.name}，身份：${char.role}，外貌特征：${char.appearance}，性格：${char.personality}，描述：${char.description}`;
      }

      const imageUrl = await dramaGenerateImage(prompt, workId);
      if (imageUrl) {
        const newCharacters = meta.characters.map(c =>
          c.id === characterId ? { ...c, imageUrl } : c
        );
        handleMetaChange({ characters: newCharacters });
      }
    } catch (e) {
      console.error('Failed to generate character image:', e);
      alert(e instanceof Error ? e.message : '生成角色照片失败，请重试');
    } finally {
      setGeneratingCharacterImage(null);
    }
  };

  const handleGenerateSceneImage = async (episodeId: string, sceneId: string) => {
    const ep = meta.episodes.find(e => e.id === episodeId);
    if (!ep || !workId) return;
    const scene = ep.scenes?.find(s => s.id === sceneId);
    if (!scene) return;

    setGeneratingSceneImage(sceneId);
    try {
      const prompt = `为剧本生成一张场景概念图。场景地点：${scene.location}，时间：${scene.time}，描述：${scene.description}`;
      const imageUrl = await dramaGenerateImage(prompt, workId);
      if (imageUrl) {
        const newScenes = ep.scenes!.map(s =>
          s.id === sceneId ? { ...s, imageUrl } : s
        );
        handleEpisodeChange(episodeId, { scenes: newScenes });
      }
    } catch (e) {
      console.error('Failed to generate scene image:', e);
      alert(e instanceof Error ? e.message : '生成场景照片失败，请重试');
    } finally {
      setGeneratingSceneImage(null);
    }
  };

  const handleExtractOutline = async () => {
    if (!workId) return;
    setExtractingOutline(true);
    try {
      // Aggregate all episode content
      let combinedContent = '';
      for (const ep of meta.episodes) {
        combinedContent += `\n第${ep.number}集：${ep.title}\n${ep.synopsis}\n${ep.script}`;
      }
      if (!combinedContent.trim()) {
        alert('没有可用的剧本内容用于提取大纲');
        return;
      }
      
      const prompt = [
        `请根据以下剧本内容，提取出剧本的整体大纲（约300字）。`,
        `\n剧本内容：\n${combinedContent.slice(0, 8000)}`,
        `\n要求：只返回大纲内容，不要输出任何标题或其他说明。`
      ].join('\n');
      
      const responseText = await dramaChatComplete(prompt, workId, {
        systemPrompt: '你是一个专业的剧本大纲提取助手。'
      });
      
      const outline = responseText.trim();
      if (outline) {
        handleMetaChange({ outline });
      }
    } catch (err) {
      console.error('Failed to extract outline:', err);
      alert('提取大纲失败，请检查网络或重试');
    } finally {
      setExtractingOutline(false);
    }
  };

  // 集数导航
  const episodeIndex = meta.episodes.findIndex(e => e.id === activeEpisodeId);
  const prevEpisode = episodeIndex > 0 ? meta.episodes[episodeIndex - 1] : null;
  const nextEpisode = episodeIndex < meta.episodes.length - 1 ? meta.episodes[episodeIndex + 1] : null;
  const activeEpisode = meta.episodes.find(e => e.id === activeEpisodeId) || null;

  // Yjs 协作编辑器（按集连接）
  const activeChapterId = activeEpisode ? episodeChapterMap[activeEpisode.number] : undefined;
  const yjsDocumentId = workId && activeChapterId ? `work_${workId}_chapter_${activeChapterId}` : '';
  const { editor, connectionStatus } = useYjsEditor({
    documentId: yjsDocumentId,
    placeholder: '开始编写剧本正文...',
    editable: !!yjsDocumentId,
  });

  // 集数列表（供 CollabAIPanel 使用）
  const chapterItems = meta.episodes.map(ep => ({
    id: ep.id,
    title: ep.title,
    chapter_number: ep.number,
  }));

  if (loading) {
    return (
      <div className="drama-editor-loading">
        <Film size={32} />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="drama-editor-page">
      {/* 顶部栏 */}
      <header className="drama-editor-topbar">
        <div className="drama-editor-topbar-left">
          <button className="drama-back-btn" onClick={() => navigate('/drama')}>
            <ArrowLeft size={16} />
          </button>
          <button
            className="drama-sidebar-toggle"
            onClick={() => setLeftCollapsed(v => !v)}
            title={leftCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            {leftCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <Film size={15} className="drama-editor-topbar-icon" />
          <span className="drama-editor-topbar-title">{work?.title || '剧本'}</span>
          <span className="drama-save-status">
            {saving ? '保存中...' : savedAt ? `已保存 ${savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          {yjsDocumentId && (
            <span className="drama-status-tag">
              {connectionStatus === 'connected' ? (
                <Wifi size={12} />
              ) : connectionStatus === 'connecting' ? (
                <Wifi size={12} style={{ opacity: 0.5 }} />
              ) : (
                <WifiOff size={12} style={{ opacity: 0.4 }} />
              )}
              {connectionStatus === 'connected' ? '协作中' : connectionStatus === 'connecting' ? '连接中...' : '已断开'}
            </span>
          )}
        </div>
        <div className="drama-editor-topbar-right">
          {workId && (
            <button
              className="drama-share-btn"
              onClick={() => setShareModalOpen(true)}
              title="邀请协作者"
            >
              <Users size={15} />
              <span>分享</span>
            </button>
          )}
          <button
            className="drama-sidebar-toggle"
            onClick={() => setRightCollapsed(v => !v)}
            title={rightCollapsed ? '展开 AI 面板' : '收起 AI 面板'}
          >
            {rightCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
        </div>
      </header>

      <div className="drama-editor-body">
        {/* 左侧导航 */}
        {!leftCollapsed && (
          <aside className="drama-editor-left">
            <DramaSideNav
              meta={meta}
              activeEpisodeId={activeEpisodeId}
              onSelectEpisode={id => setActiveEpisodeId(id)}
              activeTab={leftTab}
              onTabChange={setLeftTab}
              onAddEpisode={handleAddEpisode}
              onDeleteEpisode={handleDeleteEpisode}
              onExtractCharacters={handleExtractCharacters}
              extractingCharacters={extractingCharacters}
              onExtractOutline={handleExtractOutline}
              extractingOutline={extractingOutline}
              onGenerateCharacterImage={handleGenerateCharacterImage}
              generatingCharacterImage={generatingCharacterImage}
              onSelectCharacter={setSelectedCharacter}
            />

            {/* 设置面板（在左侧底部展开） */}
            {leftTab === 'settings' && (
              <div className="drama-settings-panel">
                <div className="drama-settings-field">
                  <label className="drama-field-label">剧本名称</label>
                  <SettingsTitleEdit title={work?.title || ''} onSave={handleUpdateTitle} />
                </div>
                <div className="drama-settings-field">
                  <label className="drama-field-label">类型</label>
                  <div className="drama-tag-group">
                    {['都市', '古装', '悬疑', '爱情', '喜剧', '科幻'].map(g => (
                      <button key={g} className={`drama-tag sm ${meta.genre === g ? 'active' : ''}`}
                        onClick={() => handleMetaChange({ genre: g })}>{g}</button>
                    ))}
                  </div>
                </div>
                <div className="drama-settings-field">
                  <label className="drama-field-label">故事大纲</label>
                  <textarea className="drama-textarea sm" rows={4} value={meta.outline}
                    onChange={e => handleMetaChange({ outline: e.target.value })}
                    placeholder="故事核心..." />
                </div>
                <div className="drama-settings-field">
                  {meta.sourceNovelTitle && (
                    <p className="drama-source-novel-hint">来源：{meta.sourceNovelTitle}</p>
                  )}
                  <button className="drama-import-novel-btn" onClick={() => setImportModalOpen(true)}>
                    <Download size={14} />
                    {meta.sourceNovelTitle ? '重新从小说导入' : '从小说导入'}
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* 主内容区 */}
        <main className="drama-editor-main">
          {leftTab === 'work-info' ? (
            <div className="work-info-panel-wrapper">
              <WorkInfoManager
                workId={workId}
                workData={work ? { metadata: { ...(work.metadata || {}) } } as WorkData : undefined}
              />
            </div>
          ) : activeEpisode ? (
            <>
              <EpisodeEditor
                episode={activeEpisode}
                onChange={patch => handleEpisodeChange(activeEpisode.id, patch)}
                onGenerateVideo={handleGenerateVideo}
                generatingVideo={generatingVideo}
                onGenerateScript={handleGenerateScript}
                generatingScript={generatingScript}
                onGenerateScenes={handleGenerateScenes}
                generatingScenes={generatingScenes}
                onGenerateSceneImage={handleGenerateSceneImage}
                generatingSceneImage={generatingSceneImage}
                editor={editor}
              />
              {/* 集数导航 */}
              <div className="drama-ep-nav-footer">
                <button
                  className="drama-ep-nav-btn"
                  disabled={!prevEpisode}
                  onClick={() => prevEpisode && setActiveEpisodeId(prevEpisode.id)}
                >
                  <ChevronLeft size={15} />
                  {prevEpisode ? prevEpisode.title : '已是第一集'}
                </button>
                <span className="drama-ep-nav-indicator">
                  {episodeIndex + 1} / {meta.episodes.length}
                </span>
                <button
                  className="drama-ep-nav-btn"
                  disabled={!nextEpisode}
                  onClick={() => nextEpisode && setActiveEpisodeId(nextEpisode.id)}
                >
                  {nextEpisode ? nextEpisode.title : '已是最后一集'}
                  <ChevronRightIcon size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="drama-editor-welcome">
              <div className="drama-editor-welcome-inner">
                <Film size={48} className="drama-editor-welcome-icon" />
                <h2>开始你的剧本创作</h2>
                <p>在左侧添加集数，或从小说一键导入</p>
                <div className="drama-editor-welcome-btns">
                  <button className="drama-create-btn" onClick={handleAddEpisode}>
                    <Plus size={16} /> 创建第一集
                  </button>
                  <button className="drama-import-novel-btn drama-import-novel-btn-welcome"
                    onClick={() => setImportModalOpen(true)}>
                    <Download size={15} /> 从小说导入
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 右侧 AI 面板 */}
        {!rightCollapsed && workId && (
          <aside className="drama-editor-right">
            <CollabAIPanel
              workId={workId}
              chapters={chapterItems}
              currentChapterId={activeEpisodeId || undefined}
              currentUserId={currentUserId}
              selectedModel={selectedModel}
              onSelectedModelChange={setSelectedModel}
            />
          </aside>
        )}
      </div>

      <ImportFromNovelModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImport}
        workId={workId}
      />

      {sceneExtractModalOpen && (
        <div className="drama-modal-overlay" onClick={handleCloseSceneExtractModal}>
          <div className="drama-modal-content" onClick={e => e.stopPropagation()}>
            <div className="drama-modal-header">
              <h3>AI 提取场景设置</h3>
              <button className="drama-modal-close" onClick={handleCloseSceneExtractModal}>
                <X size={20} />
              </button>
            </div>
            <div className="drama-modal-body">
              <div className="drama-input-group">
                <label>提取模型</label>
                <select
                  className="drama-select"
                  value={sceneExtractModelId}
                  onChange={e => setSceneExtractModelId(e.target.value)}
                  disabled={loadingExtractOptions}
                >
                  <option value="">默认模型（系统配置）</option>
                  {sceneExtractModels.map(model => (
                    <option key={model.model_id} value={model.model_id}>
                      {model.name}（{model.model_id}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="drama-input-group">
                <label>生成风格</label>
                <select
                  className="drama-select"
                  value={sceneExtractStyle}
                  onChange={e => setSceneExtractStyle(e.target.value as SceneGenerationStyle)}
                >
                  {sceneExtractStyles.map(style => (
                    <option key={style.id} value={style.id}>{style.label}</option>
                  ))}
                </select>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {sceneExtractStyles.find(style => style.id === sceneExtractStyle)?.description || ''}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button className="drama-btn-secondary" onClick={handleCloseSceneExtractModal}>取消</button>
                <button
                  className="drama-btn-primary"
                  onClick={handleConfirmSceneExtract}
                  disabled={generatingScenes === sceneExtractEpisodeId}
                >
                  {generatingScenes === sceneExtractEpisodeId ? '提取中...' : '开始提取'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 角色详情/编辑弹窗 */}
      {selectedCharacter && (
        <div className="drama-modal-overlay" onClick={() => {
          setSelectedCharacter(null);
          setIsEditingCharacter(false);
        }}>
          <div className="drama-modal-content character-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="drama-modal-header">
              <h3>{isEditingCharacter ? '编辑角色' : '角色详情'}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {!isEditingCharacter && (
                  <>
                    <button className="drama-modal-action-btn" onClick={() => {
                      setEditingCharacterData(selectedCharacter);
                      setIsEditingCharacter(true);
                    }} title="编辑">
                      <Edit2 size={16} />
                    </button>
                    <button className="drama-modal-action-btn" onClick={() => {
                      if (window.confirm(`确定要删除角色「${selectedCharacter.name}」吗？`)) {
                        const newCharacters = meta.characters.filter(c => c.id !== selectedCharacter.id);
                        handleMetaChange({ characters: newCharacters });
                        setSelectedCharacter(null);
                      }
                    }} title="删除">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                <button className="drama-modal-close" onClick={() => {
                  setSelectedCharacter(null);
                  setIsEditingCharacter(false);
                }}><X size={20} /></button>
              </div>
            </div>
            <div className="drama-modal-body">
              {isEditingCharacter && editingCharacterData ? (
                <div className="character-edit-form">
                  <div className="drama-input-group">
                    <label>角色名</label>
                    <input className="drama-input" value={editingCharacterData.name} onChange={e => setEditingCharacterData({...editingCharacterData, name: e.target.value})} />
                  </div>
                  <div className="drama-input-group">
                    <label>角色身份</label>
                    <input className="drama-input" value={editingCharacterData.role} onChange={e => setEditingCharacterData({...editingCharacterData, role: e.target.value})} />
                  </div>
                  <div className="drama-input-group">
                    <label>描述</label>
                    <textarea className="drama-textarea" rows={3} value={editingCharacterData.description} onChange={e => setEditingCharacterData({...editingCharacterData, description: e.target.value})} />
                  </div>
                  <div className="drama-input-group">
                    <label>外貌</label>
                    <textarea className="drama-textarea" rows={3} value={editingCharacterData.appearance} onChange={e => setEditingCharacterData({...editingCharacterData, appearance: e.target.value})} />
                  </div>
                  <div className="drama-input-group">
                    <label>性格</label>
                    <textarea className="drama-textarea" rows={3} value={editingCharacterData.personality} onChange={e => setEditingCharacterData({...editingCharacterData, personality: e.target.value})} />
                  </div>
                  <div className="character-edit-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                    <button className="drama-btn-secondary" onClick={() => setIsEditingCharacter(false)}>取消</button>
                    <button className="drama-btn-primary" onClick={() => {
                      const newCharacters = meta.characters.map(c => c.id === editingCharacterData.id ? editingCharacterData : c);
                      handleMetaChange({ characters: newCharacters });
                      setSelectedCharacter(editingCharacterData);
                      setIsEditingCharacter(false);
                    }} style={{ display: 'flex', alignItems: 'center' }}>
                      <Save size={14} style={{ marginRight: '4px' }} />
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="character-detail-top">
                    <div 
                      className="character-detail-avatar-wrapper"
                      onClick={() => {
                        if (selectedCharacter.imageUrl) {
                          setPreviewImage(selectedCharacter.imageUrl);
                        }
                      }}
                      style={{ cursor: selectedCharacter.imageUrl ? 'pointer' : 'default' }}
                    >
                      {selectedCharacter.imageUrl ? (
                        <img src={selectedCharacter.imageUrl} alt={selectedCharacter.name} className="character-detail-avatar" />
                      ) : (
                        <div className="character-detail-avatar-placeholder">{selectedCharacter.name.slice(0, 1)}</div>
                      )}
                      {selectedCharacter.imageUrl && (
                        <div className="character-detail-avatar-hover">
                          <Sparkles size={16} />
                          <span>查看大图</span>
                        </div>
                      )}
                    </div>
                    <div className="character-detail-info">
                      <div className="character-detail-name">{selectedCharacter.name}</div>
                      <div className="character-detail-role">{selectedCharacter.role}</div>
                      
                      <div className="character-detail-actions" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>重新生成图片：</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="drama-btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center' }}
                            onClick={() => handleGenerateCharacterImage(selectedCharacter.id, 'portrait')}
                            disabled={generatingCharacterImage === selectedCharacter.id}
                          >
                            <Sparkles size={14} style={{ marginRight: '4px' }} />
                            单人肖像
                          </button>
                          <button 
                            className="drama-btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center' }}
                            onClick={() => handleGenerateCharacterImage(selectedCharacter.id, 'grid4')}
                            disabled={generatingCharacterImage === selectedCharacter.id}
                          >
                            <Layers size={14} style={{ marginRight: '4px' }} />
                            四视图设定集
                          </button>
                        </div>
                        {generatingCharacterImage === selectedCharacter.id && (
                          <span style={{ fontSize: '12px', color: 'var(--primary-color)' }}>正在生成中，请稍候...</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="character-detail-section">
                    <h4>描述</h4>
                    <p>{selectedCharacter.description || '暂无描述'}</p>
                  </div>
                  <div className="character-detail-section">
                    <h4>外貌</h4>
                    <p>{selectedCharacter.appearance || '暂无描述'}</p>
                  </div>
                  <div className="character-detail-section">
                    <h4>性格</h4>
                    <p>{selectedCharacter.personality || '暂无描述'}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 图片预览遮罩 */}
      {previewImage && (
        <div className="drama-image-preview-overlay" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="drama-image-preview-img" />
          <button className="drama-image-preview-close" onClick={() => setPreviewImage(null)}>×</button>
        </div>
      )}

      <ShareWorkModal
        isOpen={shareModalOpen}
        workId={workId || ''}
        workTitle={work?.title || '剧本'}
        editorPath="/drama/editor"
        onClose={() => setShareModalOpen(false)}
      />
    </div>
  );
}

// 标题内联编辑
function SettingsTitleEdit({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [val, setVal] = useState(title);
  const [saved, setSaved] = useState(false);
  const save = async () => { await onSave(val); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <div className="drama-input-row">
      <input className="drama-input" value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()} />
      <button className="drama-save-inline-btn" onClick={save}>
        {saved ? <Check size={14} /> : <Save size={14} />}
      </button>
    </div>
  );
}
