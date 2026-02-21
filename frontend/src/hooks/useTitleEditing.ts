/**
 * Hook: 标题编辑
 * 处理作品标题、章节名、章节号的内联编辑
 */

import { useRef, useCallback, useEffect } from 'react';
import { worksApi, type Work } from '../utils/worksApi';
import { chaptersApi } from '../utils/chaptersApi';
import type { ChapterFullData } from '../types/document';

export interface UseTitleEditingOptions {
  work: Work | null;
  workId: string | null;
  selectedChapter: string | null;
  chaptersData: Record<string, ChapterFullData>;
  onWorkUpdate: (work: Work) => void;
  onChapterTitleUpdate: (chapterId: string, newTitle: string) => void;
  onChapterNumberUpdate: (chapterId: string, newChapterNumber: number) => void;
  onError?: (msg: string) => void;
}

export interface UseTitleEditingReturn {
  titleEditableRef: React.RefObject<HTMLDivElement | null>;
  chapterNameInputRef: React.RefObject<HTMLDivElement | null>;
  chapterNumberInputRef: React.RefObject<HTMLDivElement | null>;
  handleSaveTitle: (e: React.FocusEvent<HTMLDivElement>) => Promise<void>;
  handleTitleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleSaveChapterName: (e: React.FocusEvent<HTMLDivElement>) => Promise<void>;
  handleChapterNameKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleSaveChapterNumber: (e: React.FocusEvent<HTMLDivElement>) => Promise<void>;
  handleChapterNumberKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  getChapterNumberDisplayText: (chapter: ChapterFullData) => string;
}

function getChapterNumberDisplayText(chapter: ChapterFullData): string {
  if (chapter.chapter_number !== undefined) {
    return `第${chapter.chapter_number}章`;
  }
  return chapter.volumeTitle || '';
}

