/**
 * 章节内容加载工具
 * 处理章节内容的加载、缓存、同步等功能
 */

import { Editor } from '@tiptap/react';
import { documentCache } from './documentCache';
import { localCacheManager } from './localCacheManager';
import { chaptersApi } from './chaptersApi';
import { countCharacters } from './textUtils';
import type { ShareDBDocument, ChapterFullData } from '../types/document';
import type { Chapter } from './chaptersApi';

/**
 * 加载章节内容的参数接口
 */
export interface LoadChapterContentParams {
  // 基础参数
  chapterId: number;
  workId: string | null;
  selectedChapter: string | null;
  
  // 编辑器相关
  editor: Editor;
  
  // State setters
  setChapterLoading: (loading: boolean) => void;
  setChaptersData: React.Dispatch<React.SetStateAction<Record<string, ChapterFullData>>>;
  setCurrentChapterData: React.Dispatch<React.SetStateAction<ChapterFullData | undefined>>;
  setCurrentChapterWordCount: (count: number) => void;
  
  // State values
  chaptersData: Record<string, ChapterFullData>;
  allChapters: Chapter[];
  
  // Refs
  isChapterLoadingRef: React.MutableRefObject<boolean>;
  currentChapterIdRef: React.MutableRefObject<number | null>;
  lastSetContentRef: React.MutableRefObject<string>;
  
  // 函数
  stopSync: () => void;
}

/**
 * 加载章节内容
 */
