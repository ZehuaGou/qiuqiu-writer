import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { worksApi, type Work } from '../utils/worksApi';
import { chaptersApi, type Chapter } from '../utils/chaptersApi';
import { sharedbClient } from '../utils/sharedbClient';
import { syncManager } from '../utils/syncManager';
import '../components/editor/NovelEditor.css';
import './NovelEditorPage.css';

// 章节完整数据类型
interface ChapterFullData {
  id: string;
  volumeId: string;
  volumeTitle: string;
  title: string;
  chapter_number?: number;  // 章节号
  characters: string[];
  locations: string[];
  outline: string;
  detailOutline: string;
}

export default function NovelEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workId = searchParams.get('workId');
  
  const [activeNav, setActiveNav] = useState<'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions'>('work-info');
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [smartCompletion, setSmartCompletion] = useState(false);
  const [syncStatus, setSyncStatus] = useState(syncManager.getStatus());
  
  // 作品数据
  const [work, setWork] = useState<Work | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  // 存储所有章节数据（用于计算章节号）
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  
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
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string; volumeId?: string; volumeTitle?: string; characters?: string[]; locations?: string[]; outline?: string; detailOutline?: string }>>([]);

  // 卷和章节数据 - 从API获取
  const [volumes, setVolumes] = useState<Array<{ id: string; title: string; chapters: Array<{ id: string; volumeId: string; title: string; characters?: string[]; locations?: string[]; outline?: string; detailOutline?: string }> }>>([]);

  // 角色数据 - 从WorkInfoManager的缓存中获取
  const [availableCharacters, setAvailableCharacters] = useState<Array<{ id: string; name: string; avatar?: string }>>([]);
  const [hasCharacterModule, setHasCharacterModule] = useState(false);
  
  // 地点数据 - 从WorkInfoManager的缓存中获取
  const [availableLocations, setAvailableLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [hasLocationModule, setHasLocationModule] = useState(false);
  
  // 自动保存定时器
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentChapterIdRef = useRef<number | null>(null);

  // 从WorkInfoManager缓存中提取角色数据
  useEffect(() => {
    const loadCharactersFromCache = () => {
      try {
        const CACHE_KEY = 'wawawriter_workinfo_cache';
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          const modules = data.modules || [];
          
          // 查找角色设定模块
          const characterModule = modules.find((m: any) => m.id === 'characters');
          if (characterModule) {
            setHasCharacterModule(true);
            
            // 查找角色数据（可能在char-table或character-card组件中）
            const findCharacterData = (components: any[]): any[] => {
              for (const comp of components) {
                // 检查char-table组件
                if (comp.type === 'table' && comp.id === 'char-table' && comp.value) {
                  // 表格数据格式：数组，每行是一个对象
                  // 使用name作为ID，确保稳定性
                  return (comp.value as any[]).map((row) => ({
                    id: row.name || String(Date.now() + Math.random()),
                    name: row.name || '',
                    avatar: row.avatar || undefined,
                  })).filter(c => c.name);
                }
                
                // 检查character-card组件
                if (comp.type === 'character-card' && comp.value) {
                  // 角色卡片数据格式：数组，每个对象有name字段
                  // 使用name作为ID，确保稳定性
                  return (comp.value as any[]).map((char) => ({
                    id: char.name || String(Date.now() + Math.random()),
                    name: char.name || '',
                    avatar: char.avatar || undefined,
                  })).filter(c => c.name);
                }
                
                // 检查tabs组件（角色设定可能在tabs中）
                if (comp.type === 'tabs' && comp.config?.tabs) {
                  for (const tab of comp.config.tabs) {
                    if (tab.components) {
                      const found = findCharacterData(tab.components);
                      if (found.length > 0) return found;
                    }
                  }
                }
              }
              return [];
            };
            
            const characterData = findCharacterData(characterModule.components || []);
            setAvailableCharacters(characterData);
          } else {
            setHasCharacterModule(false);
            setAvailableCharacters([]);
          }
          
          // 查找地点数据（可能在world模块的card-list组件中，或者有"地点"关键词的组件）
          const findLocationData = (components: any[]): any[] => {
            for (const comp of components) {
              // 检查card-list组件，且label包含"地点"相关关键词
              if (comp.type === 'card-list' && comp.value) {
                const label = (comp.label || '').toLowerCase();
                if (label.includes('地点') || label.includes('location') || label.includes('场景')) {
                  // 卡片列表数据格式：数组，每个对象有name字段（或第一个字段）
                  return (comp.value as any[]).map((card) => {
                    // 尝试从name字段获取，如果没有则从第一个字段获取
                    const name = card.name || card[Object.keys(card)[0]] || '';
                    return {
                      id: name || String(Date.now() + Math.random()),
                      name: name,
                    };
                  }).filter(loc => loc.name);
                }
              }
              
              // 检查tabs组件（地点可能在tabs中）
              if (comp.type === 'tabs' && comp.config?.tabs) {
                for (const tab of comp.config.tabs) {
                  if (tab.components) {
                    const found = findLocationData(tab.components);
                    if (found.length > 0) return found;
                  }
                }
              }
            }
            return [];
          };
          
          // 查找world模块
          const worldModule = modules.find((m: any) => m.id === 'world');
          if (worldModule) {
            const locationData = findLocationData(worldModule.components || []);
            if (locationData.length > 0) {
              setHasLocationModule(true);
              setAvailableLocations(locationData);
            } else {
              setHasLocationModule(false);
              setAvailableLocations([]);
            }
          } else {
            // 如果没有world模块，尝试在所有模块中查找地点数据
            let foundLocations: any[] = [];
            for (const module of modules) {
              const locationData = findLocationData(module.components || []);
              if (locationData.length > 0) {
                foundLocations = locationData;
                break;
              }
            }
            if (foundLocations.length > 0) {
              setHasLocationModule(true);
              setAvailableLocations(foundLocations);
            } else {
              setHasLocationModule(false);
              setAvailableLocations([]);
            }
          }
        } else {
          setHasCharacterModule(false);
          setAvailableCharacters([]);
          setHasLocationModule(false);
          setAvailableLocations([]);
        }
      } catch (err) {
        console.error('加载角色和地点数据失败:', err);
        setHasCharacterModule(false);
        setAvailableCharacters([]);
        setHasLocationModule(false);
        setAvailableLocations([]);
      }
    };

    // 初始加载
    loadCharactersFromCache();

    // 监听localStorage变化（当WorkInfoManager更新时）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'wawawriter_workinfo_cache') {
        loadCharactersFromCache();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // 定期检查缓存变化（因为同窗口内的localStorage变化不会触发storage事件）
    const interval = setInterval(loadCharactersFromCache, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [workId]);

  // 初始化 ShareDB 连接和同步管理器
  useEffect(() => {
    // 连接 ShareDB
    sharedbClient.connect().catch(console.error);

    // 监听同步状态
    const unsubscribe = syncManager.onStatusChange((status) => {
      setSyncStatus(status);
    });

    // 预加载当前作品的章节（智能预测）
    if (workId) {
      const preloadChapters = async () => {
        try {
          const response = await chaptersApi.listChapters({
            work_id: Number(workId),
            page: 1,
            size: 20,
            sort_by: 'chapter_number',
            sort_order: 'asc',
          });
          
          const documentIds = response.chapters.map(ch => `chapter_${ch.id}`);
          await syncManager.preloadDocuments(documentIds);
        } catch (err) {
          console.error('预加载章节失败:', err);
        }
      };
      
      preloadChapters();
    }

    return () => {
      unsubscribe();
      sharedbClient.disconnect();
    };
  }, [workId]);

  // 加载作品详情
  useEffect(() => {
    if (!workId) {
      setError('缺少作品ID');
      setLoading(false);
      return;
    }

    const loadWork = async () => {
      try {
        setLoading(true);
        const workData = await worksApi.getWork(Number(workId), true, true);
        setWork(workData);
        setTitleValue(workData.title);
        setError(null);
      } catch (err) {
        console.error('加载作品失败:', err);
        setError(err instanceof Error ? err.message : '加载作品失败');
      } finally {
        setLoading(false);
      }
    };

    loadWork();
  }, [workId]);

  // 当 work 更新时，同步更新 titleValue
  useEffect(() => {
    if (work) {
      setTitleValue(work.title);
    }
  }, [work]);

  // 当进入编辑模式时，聚焦输入框
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // 保存标题
  const handleSaveTitle = async () => {
    if (!work || !workId || !titleValue.trim()) {
      setTitleValue(work?.title || '');
      setIsEditingTitle(false);
      return;
    }

    if (titleValue.trim() === work.title) {
      setIsEditingTitle(false);
      return;
    }

    try {
      const updatedWork = await worksApi.updateWork(Number(workId), {
        title: titleValue.trim(),
      });
      setWork(updatedWork);
      setIsEditingTitle(false);
    } catch (err) {
      console.error('保存标题失败:', err);
      alert(err instanceof Error ? err.message : '保存标题失败');
      setTitleValue(work.title);
      setIsEditingTitle(false);
    }
  };

  // 取消编辑标题
  const handleCancelEditTitle = () => {
    setTitleValue(work?.title || '');
    setIsEditingTitle(false);
  };

  // 处理标题输入框的键盘事件
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEditTitle();
    }
  };

  // 加载章节列表
  useEffect(() => {
    if (!workId) return;

    const loadChapters = async () => {
      try {
        // 分页获取所有章节
        const allChapters: Chapter[] = [];
        let page = 1;
        const pageSize = 100;
        let hasMore = true;

        while (hasMore) {
          const response = await chaptersApi.listChapters({
            work_id: Number(workId),
            page: page,
            size: pageSize,
            sort_by: 'chapter_number',
            sort_order: 'asc',
          });
          
          allChapters.push(...response.chapters);
          hasMore = response.chapters.length === pageSize;
          page++;
        }

        // 保存所有章节数据
        setAllChapters(allChapters);
        
        // 将章节按卷分组
        const volumesMap = new Map<number, Array<Chapter>>();
        
        allChapters.forEach((chapter) => {
          const volNum = chapter.volume_number || 0;
          if (!volumesMap.has(volNum)) {
            volumesMap.set(volNum, []);
          }
          volumesMap.get(volNum)!.push(chapter);
        });

        // 转换为编辑页面需要的格式
        const volumesData = Array.from(volumesMap.entries()).map(([volNum, chapters]) => ({
          id: `vol${volNum}`,
          title: volNum === 0 ? '未分卷' : `第${volNum}卷`,
          chapters: chapters.map((chapter) => ({
            id: String(chapter.id),
            volumeId: `vol${volNum}`,
            title: chapter.title,
            chapter_number: chapter.chapter_number,  // 保留章节号
            characters: [],
            locations: [],
            outline: '',
            detailOutline: '',
          })),
        }));

        setVolumes(volumesData);

        // 更新章节数据映射
        const chaptersDataMap: Record<string, ChapterFullData> = {};
        allChapters.forEach((chapter) => {
          const volNum = chapter.volume_number || 0;
          chaptersDataMap[String(chapter.id)] = {
            id: String(chapter.id),
            volumeId: `vol${volNum}`,
            volumeTitle: volNum === 0 ? '未分卷' : `第${volNum}卷`,
            title: chapter.title,
            chapter_number: chapter.chapter_number,  // 保留章节号
            characters: [],
            locations: [],
            outline: '',
            detailOutline: '',
          };
        });
        setChaptersData(chaptersDataMap);
      } catch (err) {
        console.error('加载章节列表失败:', err);
      }
    };

    loadChapters();
  }, [workId]);

  // 加载章节内容（使用本地缓存和 ShareDB）
  useEffect(() => {
    if (!selectedChapter || !editor) return;

    const chapterId = parseInt(selectedChapter);
    if (isNaN(chapterId)) {
      // 如果是草稿或其他非数字ID，不加载
      editor.commands.setContent('<p></p>');
      currentChapterIdRef.current = null;
      return;
    }

    const loadChapterContent = async () => {
      try {
        // 使用 workId 和 chapterId 生成唯一的缓存键
        const documentId = workId 
          ? `work_${workId}_chapter_${chapterId}` 
          : `chapter_${chapterId}`;
        currentChapterIdRef.current = chapterId;
        
        console.log('📖 加载章节内容:', {
          workId,
          chapterId,
          documentId,
        });
        
        let content: string | null = null;
        
        // 1. 先从本地缓存获取（即时响应）
        try {
          const cachedDoc = await sharedbClient.getDocument(documentId);
          
          console.log('💾 缓存数据:', {
            documentId,
            cached: !!cachedDoc,
            cachedDoc,
            contentType: cachedDoc?.content ? typeof cachedDoc.content : 'null',
            contentPreview: cachedDoc?.content 
              ? (typeof cachedDoc.content === 'string' 
                  ? cachedDoc.content.substring(0, 100) 
                  : JSON.stringify(cachedDoc.content).substring(0, 100))
              : 'null',
          });
          
          if (cachedDoc) {
            // 处理不同的内容格式
            if (typeof cachedDoc.content === 'string') {
              content = cachedDoc.content;
              console.log('✅ 从缓存获取到字符串内容，长度:', content.length);
            } else if (cachedDoc.content && typeof cachedDoc.content === 'object') {
              // 如果内容是对象，尝试提取 content 字段
              if ('content' in cachedDoc.content) {
                content = cachedDoc.content.content as string;
                console.log('✅ 从缓存对象中提取内容，长度:', content?.length || 0);
              } else {
                // 尝试序列化为字符串
                content = JSON.stringify(cachedDoc.content);
                console.log('⚠️ 缓存内容是对象，已序列化，长度:', content.length);
              }
            }
          } else {
            console.log('❌ 缓存中没有找到文档:', documentId);
          }
        } catch (cacheErr) {
          console.warn('⚠️ 从缓存加载失败，将从服务器获取:', cacheErr);
        }
        
        // 2. 如果缓存中没有内容，从服务器获取
        if (!content) {
          console.log('🌐 缓存中没有内容，从服务器获取...');
          
          // 优先从 ShareDB 文档 API 获取（因为内容存储在 ShareDB 中）
          try {
            const docResult = await chaptersApi.getChapterDocument(chapterId);
            console.log('📥 从 ShareDB 文档 API 获取:', {
              hasContent: !!docResult.content,
              contentType: typeof docResult.content,
              contentKeys: docResult.content && typeof docResult.content === 'object' 
                ? Object.keys(docResult.content) 
                : 'not object',
            });
            
            if (docResult.content) {
              // 处理不同的内容格式
              if (typeof docResult.content === 'string') {
                content = docResult.content;
                console.log('✅ 获取到字符串内容，长度:', content.length);
              } else if (docResult.content && typeof docResult.content === 'object') {
                // ShareDB 文档通常是对象格式，包含 content 字段
                if ('content' in docResult.content) {
                  const innerContent = docResult.content.content;
                  if (typeof innerContent === 'string') {
                    content = innerContent;
                    console.log('✅ 从对象中提取字符串内容，长度:', content.length);
                  } else {
                    // 如果是 HTML 对象，尝试提取
                    content = JSON.stringify(innerContent);
                    console.log('⚠️ 内容是对象，已序列化，长度:', content.length);
                  }
                } else {
                  // 尝试查找可能的 content 字段
                  const possibleContent = (docResult.content as any).content || 
                                         (docResult.content as any).html ||
                                         (docResult.content as any).text;
                  if (possibleContent && typeof possibleContent === 'string') {
                    content = possibleContent;
                    console.log('✅ 找到内容字段，长度:', content.length);
                  } else {
                    // 最后尝试序列化整个对象
                    content = JSON.stringify(docResult.content);
                    console.log('⚠️ 无法提取内容，已序列化整个对象，长度:', content.length);
                  }
                }
              }
              
              // 如果成功获取内容，保存到缓存
              if (content) {
                const cacheKey = workId 
                  ? `work_${workId}_chapter_${chapterId}` 
                  : `chapter_${chapterId}`;
                
                console.log('💾 保存到缓存:', {
                  cacheKey,
                  contentLength: content.length,
                });
                
                sharedbClient.updateDocument(cacheKey, content, {
                  work_id: docResult.chapter_info.work_id,
                  chapter_id: docResult.chapter_info.id,
                  chapter_number: docResult.chapter_info.chapter_number,
                }).then(() => {
                  console.log('✅ 已保存到缓存:', cacheKey);
                }).catch(err => {
                  console.error('❌ 保存到缓存失败:', err);
                });
              }
            } else {
              console.warn('⚠️ ShareDB 文档中没有内容');
            }
          } catch (docErr) {
            console.error('❌ 从 ShareDB 文档 API 获取失败:', docErr);
            
            // 如果 ShareDB 失败，尝试从普通章节 API 获取（作为后备）
            try {
              const chapter = await chaptersApi.getChapter(chapterId);
              console.log('📥 从章节 API 获取（后备）:', {
                chapterId: chapter.id,
                hasContent: !!chapter.content,
                contentLength: chapter.content?.length || 0,
              });
              
              if (chapter.content) {
                content = chapter.content;
                const cacheKey = workId 
                  ? `work_${workId}_chapter_${chapterId}` 
                  : `chapter_${chapterId}`;
                
                sharedbClient.updateDocument(cacheKey, chapter.content, {
                  work_id: chapter.work_id,
                  chapter_id: chapter.id,
                  chapter_number: chapter.chapter_number,
                }).catch(err => console.error('保存到缓存失败:', err));
              }
            } catch (err) {
              console.error('❌ 从章节 API 获取也失败:', err);
            }
          }
        }
        
        // 3. 设置编辑器内容
        console.log('✏️ 设置编辑器内容:', {
          hasContent: !!content,
          contentLength: content?.length || 0,
          contentPreview: content?.substring(0, 100) || 'null',
        });
        
        if (content && content.trim()) {
          editor.commands.setContent(content);
          console.log('✅ 编辑器内容已设置');
        } else {
          console.warn('⚠️ 内容为空，设置空编辑器');
          editor.commands.setContent('<p></p>');
        }
      } catch (err) {
        console.error('加载章节内容失败:', err);
        // 即使所有方法都失败，也显示空内容，保证编辑器可用
        editor.commands.setContent('<p></p>');
      }
    };

    loadChapterContent();
  }, [selectedChapter, editor]);

  // 自动保存章节内容（本地优先策略）
  useEffect(() => {
    if (!editor || !currentChapterIdRef.current) return;

    const handleUpdate = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        const chapterId = currentChapterIdRef.current;
        if (!chapterId) return;

        try {
          const content = editor.getHTML();
          // 使用 workId 和 chapterId 生成唯一的缓存键
          const documentId = workId 
            ? `work_${workId}_chapter_${chapterId}` 
            : `chapter_${chapterId}`;
          
          console.log('💾 自动保存章节内容:', {
            workId,
            chapterId,
            documentId,
            contentLength: content.length,
            contentPreview: content.substring(0, 100),
          });
          
          // 1. 立即保存到本地缓存（用户操作即时响应）
          await sharedbClient.updateDocument(documentId, content, {
            work_id: workId ? Number(workId) : undefined,
            chapter_id: chapterId,
            updated_at: new Date().toISOString(),
          });
          
          console.log('✅ 章节内容已保存到本地缓存:', documentId);
          
          // 2. 异步同步到服务器（不阻塞用户操作）
          syncManager.syncDocument(documentId).then(() => {
            console.log('✅ 已同步到服务器:', documentId);
          }).catch((err) => {
            console.error('❌ 同步到服务器失败（将在网络恢复后自动重试）:', err);
          });
        } catch (err) {
          console.error('❌ 保存到本地缓存失败:', err);
        }
      }, 2000); // 2秒后保存
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editor]);

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
  const handleSaveChapter = async (data: {
    id?: string;
    title: string;
    volumeId: string;
    volumeTitle: string;
    characters: string[];
    locations: string[];
    outline: string;
    detailOutline: string;
  }) => {
    if (!workId) return;

    try {
      // 如果是草稿，只更新本地状态
      if (data.volumeId === 'draft') {
        const chapterId = data.id || `draft-${Date.now()}`;
        setChaptersData(prev => ({
          ...prev,
          [chapterId]: {
            ...data,
            id: chapterId,
          },
        }));
        
        setDrafts(prev => {
          const existingIndex = prev.findIndex(d => d.id === chapterId);
          if (existingIndex >= 0) {
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
        return;
      }

      // 如果是编辑现有章节
      if (data.id && !isNaN(parseInt(data.id))) {
        const chapterId = parseInt(data.id);
        await chaptersApi.updateChapter(chapterId, {
          title: data.title,
        });
        
        // 更新本地状态
        setChaptersData(prev => ({
          ...prev,
          [data.id!]: {
            ...data,
            id: data.id!,
          },
        }));

        // 更新 volumes 中的章节信息
        setVolumes(prev => prev.map(vol => {
          if (vol.id === data.volumeId) {
            return {
              ...vol,
              chapters: vol.chapters.map(chap =>
                chap.id === data.id ? { ...chap, title: data.title } : chap
              ),
            };
          }
          return vol;
        }));
      } else {
        // 创建新章节
        const volNum = data.volumeId === 'draft' ? 0 : parseInt(data.volumeId.replace('vol', '')) || 0;
        
        // 计算章节号（获取该卷的最大章节号 + 1）
        // 使用 allChapters 中同一卷的章节的 chapter_number 来计算
        const volumeChapters = allChapters.filter(c => (c.volume_number || 0) === volNum);
        const maxChapterNumber = volumeChapters.length > 0
          ? Math.max(...volumeChapters.map(c => c.chapter_number || 0))
          : 0;
        
        const newChapter = await chaptersApi.createChapter({
          work_id: Number(workId),
          title: data.title,
          chapter_number: maxChapterNumber + 1,
          volume_number: volNum > 0 ? volNum : undefined,
        });

        const chapterId = String(newChapter.id);
        const newChapterNumber = maxChapterNumber + 1;
        
        // 更新 allChapters，添加新创建的章节
        setAllChapters(prev => [...prev, {
          ...newChapter,
          chapter_number: newChapterNumber,
        }]);
        
        setChaptersData(prev => ({
          ...prev,
          [chapterId]: {
            ...data,
            id: chapterId,
            chapter_number: newChapterNumber,  // 保存章节号
          },
        }));

        // 更新 volumes
        setVolumes(prev => prev.map(vol => {
          if (vol.id === data.volumeId) {
            return {
              ...vol,
              chapters: [...vol.chapters, {
                id: chapterId,
                volumeId: data.volumeId,
                title: data.title,
                chapter_number: newChapterNumber,  // 保存章节号
                characters: data.characters,
                locations: data.locations,
                outline: data.outline,
                detailOutline: data.detailOutline,
              }],
            };
          }
          return vol;
        }));
      }
    } catch (err) {
      console.error('保存章节失败:', err);
      alert(err instanceof Error ? err.message : '保存章节失败');
    }
  };

  // 删除章节
  const handleDeleteChapter = async (chapterId: string) => {
    if (!workId) return;

    try {
      // 如果是草稿，只从本地状态删除
      if (chapterId.startsWith('draft-')) {
        setDrafts(prev => prev.filter(d => d.id !== chapterId));
        setChaptersData(prev => {
          const newData = { ...prev };
          delete newData[chapterId];
          return newData;
        });
        // 如果删除的是当前选中的章节，清除选中状态
        if (selectedChapter === chapterId) {
          setSelectedChapter(null);
        }
        return;
      }

      // 如果是真实章节，调用API删除
      const chapterIdNum = parseInt(chapterId);
      if (isNaN(chapterIdNum)) {
        console.error('无效的章节ID:', chapterId);
        return;
      }

      await chaptersApi.deleteChapter(chapterIdNum);

      // 从 allChapters 中删除
      setAllChapters(prev => prev.filter(c => c.id !== chapterIdNum));

      // 从 chaptersData 中删除
      setChaptersData(prev => {
        const newData = { ...prev };
        delete newData[chapterId];
        return newData;
      });

      // 从 volumes 中删除
      setVolumes(prev => prev.map(vol => ({
        ...vol,
        chapters: vol.chapters.filter(c => c.id !== chapterId),
      })));

      // 如果删除的是当前选中的章节，清除选中状态
      if (selectedChapter === chapterId) {
        setSelectedChapter(null);
      }
    } catch (err) {
      console.error('删除章节失败:', err);
      alert(err instanceof Error ? err.message : '删除章节失败');
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

  if (loading) {
    return (
      <div className="novel-editor-page">
        <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>
      </div>
    );
  }

  if (error || !work) {
    return (
      <div className="novel-editor-page">
        <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
          {error || '作品不存在'}
          <button onClick={() => navigate('/works')} style={{ marginTop: '16px', padding: '8px 16px' }}>
            返回作品列表
          </button>
        </div>
      </div>
    );
  }

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
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                className="work-title-input"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={handleTitleKeyDown}
                placeholder="请输入作品标题"
              />
            ) : (
              <h1 
                className="work-title"
                onClick={() => setIsEditingTitle(true)}
                title="点击编辑标题"
              >
                {work.title}
              </h1>
            )}
            <div className="work-tags">
              {work?.work_type && (
                <span className="tag">
                  {work.work_type === 'long' ? '长篇' : work.work_type === 'short' ? '短篇' : work.work_type}
                </span>
              )}
              {work?.category && <span className="tag">{work.category}</span>}
              {work?.genre && <span className="tag">{work.genre}</span>}
              <span className={`status-tag ${syncStatus.isOnline ? 'online' : 'offline'}`}>
                {syncStatus.isOnline 
                  ? (syncStatus.pendingCount > 0 
                      ? `同步中 (${syncStatus.pendingCount})` 
                      : '已同步')
                  : '离线模式'}
              </span>
            </div>
          </div>
        </div>
        <div className="header-center">
          <div className="word-count">
            <span>本章字数: {editor ? editor.storage.characterCount?.characters() || 0 : 0}</span>
            <span>总字数: {work?.word_count || 0}</span>
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
          onChapterDelete={handleDeleteChapter}
          drafts={drafts}
          onDraftsChange={setDrafts}
          volumes={volumes}
          onVolumesChange={setVolumes}
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
        availableCharacters={hasCharacterModule ? availableCharacters : []}
        availableLocations={hasLocationModule ? availableLocations : []}
        onClose={() => setIsChapterModalOpen(false)}
        onSave={handleSaveChapter}
      />
    </div>
  );
}
