import { useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { Undo2, Redo2, Save, Type, Bold, Underline, ChevronDown, Settings } from 'lucide-react';

interface ChapterEditorToolbarProps {
  editor: Editor | null;
  onManualSave: () => void;
  onEditChapter?: () => void;
  headingMenuOpen: boolean;
  setHeadingMenuOpen: (open: boolean) => void;
}

export default function ChapterEditorToolbar({
  editor,
  onManualSave,
  onEditChapter,
  headingMenuOpen,
  setHeadingMenuOpen,
}: ChapterEditorToolbarProps) {
  const headingMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭标题下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headingMenuRef.current && !headingMenuRef.current.contains(event.target as Node)) {
        setHeadingMenuOpen(false);
      }
    };

    if (headingMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [headingMenuOpen, setHeadingMenuOpen]);

  return (
    <div className="novel-editor-toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => {
            // 关键修复：每个章节有独立的编辑器实例，直接执行撤销即可
            if (!editor) return;
            editor.chain().focus().undo().run();
          }}
          disabled={!editor?.can().undo()}
          title="撤销"
        >
          <Undo2 size={16} />
        </button>
        <button
          className="toolbar-btn"
          onClick={() => {
            // 关键修复：每个章节有独立的编辑器实例，直接执行重做即可
            if (!editor) return;
            editor.chain().focus().redo().run();
          }}
          disabled={!editor?.can().redo()}
          title="重做"
        >
          <Redo2 size={16} />
        </button>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        {/* 标题下拉菜单 */}
        <div className="toolbar-dropdown" ref={headingMenuRef}>
          <button
            className="toolbar-btn"
            onClick={() => setHeadingMenuOpen(!headingMenuOpen)}
            title="标题样式"
          >
            <Type size={16} />
            <span>H1</span>
            <ChevronDown size={14} style={{ marginLeft: '4px' }} />
          </button>
          {headingMenuOpen && (
            <div className="toolbar-dropdown-menu">
              <button
                className="toolbar-dropdown-item"
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 1 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="一级标题 (Markdown: # 标题)"
              >
                <span className="heading-label">H1</span>
                <span className="heading-preview">一级标题</span>
              </button>
              <button
                className="toolbar-dropdown-item"
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 2 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="二级标题 (Markdown: ## 标题)"
              >
                <span className="heading-label">H2</span>
                <span className="heading-preview">二级标题</span>
              </button>
              <button
                className="toolbar-dropdown-item"
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 3 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="三级标题 (Markdown: ### 标题)"
              >
                <span className="heading-label">H3</span>
                <span className="heading-preview">三级标题</span>
              </button>
              <button
                className="toolbar-dropdown-item"
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 4 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="四级标题 (Markdown: #### 标题)"
              >
                <span className="heading-label">H4</span>
                <span className="heading-preview">四级标题</span>
              </button>
              <button
                className="toolbar-dropdown-item"
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 5 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="五级标题 (Markdown: ##### 标题)"
              >
                <span className="heading-label">H5</span>
                <span className="heading-preview">五级标题</span>
              </button>
              <button
                className="toolbar-dropdown-item"
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 6 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="六级标题 (Markdown: ###### 标题)"
              >
                <span className="heading-label">H6</span>
                <span className="heading-preview">六级标题</span>
              </button>
              <div className="toolbar-dropdown-divider" />
              <button
                className="toolbar-dropdown-item"
                onClick={() => {
                  editor?.chain().focus().setParagraph().run();
                  setHeadingMenuOpen(false);
                }}
                title="普通段落"
              >
                <span className="heading-label">P</span>
                <span className="heading-preview">普通段落</span>
              </button>
            </div>
          )}
        </div>
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
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={onManualSave}
          title="保存当前章节"
        >
          <Save size={16} />
        </button>
        {onEditChapter && (
          <button
            className="toolbar-btn"
            onClick={onEditChapter}
            title="章节设置"
          >
            <Settings size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