export async function loadChapterContent(params: LoadChapterContentParams): Promise<void> {
  const {
    chapterId,
    workId,
    selectedChapter,
    editor,
    setChapterLoading,
    setChaptersData,
    setCurrentChapterData,
    setCurrentChapterWordCount,
    chaptersData,
    allChapters,
    isChapterLoadingRef,
    currentChapterIdRef,
    lastSetContentRef,
    stopSync,
  } = params;

  // 显示加载弹窗
  setChapterLoading(true);
  // 关键修复：设置加载状态标记，防止其他操作干扰
  isChapterLoadingRef.current = true;
  
  // 关键修复：在开始加载新章节前，立即停止智能同步的所有操作
  // 这样可以防止轮询、同步检查等在章节切换时干扰编辑器内容
  if (typeof stopSync === 'function') {
    stopSync();
  }
  
  try {
    // 关键修复：在加载新章节前，先保存当前章节的内容
    const previousChapterId = currentChapterIdRef.current;
    if (previousChapterId && previousChapterId !== chapterId && workId) {
      try {
        // 关键修复：立即清除所有待保存的定时器，避免保存到错误的章节
        // 这样可以防止自动保存在新章节加载后保存到前一个章节
        const saveTimeoutRef = (window as any).__chapterSaveTimeout;
        if (saveTimeoutRef?.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        
        // 关键修复：清除自动拉取定时器，避免拉取其他章节的内容
        const pullTimer = (window as any).__chapterPullTimer;
        if (pullTimer) {
          clearTimeout(pullTimer);
          delete (window as any).__chapterPullTimer;
        }
        
        // 等待一小段时间，确保所有异步保存操作完成
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 关键修复：在清空编辑器前，立即获取并保存当前章节内容
        // 此时编辑器还显示前一个章节的内容
        const currentContent = editor.getHTML();
        const previousDocumentId = `work_${workId}_chapter_${previousChapterId}`;
        
        console.log('💾 [切换章节] 保存前一个章节内容:', {
          previousChapterId,
          newChapterId: chapterId,
          previousDocumentId,
          contentLength: currentContent.length,
          contentPreview: currentContent.substring(0, 100),
          editorContent: editor.getHTML().substring(0, 100), // 验证编辑器内容
        });
        
        // 关键修复：验证编辑器内容确实属于前一个章节
        // 如果编辑器内容已经被清空或改变，说明可能已经切换了，不应该保存
        if (currentContent && currentContent.trim() !== '<p></p>' && currentContent.trim() !== '') {
          // 立即保存前一个章节的内容，使用同步方式确保保存完成
          // 关键修复：从 chaptersData 或 allChapters 中获取正确的章节号
          const previousChapterIdStr = String(previousChapterId);
          const previousChapterData = chaptersData[previousChapterIdStr];
          const previousChapter = allChapters.find(c => String(c.id) === previousChapterIdStr);
          const previousChapterNumber = previousChapterData?.chapter_number 
            || previousChapter?.chapter_number 
            || undefined;
          
          // 先保存到本地缓存
          await documentCache.updateDocument(previousDocumentId, currentContent, {
            work_id: Number(workId),
            chapter_id: previousChapterId,
            chapter_number: previousChapterNumber, // 关键修复：保存正确的章节号
            updated_at: new Date().toISOString(),
          });
          
          // 然后同步到服务器，确保数据持久化
          try {
            await documentCache.syncDocumentState(previousDocumentId, currentContent);
          } catch (syncErr) {
            console.warn('⚠️ [切换章节] 同步到服务器失败，但已保存到本地缓存:', syncErr);
          }
          
          // 验证保存是否成功
          const savedDoc = await documentCache.getDocument(previousDocumentId);
          if (savedDoc && typeof savedDoc.content === 'string') {
            if (savedDoc.content === currentContent) {
              // 保存成功
            } else {
              console.warn('⚠️ [切换章节] 保存的内容与原始内容不匹配，可能存在问题', {
                savedLength: savedDoc.content.length,
                originalLength: currentContent.length,
              });
            }
          }
        } else {
          console.warn('⚠️ [切换章节] 编辑器内容为空，跳过保存');
        }
      } catch (err) {
        console.error('❌ [切换章节] 保存前一个章节内容失败:', err);
      }
    }
    
    // 关键修复：在加载新章节前，先清空编辑器内容，避免显示旧内容
    // 注意：不要提前更新 currentChapterIdRef，因为自动保存还在使用它来验证章节ID
    
    // 清空编辑器时使用 emitUpdate: false，不触发更新事件，同时清除历史
    editor.commands.setContent('<p></p>', { emitUpdate: false });
    
    // 等待编辑器清空完成
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      // 使用 workId 和 chapterId 生成唯一的缓存键（统一使用新格式）
      if (!workId) {
        console.error('❌ [章节加载] workId 不存在，无法加载章节内容');
        setChapterLoading(false);
        return;
      }
      const documentId = `work_${workId}_chapter_${chapterId}`;
      
      let content: string | null = null;
      let serverDoc: ShareDBDocument | null = null; // 保存服务器文档，用于后续复用
      
      // 关键修复：先从服务器强制拉取最新版本，确保获取的是最新内容
      // 但要注意：如果服务器返回 document_exists: false，应该使用本地缓存
      
      try {
        serverDoc = await documentCache.forcePullFromServer(documentId);
        // 关键修复：检查服务器文档是否存在，如果不存在，不覆盖 content
        // forcePullFromServer 会调用 fetchFromServer，它会返回 document_exists 信息
        // 但 forcePullFromServer 返回的是 ShareDBDocument，不包含 document_exists
        // 所以我们需要在后续的 docResult 检查中处理
        if (serverDoc && serverDoc.content) {
          // 关键修复：如果内容是对象，提取 content 字段，而不是序列化整个对象
          let serverContent: string;
          if (typeof serverDoc.content === 'string') {
            serverContent = serverDoc.content;
          } else if (typeof serverDoc.content === 'object' && serverDoc.content !== null) {
            // 如果是对象，尝试提取 content 字段
            if ('content' in serverDoc.content) {
              // 如果 content 字段是字符串，直接使用
              if (typeof serverDoc.content.content === 'string') {
                serverContent = serverDoc.content.content;
              } else if (typeof serverDoc.content.content === 'object' && serverDoc.content.content !== null) {
                // 如果 content 字段还是对象，继续提取（嵌套情况）
                if ('content' in serverDoc.content.content && typeof serverDoc.content.content.content === 'string') {
                  serverContent = serverDoc.content.content.content;
                } else {
                  // 无法提取，记录警告
                  console.warn('⚠️ [章节加载] 文档内容是嵌套对象但无法提取字符串内容:', serverDoc.content);
                  serverContent = '';
                }
              } else {
                serverContent = '';
              }
            } else {
              // 如果没有 content 字段，序列化为字符串（不应该发生）
              console.warn('⚠️ [章节加载] 文档内容是对象但没有 content 字段:', serverDoc.content);
              serverContent = '';
            }
          } else {
            serverContent = '';
          }
          
          if (serverContent && serverContent.trim().length > 0) {
            content = serverContent;
            
            // 关键修复：从 chaptersData 或 allChapters 中获取正确的章节号
            const chapterIdStr = String(chapterId);
            const chapterData = chaptersData[chapterIdStr];
            const chapter = allChapters.find(c => String(c.id) === chapterIdStr);
            const chapterNumber = chapterData?.chapter_number 
              || chapter?.chapter_number 
              || serverDoc.metadata?.chapter_number
              || undefined;
            
            // 更新本地缓存
            await documentCache.updateDocument(documentId, content, {
              work_id: Number(workId),
              chapter_id: chapterId,
              chapter_number: chapterNumber, // 关键修复：保存正确的章节号
              updated_at: new Date().toISOString(),
            });
          }
        }
      } catch (pullErr) {
        console.warn('⚠️ [切换章节] 从服务器拉取失败，将使用本地缓存:', pullErr);
      }
      
      // 1. 如果服务器拉取失败，从本地缓存获取（即时响应）- 优先新格式，兼容旧格式
      // 关键修复：如果 serverDoc 已经存在，直接使用它，避免再次调用 getDocument（会重复请求）
      let cachedDoc: ShareDBDocument | null = null;
      
      if (serverDoc) {
        // 如果 forcePullFromServer 已经成功获取，直接使用它，避免重复请求
        cachedDoc = serverDoc;
      } else {
        // 只有在 serverDoc 不存在时，才从缓存获取
        try {
          // 关键修复：确保使用正确的文档ID，避免缓存键冲突
          console.log('🔍 [缓存检查] 开始获取缓存，文档ID:', {
            documentId,
            chapterId,
            workId,
          });
          
          // 先尝试新格式
          cachedDoc = await documentCache.getDocument(documentId);
        } catch (cacheErr) {
          console.warn('⚠️ 从缓存加载失败，将从服务器获取:', cacheErr);
        }
      }
      
      // 验证缓存内容是否属于当前章节
      if (cachedDoc) {
        const cachedChapterId = cachedDoc.metadata?.chapter_id;
        if (cachedChapterId && cachedChapterId !== chapterId) {
          console.warn('⚠️ [缓存检查] 缓存内容属于其他章节，清除缓存:', {
            cachedChapterId,
            expectedChapterId: chapterId,
            documentId,
          });
          // 清除错误的缓存
          await localCacheManager.delete(documentId);
          cachedDoc = null;
        }
      }
      
      if (cachedDoc) {
        // 处理不同的内容格式
        if (typeof cachedDoc.content === 'string') {
          if (cachedDoc.content.trim().length > 0) {
            content = cachedDoc.content;
          }
        } else if (cachedDoc.content && typeof cachedDoc.content === 'object') {
          // 如果内容是对象，尝试提取 content 字段（支持嵌套）
          let extractedContent: string | null = null;
          
          // 尝试提取 content 字段
          if ('content' in cachedDoc.content) {
            const innerContent = cachedDoc.content.content;
            if (typeof innerContent === 'string') {
              extractedContent = innerContent;
            } else if (typeof innerContent === 'object' && innerContent !== null && 'content' in innerContent) {
              // 嵌套情况：继续提取
              if (typeof innerContent.content === 'string') {
                extractedContent = innerContent.content;
              }
            }
          }
          
          if (extractedContent && extractedContent.trim().length > 0) {
            content = extractedContent;
          } else {
            // 无法提取有效内容，记录警告但不序列化整个对象
            console.warn('⚠️ [章节加载] 缓存内容是对象但无法提取有效字符串内容:', cachedDoc.content);
            content = ''; // 使用空字符串而不是序列化整个对象
          }
        }
        
        // 从缓存中读取 outline 和 detailed_outline（如果存在）
        if (cachedDoc.metadata?.outline || cachedDoc.metadata?.detailed_outline) {
          const chapterIdStr = String(chapterId);
          const cachedOutline = cachedDoc.metadata.outline || '';
          const cachedDetailedOutline = cachedDoc.metadata.detailed_outline || '';
          
          // 更新 chaptersData 中的章节数据
          setChaptersData(prev => {
            const updated = { ...prev };
            if (updated[chapterIdStr]) {
              updated[chapterIdStr] = {
                ...updated[chapterIdStr],
                outline: cachedOutline,
                detailOutline: cachedDetailedOutline,
              };
            }
            return updated;
          });
          
          // 如果当前选中的章节就是这个章节，也更新 currentChapterData
          if (selectedChapter === chapterIdStr) {
            setCurrentChapterData(prev => {
              if (prev && prev.id === chapterIdStr) {
                return {
                  ...prev,
                  outline: cachedOutline,
                  detailOutline: cachedDetailedOutline,
                };
              }
              return prev;
            });
          }
        }
      }
      
      // 2. 只有当 chaptersData 中没有大纲和细纲时，才从服务器获取章节信息
      // 避免频繁请求，优先使用已缓存的数据
      let docResult: any = null;
      const chapterIdStr = String(chapterId);
      const hasOutlineInCache = chaptersData[chapterIdStr]?.outline && chaptersData[chapterIdStr].outline.trim().length > 0;
      const hasDetailOutlineInCache = chaptersData[chapterIdStr]?.detailOutline && chaptersData[chapterIdStr].detailOutline.trim().length > 0;
      
      // 只有当缓存中没有大纲或细纲时，才从服务器获取
      if (!hasOutlineInCache || !hasDetailOutlineInCache) {
        try {
          // 关键修复：优先使用 forcePullFromServer 已经获取的结果，避免重复请求
          // 如果 serverDoc 中已经有 metadata，直接使用它
          if (serverDoc && serverDoc.metadata && (serverDoc.metadata.outline || serverDoc.metadata.detailed_outline)) {
            // 构造 docResult 格式，与 API 返回格式保持一致
            // 关键修复：使用 serverDoc.document_exists 的真实值
            // 注意：如果 serverDoc.document_exists 为 false，说明 MongoDB 没有数据
            docResult = {
              content: serverDoc.content,
              document_exists: serverDoc.document_exists === true, // 只有当明确为 true 时才认为存在
              chapter_info: {
                id: serverDoc.metadata.chapter_id || chapterId,
                work_id: serverDoc.metadata.work_id,
                chapter_number: serverDoc.metadata.chapter_number,
                metadata: {
                  outline: serverDoc.metadata.outline,
                  detailed_outline: serverDoc.metadata.detailed_outline,
                },
              },
            };
          } else {
            // 如果 serverDoc 中没有 metadata，使用 fetchFromServer（有去重机制）
            const fetchedDoc = await documentCache.fetchFromServer(documentId);
            if (fetchedDoc && fetchedDoc.metadata) {
              // 构造 docResult 格式
              // 关键修复：使用 fetchedDoc.document_exists 的真实值
              // 注意：如果 fetchedDoc.document_exists 为 false，说明 MongoDB 没有数据
              docResult = {
                content: fetchedDoc.content,
                document_exists: fetchedDoc.document_exists === true, // 只有当明确为 true 时才认为存在
                chapter_info: {
                  id: fetchedDoc.metadata.chapter_id || chapterId,
                  work_id: fetchedDoc.metadata.work_id,
                  chapter_number: fetchedDoc.metadata.chapter_number,
                  metadata: {
                    outline: fetchedDoc.metadata.outline,
                    detailed_outline: fetchedDoc.metadata.detailed_outline,
                  },
                },
              };
            } else {
              // 如果 fetchFromServer 也没有 metadata，才直接调用 API（这种情况应该很少）
              docResult = await chaptersApi.getChapterDocument(chapterId);
              // docResult 应该已经包含 document_exists 字段（从后端返回）
            }
          }
          
          // 更新章节的 outline 和 detailed_outline 到设置中
          if (docResult.chapter_info?.metadata) {
            const chapterIdStr = String(docResult.chapter_info.id);
            
            // 将对象格式的 outline 转换为字符串
            let outline = '';
            if (docResult.chapter_info.metadata.outline) {
              const outlineObj = docResult.chapter_info.metadata.outline as any;
              if (typeof outlineObj === 'object' && outlineObj !== null) {
                // 格式化大纲对象为可读字符串
                const parts: string[] = [];
                if (outlineObj.core_function) {
                  parts.push(`核心功能：${outlineObj.core_function}`);
                }
                if (outlineObj.key_points && Array.isArray(outlineObj.key_points)) {
                  parts.push(`关键情节点：\n${outlineObj.key_points.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`);
                }
                if (outlineObj.visual_scenes && Array.isArray(outlineObj.visual_scenes)) {
                  parts.push(`画面感：\n${outlineObj.visual_scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`);
                }
                if (outlineObj.atmosphere && Array.isArray(outlineObj.atmosphere)) {
                  parts.push(`氛围：${outlineObj.atmosphere.join('、')}`);
                }
                if (outlineObj.hook) {
                  parts.push(`结尾钩子：${outlineObj.hook}`);
                }
                outline = parts.join('\n\n');
              } else if (typeof outlineObj === 'string') {
                outline = outlineObj;
              }
            }
            
            // 将对象格式的 detailed_outline 转换为字符串
            let detailedOutline = '';
            if (docResult.chapter_info.metadata.detailed_outline) {
              const detailedObj = docResult.chapter_info.metadata.detailed_outline as any;
              if (typeof detailedObj === 'object' && detailedObj !== null) {
                // 格式化细纲对象为可读字符串
                if (detailedObj.sections && Array.isArray(detailedObj.sections)) {
                  detailedOutline = detailedObj.sections.map((section: any) => {
                    const sectionNum = section.section_number || '';
                    const sectionTitle = section.title || '';
                    const sectionContent = section.content || '';
                    return `${sectionNum}. ${sectionTitle}\n${sectionContent}`;
                  }).join('\n\n');
                } else {
                  detailedOutline = JSON.stringify(detailedObj, null, 2);
                }
              } else if (typeof detailedObj === 'string') {
                detailedOutline = detailedObj;
              }
            }
            
            // 更新 chaptersData 中的章节数据
            setChaptersData(prev => {
              const updated = { ...prev };
              if (updated[chapterIdStr]) {
                updated[chapterIdStr] = {
                  ...updated[chapterIdStr],
                  outline,
                  detailOutline: detailedOutline,
                };
              } else {
                // 如果章节数据不存在，创建新的数据
                const volNum = docResult.chapter_info.volume_number || 0;
                updated[chapterIdStr] = {
                  id: chapterIdStr,
                  volumeId: `vol${volNum}`,
                  volumeTitle: volNum === 0 ? '未分卷' : `第${volNum}卷`,
                  title: docResult.chapter_info.title,
                  chapter_number: docResult.chapter_info.chapter_number,
                  characters: [],
                  locations: [],
                  outline,
                  detailOutline: detailedOutline,
                };
              }
              return updated;
            });
            
            // 如果当前选中的章节就是这个章节，也更新 currentChapterData
            if (selectedChapter === chapterIdStr) {
              setCurrentChapterData(prev => {
                if (prev && prev.id === chapterIdStr) {
                  return {
                    ...prev,
                    outline,
                    detailOutline: detailedOutline,
                  };
                }
                return prev;
              });
            }
          }
          
          // 3. 如果缓存中没有内容，从 docResult 中提取内容
          // 关键修复：如果 MongoDB 没有数据（document_exists 为 false），优先使用本地缓存
          // 修复判断逻辑：明确检查 document_exists 字段
          if (docResult) {
            // 关键修复：只有当 document_exists 明确为 true 时才认为 MongoDB 有数据
            // 如果 document_exists 为 false、undefined 或 null，都认为 MongoDB 没有数据
            const documentExists = (docResult as any).document_exists === true;
            
            // 关键修复：检查内容是否有效
            // 如果 content 是字符串，检查是否为空或只包含空白
            // 如果 content 是对象，检查是否包含有效的 content 字段
            let hasContent = false;
            if (docResult.content) {
              if (typeof docResult.content === 'string') {
                // 关键修复：检查内容是否为空字符串或只包含空白
                // 同时检查是否是一个 JSON 字符串（可能是错误地将整个对象序列化了）
                const trimmed = docResult.content.trim();
                hasContent = trimmed.length > 0 && !trimmed.startsWith('{"document_id"');
              } else if (typeof docResult.content === 'object' && docResult.content !== null) {
                // 如果是对象，检查是否有有效的 content 字段
                if ('content' in docResult.content && typeof docResult.content.content === 'string') {
                  const innerContent = docResult.content.content.trim();
                  hasContent = innerContent.length > 0;
                }
              }
            }
            
            const shouldUseLocalCache = !documentExists || (!content && !hasContent);
            
            console.log('🔍 [loadChapterContent] 检查是否需要使用本地缓存:', {
              documentExists,
              hasContent,
              hasLocalContent: !!content,
              shouldUseLocalCache,
              docResultContentType: typeof docResult.content,
              docResultContentPreview: typeof docResult.content === 'string' 
                ? docResult.content.substring(0, 100) 
                : 'object',
              docResultDocumentExists: (docResult as any).document_exists,
            });
            
            if (shouldUseLocalCache) {
              // MongoDB 没有数据或内容为空，尝试从本地缓存获取
              console.log('⚠️ [loadChapterContent] MongoDB 没有数据，尝试使用本地缓存:', {
                documentExists,
                hasDocResultContent: !!docResult.content,
                contentLength: typeof docResult.content === 'string' ? docResult.content.length : 0,
              });
              
              const localCached = await localCacheManager.get<ShareDBDocument>(documentId);
              if (localCached) {
                let localContent: string;
                
                // 关键修复：确保只提取 content 字段，而不是整个对象
                if (typeof localCached.content === 'string') {
                  localContent = localCached.content;
                } else if (typeof localCached.content === 'object' && localCached.content !== null) {
                  // 如果 content 是对象，检查是否是整个 ShareDBDocument 对象被错误地存储了
                  if ('content' in localCached.content && typeof localCached.content.content === 'string') {
                    localContent = localCached.content.content;
                  } else if ('document_id' in localCached.content) {
                    // 如果包含 document_id，说明整个对象被错误地存储了，尝试提取 content 字段
                    console.warn('⚠️ [loadChapterContent] 检测到缓存中存储的是整个对象，尝试提取 content 字段');
                    const cachedObj = localCached.content as any;
                    if (typeof cachedObj.content === 'string') {
                      localContent = cachedObj.content;
                    } else {
                      console.warn('⚠️ [loadChapterContent] 无法从对象中提取 content 字段');
                      localContent = '';
                    }
                  } else {
                    // 尝试序列化对象（不应该发生，但作为后备）
                    console.warn('⚠️ [loadChapterContent] content 是对象但无法提取字符串，尝试序列化');
                    localContent = JSON.stringify(localCached.content);
                  }
                } else {
                  localContent = String(localCached.content || '');
                }
                
                // 关键修复：检查是否是 JSON 对象字符串（整个对象被序列化了）
                if (localContent && localContent.trim().length > 0) {
                  const trimmed = localContent.trim();
                  if (trimmed.startsWith('{"document_id"') || trimmed.startsWith('{"id"')) {
                    // 这是一个 JSON 对象字符串，不是实际内容
                    console.warn('⚠️ [loadChapterContent] 检测到缓存内容是 JSON 对象字符串，尝试解析:', trimmed.substring(0, 200));
                    try {
                      const parsed = JSON.parse(trimmed);
                      if (typeof parsed.content === 'string') {
                        localContent = parsed.content;
                      } else {
                        console.warn('⚠️ [loadChapterContent] 解析后的对象没有 content 字段');
                        localContent = '';
                      }
                    } catch (parseErr) {
                      console.error('❌ [loadChapterContent] 解析 JSON 失败:', parseErr);
                      localContent = '';
                    }
                  }
                }
                
                if (localContent && localContent.trim().length > 0) {
                  console.log('✅ [loadChapterContent] 使用本地缓存内容:', {
                    documentId,
                    contentLength: localContent.length,
                    contentPreview: localContent.substring(0, 100),
                  });
                  content = localContent;
                  
                  // 关键修复：将本地缓存内容同步回 MongoDB，并传递 metadata
                  // 因为 MongoDB 没有数据，需要将本地缓存的内容写回服务器
                  try {
                    console.log('🔄 [loadChapterContent] 开始将本地缓存同步回 MongoDB...');
                    
                    // 获取缓存的 metadata（如果有）
                    const cachedMetadata = localCached.metadata || {};
                    
                    const syncResult = await documentCache.syncDocumentState(
                      documentId,
                      localContent, // 使用本地缓存的内容
                      undefined, // contentJson 可以为 undefined
                      cachedMetadata // 传递 metadata
                    );
                    
                    if (syncResult.success) {
                      console.log('✅ [loadChapterContent] 本地缓存已成功同步回 MongoDB:', {
                        documentId,
                        version: syncResult.version,
                      });
                    } else {
                      console.warn('⚠️ [loadChapterContent] 同步回 MongoDB 失败:', syncResult.error);
                    }
                  } catch (syncErr) {
                    console.error('❌ [loadChapterContent] 同步回 MongoDB 时出错:', syncErr);
                    // 即使同步失败，也继续使用本地缓存内容
                  }
                } else {
                  console.warn('⚠️ [loadChapterContent] 本地缓存也没有内容或内容为空');
                }
              } else {
                console.warn('⚠️ [loadChapterContent] 本地缓存不存在或没有内容');
              }
            } else {
              console.log('✅ [loadChapterContent] MongoDB 有数据，使用服务器内容');
            }
          }
          
          // 如果仍然没有内容，从 docResult 中提取内容（仅在 document_exists 为 true 时）
          if (!content && docResult && (docResult as any).document_exists === true && docResult.content) {
            console.log('📦 ShareDB 文档结构:', {
              isString: typeof docResult.content === 'string',
              isObject: typeof docResult.content === 'object',
              keys: typeof docResult.content === 'object' ? Object.keys(docResult.content) : 'N/A',
              contentValue: typeof docResult.content === 'object' && 'content' in docResult.content
                ? (typeof docResult.content.content === 'string' 
                    ? docResult.content.content.substring(0, 200) 
                    : JSON.stringify(docResult.content.content).substring(0, 200))
                : 'N/A',
            });
            
            // 处理不同的内容格式
            if (typeof docResult.content === 'string') {
              // 关键修复：检查是否是 JSON 字符串（可能是错误地将整个对象序列化了）
              const trimmed = docResult.content.trim();
              if (trimmed.startsWith('{"document_id"') || trimmed.startsWith('{"id"')) {
                // 这是一个 JSON 对象字符串，不是实际内容
                console.warn('⚠️ [loadChapterContent] 检测到 content 是 JSON 对象字符串，不是实际内容:', trimmed.substring(0, 200));
                content = null; // 不设置无效内容
              } else {
                // 直接是字符串内容
                content = docResult.content;
              }
            } else if (docResult.content && typeof docResult.content === 'object') {
              // ShareDB 文档对象格式：{ id, content, title, metadata, ... }
              
              if ('content' in docResult.content) {
                const innerContent = docResult.content.content;
                
                if (typeof innerContent === 'string') {
                  // 字符串内容
                  if (innerContent.trim().length > 0) {
                    content = innerContent;
                  } else {
                    console.warn('⚠️ ShareDB 中 content 字段是空字符串，可能内容未保存');
                    // 即使 ShareDB 为空，也设置空内容，让用户可以编辑
                    content = '';
                  }
                } else if (innerContent === null || innerContent === undefined) {
                  console.warn('⚠️ content 字段是 null 或 undefined');
                  content = null;
                } else if (innerContent && typeof innerContent === 'object') {
                  // 如果 content 还是对象，可能是 TipTap 格式或其他格式
                  console.log('📝 content 是对象，结构:', {
                    keys: Object.keys(innerContent),
                    type: (innerContent as any).type,
                  });
                  
                  if ('type' in innerContent && innerContent.type === 'doc') {
                    // TipTap 文档格式，需要转换为 HTML
                    // 这里可以添加 TipTap 到 HTML 的转换逻辑
                    // 暂时序列化
                    content = JSON.stringify(innerContent);
                  } else {
                    // 尝试查找可能的文本内容
                    const textContent = (innerContent as any).text || 
                                      (innerContent as any).html ||
                                      (innerContent as any).body;
                    if (textContent && typeof textContent === 'string') {
                      content = textContent;
                    } else {
                      content = JSON.stringify(innerContent);
                    }
                  }
                } else {
                  console.warn('⚠️ content 字段格式未知:', typeof innerContent, innerContent);
                  content = null;
                }
              } else {
                // 尝试查找可能的 content 字段
                const possibleContent = (docResult.content as any).html ||
                                       (docResult.content as any).text ||
                                       (docResult.content as any).body ||
                                       (docResult.content as any).data;
                if (possibleContent && typeof possibleContent === 'string' && possibleContent.trim().length > 0) {
                  content = possibleContent;
                } else {
                  // 打印所有键值对用于调试
                  console.warn('⚠️ 无法提取内容，文档对象的所有键值:', 
                    Object.keys(docResult.content).reduce((acc, key) => {
                      acc[key] = typeof (docResult.content as any)[key];
                      return acc;
                    }, {} as Record<string, string>)
                  );
                  content = null; // 不设置无效内容
                }
              }
            }
            
            // 如果成功获取内容，保存到缓存（包含 outline 和 detailed_outline）
            if (content) {
              if (!workId) {
                console.error('❌ [缓存] workId 不存在，无法保存到缓存');
                return;
              }
              const cacheKey = `work_${workId}_chapter_${chapterId}`;
              
              // 提取 outline 和 detailed_outline（如果存在）
              let outline = '';
              let detailedOutline = '';
              if (docResult.chapter_info?.metadata) {
                // 将对象格式的 outline 转换为字符串
                if (docResult.chapter_info.metadata.outline) {
                  const outlineObj = docResult.chapter_info.metadata.outline as any;
                  if (typeof outlineObj === 'object' && outlineObj !== null) {
                    const parts: string[] = [];
                    if (outlineObj.core_function) {
                      parts.push(`核心功能：${outlineObj.core_function}`);
                    }
                    if (outlineObj.key_points && Array.isArray(outlineObj.key_points)) {
                      parts.push(`关键情节点：\n${outlineObj.key_points.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`);
                    }
                    if (outlineObj.visual_scenes && Array.isArray(outlineObj.visual_scenes)) {
                      parts.push(`画面感：\n${outlineObj.visual_scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`);
                    }
                    if (outlineObj.atmosphere && Array.isArray(outlineObj.atmosphere)) {
                      parts.push(`氛围：${outlineObj.atmosphere.join('、')}`);
                    }
                    if (outlineObj.hook) {
                      parts.push(`结尾钩子：${outlineObj.hook}`);
                    }
                    outline = parts.join('\n\n');
                  } else if (typeof outlineObj === 'string') {
                    outline = outlineObj;
                  }
                }
                
                // 将对象格式的 detailed_outline 转换为字符串
                if (docResult.chapter_info.metadata.detailed_outline) {
                  const detailedObj = docResult.chapter_info.metadata.detailed_outline as any;
                  if (typeof detailedObj === 'object' && detailedObj !== null) {
                    if (detailedObj.sections && Array.isArray(detailedObj.sections)) {
                      detailedOutline = detailedObj.sections.map((section: any) => {
                        const sectionNum = section.section_number || '';
                        const sectionTitle = section.title || '';
                        const sectionContent = section.content || '';
                        return `${sectionNum}. ${sectionTitle}\n${sectionContent}`;
                      }).join('\n\n');
                    } else {
                      detailedOutline = JSON.stringify(detailedObj, null, 2);
                    }
                  } else if (typeof detailedObj === 'string') {
                    detailedOutline = detailedObj;
                  }
                }
              }
              
              console.log('💾 保存到缓存（包含大纲和细纲）:', {
                cacheKey,
                contentLength: content.length,
                hasOutline: !!outline,
                hasDetailedOutline: !!detailedOutline,
              });
              
              documentCache.updateDocument(cacheKey, content, {
                work_id: docResult.chapter_info.work_id,
                chapter_id: docResult.chapter_info.id,
                chapter_number: docResult.chapter_info.chapter_number,
                title: docResult.chapter_info.title, // 关键修复：保存章节标题
                outline: outline || undefined,
                detailed_outline: detailedOutline || undefined,
              }).then(() => {
                // 保存成功
              }).catch(err => {
                console.error('❌ 保存到缓存失败:', err);
              });
            }
          } else {
            console.warn('⚠️ ShareDB 文档中没有内容');
          }
        } catch (docErr) {
          // 如果 ShareDB 失败，尝试从普通章节 API 获取（作为后备）
          // 注意：这个 API 不包含大纲和细纲，只用于获取内容
          if (!content) {
            try {
              const chapter = await chaptersApi.getChapter(chapterId);
              console.log('📥 从章节 API 获取（后备）:', {
                chapterId: chapter.id,
                hasContent: !!chapter.content,
                contentLength: chapter.content?.length || 0,
              });
              
              if (chapter.content) {
                content = chapter.content;
                if (!workId) {
                  console.error('❌ [缓存] workId 不存在，无法保存到缓存');
                  return;
                }
                const cacheKey = `work_${workId}_chapter_${chapterId}`;
                
                documentCache.updateDocument(cacheKey, chapter.content, {
                  work_id: chapter.work_id,
                  chapter_id: chapter.id,
                  chapter_number: chapter.chapter_number,
                  title: chapter.title, // 关键修复：保存章节标题
                }).catch(err => console.error('保存到缓存失败:', err));
              }
            } catch (err) {
              console.error('❌ 从章节 API 获取也失败:', err);
            }
          }
        }
      }
      
      // 关键修复：在设置编辑器前，添加调试日志
      console.log('🎯 [loadChapterContent] 准备设置编辑器内容:', {
        hasContent: content !== null && content !== undefined,
        contentType: typeof content,
        contentLength: typeof content === 'string' ? content.length : 0,
        contentPreview: typeof content === 'string' ? content.substring(0, 100) : 'N/A',
        chapterId,
        documentId,
      });
      
      // 即使内容为空，也设置编辑器（允许用户开始编辑）
      if (content !== null) {
        // content 可能是空字符串，这是正常的（新章节）
        // 关键修复：验证内容确实属于当前章节
        if (!workId) {
          console.error('❌ [章节加载] workId 不存在');
          setChapterLoading(false);
          return;
        }

        // 关键修复：防止频闪 - 检查是否与上次设置的内容相同
        // 但在章节切换时，即使内容相同也要设置，因为这是新章节的内容
        // 关键修复：改进HTML格式检测和转换逻辑，确保格式不丢失
        const convertTextToHtml = (text: string): string => {
          if (!text || text.trim() === '') {
            return '<p></p>';
          }
          
          // 更准确地检测HTML格式：检查是否包含HTML标签（如 <p>, <br>, <div> 等）
          const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
          const hasHtmlTags = htmlTagPattern.test(text);
          
          // 如果已经是 HTML 格式（包含HTML标签），直接返回，不做转换
          if (hasHtmlTags) {
            // 验证HTML格式是否完整，如果不完整则进行修复
            const trimmed = text.trim();
            // 如果内容以标签开始和结束，说明是完整的HTML
            if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
              return text;
            }
            // 如果包含HTML标签但格式不完整，尝试修复
            // 例如：只有内容没有外层标签，添加段落标签
            if (trimmed.includes('<p>') || trimmed.includes('<br>') || trimmed.includes('<div>')) {
              return text; // 已经有HTML标签，直接返回
            }
          }
          
          // 将纯文本转换为 HTML：换行符转换为段落
          // 多个连续换行符转换为段落分隔
          return text
            .split(/\n\s*\n/) // 按双换行符分割段落
            .map(para => para.trim())
            .filter(para => para.length > 0)
            .map(para => {
              // 段落内的单换行符转换为 <br>
              return `<p>${para.replace(/\n/g, '<br>')}</p>`;
            })
            .join('') || '<p></p>';
        };
        
        const normalizedContent = convertTextToHtml(content || '');
        const shouldSetContent = lastSetContentRef.current !== normalizedContent || 
                                 (currentChapterIdRef.current !== chapterId);
        
        if (shouldSetContent) {
          // 关键修复：设置内容时确保格式被正确解析和保留
          // TipTap 会自动规范化HTML，但我们需要确保格式信息不丢失
          editor.commands.setContent(normalizedContent, { 
            emitUpdate: false
          });
          
          // 使用 setTimeout 确保内容设置完成后再更新字数
          setTimeout(() => {
            // 更新字数显示
            const wordCount = countCharacters(editor.getHTML());
            setCurrentChapterWordCount(wordCount);
            
            // 关键修复：验证设置后的内容格式
            const setContent = editor.getHTML();
            // 不进行严格比较，因为TipTap可能会规范化HTML（如添加/删除空格）
            // 只检查关键内容是否存在
            const normalizedSet = setContent.trim();
            const normalizedExpected = normalizedContent.trim();
            
            if (normalizedSet.length === 0 && normalizedExpected.length > 0) {
              console.warn('⚠️ [设置编辑器] 内容设置后为空，可能存在格式问题', {
                expected: normalizedExpected.substring(0, 100),
                actual: normalizedSet
              });
            }
          }, 0);
          
          lastSetContentRef.current = normalizedContent; // 记录已设置的内容
        }
      } else {
        // 如果 content 是 null（获取失败），设置空编辑器
        console.warn('⚠️ 内容获取失败，设置空编辑器');
        editor.commands.setContent('<p></p>');
        setCurrentChapterWordCount(0);
      }
      
      // 在内容加载完成后，更新 currentChapterIdRef
      // 这样下次切换章节时能正确保存当前章节
      currentChapterIdRef.current = chapterId;
      
      // 关键修复：章节内容加载完成后，清除加载状态标记
      // 注意：这里不立即重新启动智能同步，因为 useIntelligentSync 的 useEffect 会在 documentId 变化时自动重新启动
      isChapterLoadingRef.current = false;

      // 关键修复：章节切换后延迟从服务器拉取最新更新
      // 延迟执行，避免与轮询冲突，减少频繁请求
      // 轮询会在10秒后自动检查更新，这里延迟5秒，给轮询留出时间
      // 使用一个标记来跟踪这个定时器，方便在切换章节时清除
      const pullTimer = setTimeout(async () => {
        try {
          // 关键修复：再次验证章节ID，确保没有切换章节
          const currentChapterIdCheck = currentChapterIdRef.current;
          if (currentChapterIdCheck !== chapterId) {
            console.warn('⚠️ [自动拉取] 章节已切换，跳过拉取:', {
              currentChapterIdRef: currentChapterIdCheck,
              expectedChapterId: chapterId,
            });
            return;
          }
          
          const serverDoc = await documentCache.forcePullFromServer(documentId);
          
          // 再次验证章节ID（可能在异步操作期间切换了）
          const currentChapterIdCheck2 = currentChapterIdRef.current;
          if (currentChapterIdCheck2 !== chapterId) {
            console.warn('⚠️ [自动拉取] 章节在拉取期间已切换，跳过更新:', {
              currentChapterIdRef: currentChapterIdCheck2,
              expectedChapterId: chapterId,
            });
            return;
          }
          
          if (serverDoc && serverDoc.content) {
            const serverContent = typeof serverDoc.content === 'string' 
              ? serverDoc.content 
              : JSON.stringify(serverDoc.content);
            
            // 关键修复：验证服务器内容确实属于当前章节
            const serverChapterId = serverDoc.metadata?.chapter_id;
            if (serverChapterId && serverChapterId !== chapterId) {
              console.error('❌ [自动拉取] 严重错误：服务器内容属于其他章节！', {
                serverChapterId,
                expectedChapterId: chapterId,
                documentId,
              });
              return; // 不更新，避免覆盖错误的内容
            }
            
            // 关键修复：如果正在加载章节，不更新内容，避免干扰章节加载
            if (isChapterLoadingRef.current) {
              return;
            }
            
            // 关键修复：防止频闪 - 检查是否与上次设置的内容相同
            if (lastSetContentRef.current === serverContent) {
              return;
            }
            
            // 关键修复：使用相同的HTML格式转换逻辑，确保格式一致
            const convertTextToHtml = (text: string): string => {
              if (!text || text.trim() === '') {
                return '<p></p>';
              }
              
              // 更准确地检测HTML格式：检查是否包含HTML标签
              const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
              const hasHtmlTags = htmlTagPattern.test(text);
              
              // 如果已经是 HTML 格式（包含HTML标签），直接返回
              if (hasHtmlTags) {
                const trimmed = text.trim();
                if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
                  return text;
                }
                if (trimmed.includes('<p>') || trimmed.includes('<br>') || trimmed.includes('<div>')) {
                  return text;
                }
              }
              
              // 将纯文本转换为 HTML：换行符转换为段落
              return text
                .split(/\n\s*\n/) // 按双换行符分割段落
                .map(para => para.trim())
                .filter(para => para.length > 0)
                .map(para => {
                  // 段落内的单换行符转换为 <br>
                  return `<p>${para.replace(/\n/g, '<br>')}</p>`;
                })
                .join('') || '<p></p>';
            };
            
            // 确保服务器内容是 HTML 格式
            const htmlServerContent = convertTextToHtml(serverContent);
            
            // 如果服务器内容与当前编辑器内容不同，更新编辑器
            const currentContent = editor.getHTML();
            
            // 关键修复：更严格的内容比较
            const normalizeContent = (content: string) => {
              return content.trim().replace(/\s+/g, ' ');
            };
            
            const normalizedCurrent = normalizeContent(currentContent);
            const normalizedServer = normalizeContent(htmlServerContent);
            
            if (normalizedCurrent !== normalizedServer) {
              console.log('✅ [自动拉取] 检测到服务器有新内容，更新编辑器:', {
                serverVersion: serverDoc.version,
                serverContentLength: htmlServerContent.length,
                currentContentLength: currentContent.length
              });
              // 关键修复：设置内容时确保格式被正确解析和保留
              editor.commands.setContent(htmlServerContent, { 
                emitUpdate: false
              });
              lastSetContentRef.current = serverContent; // 记录已设置的内容
            } else {
              lastSetContentRef.current = serverContent; // 更新记录，避免下次重复检查
            }
          }
        } catch (pullErr) {
          // 拉取失败不影响编辑器使用，只记录错误
          console.warn('⚠️ [自动拉取] 从服务器拉取更新失败（不影响使用）:', pullErr);
        }
      }, 5000); // 延迟5秒，避免与轮询冲突
      
      // 将定时器存储到 ref 中，方便在切换章节时清除
      (window as any).__chapterPullTimer = pullTimer;
      
      // 隐藏加载动画
      setChapterLoading(false);
      // 关键修复：确保在加载完成或失败时都清除加载状态标记
      isChapterLoadingRef.current = false;
    } catch (err) {
      console.error('加载章节内容失败（内层）:', err);
      // 即使所有方法都失败，也显示空内容，保证编辑器可用
      editor.commands.setContent('<p></p>');
      // 隐藏加载动画
      setChapterLoading(false);
      // 关键修复：确保在加载失败时也清除加载状态标记
      isChapterLoadingRef.current = false;
    }
  } catch (err) {
    console.error('加载章节内容失败（外层）:', err);
    // 即使所有方法都失败，也显示空内容，保证编辑器可用
    editor.commands.setContent('<p></p>');
    // 隐藏加载动画
    setChapterLoading(false);
    // 关键修复：确保在加载失败时也清除加载状态标记
    isChapterLoadingRef.current = false;
  }
}
