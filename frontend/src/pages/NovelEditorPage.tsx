import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, Coins, Settings, Undo2, Redo2, Type, Bold, Underline, ToggleLeft, ToggleRight } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import SideNav from '../components/editor/SideNav';
import AIAssistant from '../components/editor/AIAssistant';
import TagsManager from '../components/editor/TagsManager';
import ChapterOutline from '../components/editor/ChapterOutline';
import ChapterSettingsModal from '../components/editor/ChapterSettingsModal';
import MapView from '../components/editor/MapView';
import Characters from '../components/editor/Characters';
import Factions from '../components/editor/Factions';
import WorkInfoManager from '../components/editor/WorkInfoManager';
import ThemeSelector from '../components/ThemeSelector';
import '../components/editor/NovelEditor.css';
import './NovelEditorPage.css';

// 章节完整数据类型
interface ChapterFullData {
  id: string;
  volumeId: string;
  volumeTitle: string;
  title: string;
  characters: string[];
  locations: string[];
  outline: string;
  detailOutline: string;
}

export default function NovelEditorPage() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState<'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions'>('work-info');
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [smartCompletion, setSmartCompletion] = useState(false);
  
  // 章节设置弹框状态
  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);
  const [chapterModalMode, setChapterModalMode] = useState<'create' | 'edit'>('create');
  const [currentVolumeId, setCurrentVolumeId] = useState('');
  const [currentVolumeTitle, setCurrentVolumeTitle] = useState('');
  const [currentChapterData, setCurrentChapterData] = useState<ChapterFullData | undefined>();

  // 编辑器实例
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
      }),
      UnderlineExtension,
      Placeholder.configure({
        placeholder: '开始写作...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
      }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'novel-editor-content',
      },
    },
    enableInputRules: true,
    enablePasteRules: true,
  });

  // 存储章节数据
  const [chaptersData, setChaptersData] = useState<Record<string, ChapterFullData>>({});
  
  // 草稿数据
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string; volumeId?: string; volumeTitle?: string; characters?: string[]; locations?: string[]; outline?: string; detailOutline?: string }>>([
    { id: 'draft1', title: '草稿 1' },
  ]);

  // 打开章节弹框
  const handleOpenChapterModal = (
    mode: 'create' | 'edit',
    volumeId: string,
    volumeTitle: string,
    chapterData?: ChapterFullData
  ) => {
    setChapterModalMode(mode);
    setCurrentVolumeId(volumeId);
    setCurrentVolumeTitle(volumeTitle);
    setCurrentChapterData(chapterData);
    setIsChapterModalOpen(true);
  };

  // 保存章节/草稿数据
  const handleSaveChapter = (data: {
    id?: string;
    title: string;
    volumeId: string;
    volumeTitle: string;
    characters: string[];
    locations: string[];
    outline: string;
    detailOutline: string;
  }) => {
    const chapterId = data.id || `${data.volumeId}-${data.volumeId === 'draft' ? 'draft' : 'chap'}${Date.now()}`;
    setChaptersData(prev => ({
      ...prev,
      [chapterId]: {
        ...data,
        id: chapterId,
      },
    }));
    
    // 如果是草稿，更新草稿列表
    if (data.volumeId === 'draft') {
      setDrafts(prev => {
        const existingIndex = prev.findIndex(d => d.id === chapterId);
        if (existingIndex >= 0) {
          // 更新现有草稿
          const updated = [...prev];
          updated[existingIndex] = {
            id: chapterId,
            title: data.title,
            volumeId: data.volumeId,
            volumeTitle: data.volumeTitle,
            characters: data.characters,
            locations: data.locations,
            outline: data.outline,
            detailOutline: data.detailOutline,
          };
          return updated;
        } else {
          // 添加新草稿
          return [...prev, {
            id: chapterId,
            title: data.title,
            volumeId: data.volumeId,
            volumeTitle: data.volumeTitle,
            characters: data.characters,
            locations: data.locations,
            outline: data.outline,
            detailOutline: data.detailOutline,
          }];
        }
      });
    }
  };

  // 获取当前章节/草稿标题
  const getCurrentChapterTitle = () => {
    if (!selectedChapter) return '';
    const data = chaptersData[selectedChapter];
    if (data) {
      // 如果是草稿，只显示标题
      if (data.volumeId === 'draft') {
        return data.title;
      }
      return `${data.volumeTitle} · ${data.title}`;
    }
    // 从 ID 生成默认标题
    const parts = selectedChapter.split('-');
    if (parts.length >= 2) {
      if (parts[0] === 'draft') {
        return parts[1] || selectedChapter;
      }
      const volNum = parts[0].replace('vol', '');
      const chapNum = parts[1].replace('chap', '');
      return `第${volNum}卷 · 第${chapNum}章`;
    }
    return selectedChapter;
  };

  // 打开当前章节/草稿的编辑弹框
  const handleEditCurrentChapter = () => {
    if (!selectedChapter) return;
    const data = chaptersData[selectedChapter];
    if (data) {
      handleOpenChapterModal('edit', data.volumeId, data.volumeTitle, data);
    } else {
      // 如果没有数据，从 ID 推断
      const parts = selectedChapter.split('-');
      const volumeId = parts[0];
      
      // 如果是草稿
      if (volumeId === 'draft') {
        handleOpenChapterModal('edit', 'draft', '草稿箱', {
          id: selectedChapter,
          volumeId: 'draft',
          volumeTitle: '草稿箱',
          title: parts[1] ? `草稿 ${parts[1].replace('draft', '')}` : '草稿',
          characters: [],
          locations: [],
          outline: '',
          detailOutline: '',
        });
        return;
      }
      
      // 如果是章节
      const volNum = volumeId.replace('vol', '');
      const chapNum = parts[1]?.replace('chap', '') || '1';
      const volumeTitle = `第${['一', '二', '三', '四', '五'][parseInt(volNum) - 1] || volNum}卷`;
      handleOpenChapterModal('edit', volumeId, volumeTitle, {
        id: selectedChapter,
        volumeId,
        volumeTitle,
        title: `第${chapNum}章`,
        characters: [],
        locations: [],
        outline: '',
        detailOutline: '',
      });
    }
  };

  return (
    <div className="novel-editor-page">
      {/* 顶部工具栏 */}
      <header className="novel-editor-header">
        <div className="header-left">
          <button className="exit-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>退出</span>
          </button>
          <div className="work-info">
            <h1 className="work-title">回响之声</h1>
            <div className="work-tags">
              <span className="tag">长篇</span>
              <span className="tag">第三人称</span>
              <span className="tag">男频</span>
              <span className="status-tag">已保存到云端</span>
            </div>
          </div>
        </div>
        <div className="header-center">
          <div className="word-count">
            <span>本章字数: 0</span>
            <span>总字数: 447</span>
            <Info size={14} />
          </div>
        </div>
        <div className="header-right">
          <div className="header-actions">
            <ThemeSelector />
            <button className="action-btn">替换</button>
            <button className="action-btn">回收站</button>
            <button className="action-btn">分享</button>
          </div>
          <div className="coin-section">
            <div className="coin-display">
              <Coins size={16} />
              <span>494+</span>
            </div>
            <button className="member-btn">开会员得蛙币</button>
          </div>
        </div>
      </header>

      <div className="novel-editor-body">
        {/* 左侧边栏 */}
        <SideNav
          activeNav={activeNav}
          onNavChange={setActiveNav}
          selectedChapter={selectedChapter}
          onChapterSelect={(chapterId) => {
            setSelectedChapter(chapterId);
            // 选择章节时，清除 activeNav，让编辑器显示
            setActiveNav('work-info');
          }}
          onOpenChapterModal={handleOpenChapterModal}
          drafts={drafts}
          onDraftsChange={setDrafts}
        />

        {/* 主编辑区 */}
        <div className="novel-editor-main">
          {/* 根据导航项显示不同内容 */}
          {activeNav === 'work-info' && selectedChapter === null && <WorkInfoManager />}
          {activeNav === 'tags' && <TagsManager />}
          {activeNav === 'outline' && <ChapterOutline />}
          {activeNav === 'map' && <MapView />}
          {activeNav === 'characters' && <Characters />}
          {activeNav === 'factions' && <Factions />}
          {activeNav === 'settings' && (
            <div className="placeholder-content">
              <h2>设置</h2>
              <p>功能开发中...</p>
            </div>
          )}
          {/* 文本编辑器（当选择了章节时显示） */}
          {selectedChapter !== null && !['tags', 'outline', 'map', 'characters', 'settings', 'factions'].includes(activeNav) && (
            <div className="chapter-editor-container">
              {/* 标题和工具栏合并在一起 */}
              <div className="chapter-header-toolbar">
                {/* 左侧工具栏 */}
                <div className="novel-editor-toolbar">
                  <div className="toolbar-group">
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().undo().run()}
                      disabled={!editor?.can().undo()}
                      title="撤销"
                    >
                      <Undo2 size={16} />
                    </button>
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().redo().run()}
                      disabled={!editor?.can().redo()}
                      title="重做"
                    >
                      <Redo2 size={16} />
                    </button>
                  </div>
                  <div className="toolbar-divider" />
                  <div className="toolbar-group">
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                      title="一级标题 (Markdown: # 标题)"
                    >
                      <Type size={16} />
                      <span>H1</span>
                    </button>
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().toggleBold().run()}
                      title="粗体 (Markdown: **文本**)"
                    >
                      <Bold size={16} />
                    </button>
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().toggleUnderline().run()}
                      title="下划线"
                    >
                      <Underline size={16} />
                    </button>
                  </div>
                </div>
                
                {/* 中间标题 */}
                <div className="chapter-title-center">
                  <h2 className="chapter-title-centered">{getCurrentChapterTitle()}</h2>
                </div>
                
                {/* 右侧设置栏 */}
                <div className="editor-settings">
                  <button 
                    className="chapter-settings-btn"
                    onClick={handleEditCurrentChapter}
                    title="章节设置"
                  >
                    <Settings size={18} />
                  </button>
                  <div className="setting-item">
                    <span>智能补全</span>
                    <button
                      className="toggle-btn"
                      onClick={() => setSmartCompletion(!smartCompletion)}
                      title={smartCompletion ? '关闭智能补全' : '开启智能补全'}
                      data-active={smartCompletion}
                      aria-label={smartCompletion ? '关闭智能补全' : '开启智能补全'}
                      role="switch"
                      aria-checked={smartCompletion}
                    />
                  </div>
                </div>
              </div>
              {/* 文本编辑区域 */}
              <div className="novel-editor-wrapper">
                <EditorContent editor={editor} />
              </div>
            </div>
          )}
        </div>

        {/* 右侧边栏 */}
        <AIAssistant />
      </div>

      {/* 章节设置弹框 */}
      <ChapterSettingsModal
        isOpen={isChapterModalOpen}
        mode={chapterModalMode}
        volumeId={currentVolumeId}
        volumeTitle={currentVolumeTitle}
        initialData={currentChapterData}
        onClose={() => setIsChapterModalOpen(false)}
        onSave={handleSaveChapter}
      />
    </div>
  );
}
