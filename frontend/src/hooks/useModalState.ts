/**
 * Hook: 模态框状态管理
 * 统一管理所有弹窗的状态
 */

import { useState, useCallback } from 'react';
import type { MessageType } from '../components/common/MessageModal';
import type { ChapterFullData } from '../types/document';

export interface UseModalStateReturn {
  // 章节设置弹窗
  isChapterModalOpen: boolean;
  chapterModalMode: 'create' | 'edit';
  currentVolumeId: string;
  currentVolumeTitle: string;
  currentChapterData: ChapterFullData | undefined;
  openChapterModal: (mode: 'create' | 'edit', volumeId?: string, volumeTitle?: string, chapterData?: ChapterFullData) => void;
  closeChapterModal: () => void;
  
  // 消息提示
  messageState: MessageState;
  showMessage: (message: string, type?: MessageType, title?: string, onConfirm?: () => void, options?: ShowMessageOptions) => void;
  closeMessage: () => void;
}

export interface ShowMessageOptions {
  /** 仅提示、无确定/取消按钮，自动关闭（用于替换成功等轻提示） */
  toast?: boolean;
  /** 自动关闭延迟（毫秒），toast 时默认 2000 */
  autoCloseMs?: number;
}

export interface MessageState {
  isOpen: boolean;
  type: MessageType;
  message: string;
  title?: string;
  onConfirm?: () => void;
  toast?: boolean;
  autoCloseMs?: number;
}

export function useModalState(): UseModalStateReturn {
  // 章节设置弹窗
  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);
  const [chapterModalMode, setChapterModalMode] = useState<'create' | 'edit'>('create');
  const [currentVolumeId, setCurrentVolumeId] = useState('');
  const [currentVolumeTitle, setCurrentVolumeTitle] = useState('');
  const [currentChapterData, setCurrentChapterData] = useState<ChapterFullData | undefined>();
  
  // 消息提示
  const [messageState, setMessageState] = useState<MessageState>({
    isOpen: false,
    type: 'info',
    message: '',
  });
  
  const openChapterModal = useCallback((
    mode: 'create' | 'edit',
    volumeId?: string,
    volumeTitle?: string,
    chapterData?: ChapterFullData
  ) => {
    setChapterModalMode(mode);
    setCurrentVolumeId(volumeId || '');
    setCurrentVolumeTitle(volumeTitle || '');
    setCurrentChapterData(chapterData);
    setIsChapterModalOpen(true);
  }, []);
  
  const closeChapterModal = useCallback(() => {
    setIsChapterModalOpen(false);
    setCurrentChapterData(undefined);
  }, []);
  
  const showMessage = useCallback((
    message: string,
    type: MessageType = 'info',
    title?: string,
    onConfirm?: () => void,
    options?: ShowMessageOptions
  ) => {
    setMessageState({
      isOpen: true,
      type,
      message,
      title,
      onConfirm,
      toast: options?.toast,
      autoCloseMs: options?.autoCloseMs ?? (options?.toast ? 2000 : undefined),
    });
  }, []);
  
  const closeMessage = useCallback(() => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  }, []);
  
  return {
    isChapterModalOpen,
    chapterModalMode,
    currentVolumeId,
    currentVolumeTitle,
    currentChapterData,
    openChapterModal,
    closeChapterModal,
    messageState,
    showMessage,
    closeMessage,
  };
}