export function useTitleEditing(options: UseTitleEditingOptions): UseTitleEditingReturn {
  const { work, workId, selectedChapter, chaptersData, onWorkUpdate, onChapterTitleUpdate, onChapterNumberUpdate, onError } = options;

  const titleEditableRef = useRef<HTMLDivElement | null>(null);
  const chapterNameInputRef = useRef<HTMLDivElement | null>(null);
  const chapterNumberInputRef = useRef<HTMLDivElement | null>(null);
  /** 防止连续编辑时旧请求后返回覆盖新结果（只应用与当前 pending 一致的响应） */
  const pendingChapterNumberRef = useRef<{ chapterId: string; num: number } | null>(null);

  /** 保存作品标题 */
  const handleSaveTitle = useCallback(async (e: React.FocusEvent<HTMLDivElement>) => {
    if (!work || !workId) return;

    const currentTitle = work.title || '';
    const newTitle = (e.currentTarget.textContent || '').trim();

    if (newTitle === currentTitle) return;

    if (!newTitle) {
      e.currentTarget.textContent = currentTitle;
      return;
    }

    try {
      const updatedWork = await worksApi.updateWork(workId, { title: newTitle });
      onWorkUpdate(updatedWork);
    } catch (err) {
      
      onError?.(err instanceof Error ? err.message : '更新标题失败');
      e.currentTarget.textContent = currentTitle;
    }
  }, [work, workId, onWorkUpdate, onError]);

  /** 标题键盘事件 */
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (work) {
        e.currentTarget.textContent = work.title || '';
        e.currentTarget.blur();
      }
    }
  }, [work]);

  /** 保存章节名 */
  const handleSaveChapterName = useCallback(async (e: React.FocusEvent<HTMLDivElement>) => {
    if (!selectedChapter || !chaptersData[selectedChapter]) return;

    const chapterId = parseInt(selectedChapter);
    const currentTitle = chaptersData[selectedChapter].title || '';
    const newTitle = (e.currentTarget.textContent || '').trim();

    if (newTitle === currentTitle) return;

    if (!newTitle) {
      e.currentTarget.textContent = currentTitle;
      return;
    }

    try {
      await chaptersApi.updateChapter(chapterId, { title: newTitle });
      onChapterTitleUpdate(selectedChapter, newTitle);
    } catch (err) {
      
      onError?.(err instanceof Error ? err.message : '更新章节名失败');
      e.currentTarget.textContent = currentTitle;
    }
  }, [selectedChapter, chaptersData, onChapterTitleUpdate, onError]);

  /** 章节名键盘事件 */
  const handleChapterNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (selectedChapter && chaptersData[selectedChapter]) {
        e.currentTarget.textContent = chaptersData[selectedChapter].title || '未命名章节';
        e.currentTarget.blur();
      }
    }
  }, [selectedChapter, chaptersData]);

  /** 从编辑文本解析章节号（支持 "第5章" 或 "5"） */
  const parseChapterNumber = useCallback((text: string): number | null => {
    const trimmed = (text || '').trim();
    const match = trimmed.match(/第?\s*(\d+)\s*章?/) || trimmed.match(/^(\d+)$/);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    return Number.isNaN(num) || num < 1 ? null : num;
  }, []);

  /** 保存章节号（开头保存 DOM 引用，避免 async 后 e.currentTarget 为 null；用 ref 避免旧请求覆盖新结果） */
  const handleSaveChapterNumber = useCallback(async (e: React.FocusEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!selectedChapter || !chaptersData[selectedChapter]) return;

    const chapterId = parseInt(selectedChapter);
    const chapter = chaptersData[selectedChapter];
    const currentDisplay = getChapterNumberDisplayText(chapter);
    const raw = (el.textContent || '').trim();
    const num = parseChapterNumber(raw);

    if (num === null) {
      el.textContent = currentDisplay;
      return;
    }

    const currentNum = chapter.chapter_number;
    if (currentNum === num) {
      el.textContent = currentDisplay;
      return;
    }

    pendingChapterNumberRef.current = { chapterId: selectedChapter, num };
    try {
      await chaptersApi.updateChapter(chapterId, { chapter_number: num });
      const stillLatest =
        pendingChapterNumberRef.current?.chapterId === selectedChapter &&
        pendingChapterNumberRef.current?.num === num;
      if (stillLatest) {
        onChapterNumberUpdate(selectedChapter, num);
        el.textContent = `第${num}章`;
      }
    } catch (err) {
      
      onError?.(err instanceof Error ? err.message : '更新章节号失败');
      if (el) el.textContent = currentDisplay;
    } finally {
      if (pendingChapterNumberRef.current?.chapterId === selectedChapter && pendingChapterNumberRef.current?.num === num) {
        pendingChapterNumberRef.current = null;
      }
    }
  }, [selectedChapter, chaptersData, onChapterNumberUpdate, onError, parseChapterNumber]);

  /** 章节号键盘事件 */
  const handleChapterNumberKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (selectedChapter && chaptersData[selectedChapter]) {
        e.currentTarget.textContent = getChapterNumberDisplayText(chaptersData[selectedChapter]);
        e.currentTarget.blur();
      }
    }
  }, [selectedChapter, chaptersData]);

  /** 章节切换或数据更新时同步章节号输入框显示 */
  useEffect(() => {
    if (!chapterNumberInputRef.current || document.activeElement === chapterNumberInputRef.current) return;
    if (!selectedChapter || !chaptersData[selectedChapter]) return;
    chapterNumberInputRef.current.textContent = getChapterNumberDisplayText(chaptersData[selectedChapter]);
  }, [selectedChapter, chaptersData]);

  return {
    titleEditableRef,
    chapterNameInputRef,
    chapterNumberInputRef,
    handleSaveTitle,
    handleTitleKeyDown,
    handleSaveChapterName,
    handleChapterNameKeyDown,
    handleSaveChapterNumber,
    handleChapterNumberKeyDown,
    getChapterNumberDisplayText,
  };
}
