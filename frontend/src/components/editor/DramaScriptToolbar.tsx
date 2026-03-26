import { useState } from 'react';
import { Undo2, Redo2, Copy, Check } from 'lucide-react';
import { Editor } from '@tiptap/react';
import { copyToClipboard } from '../../utils/clipboard';

interface DramaScriptToolbarProps {
  editor: Editor | null;
}

const FORMAT_BUTTONS = [
  { id: 'scene',     label: '场次',   title: 'INT./EXT. 场次标题',       className: 'scene-btn' },
  { id: 'action',    label: '动作',   title: '动作描述段落',              className: '' },
  { id: 'character', label: '角色名', title: '角色名（居中大写）',         className: '' },
  { id: 'dialogue',  label: '对白',   title: '对白（居中缩进）',          className: '' },
  { id: 'direction', label: '舞台提示', title: '括弧舞台提示（斜体居中）', className: '' },
] as const;

type FormatId = (typeof FORMAT_BUTTONS)[number]['id'];

function getActiveFormat(editor: Editor | null): FormatId | null {
  if (!editor) return null;
  if (editor.isActive('heading', { level: 1 })) return 'scene';
  if (editor.isActive('heading', { level: 2 })) return 'character';
  if (editor.isActive('heading', { level: 3 })) return 'direction';
  if (editor.isActive('blockquote')) return 'dialogue';
  if (editor.isActive('paragraph')) return 'action';
  return null;
}

function applyFormat(editor: Editor, id: FormatId) {
  const chain = editor.chain().focus();
  switch (id) {
    case 'scene':
      chain.setHeading({ level: 1 }).run();
      break;
    case 'action':
      // 如果当前在 blockquote 内，先 lift 出来
      if (editor.isActive('blockquote')) {
        chain.liftEmptyBlock().run();
        editor.chain().focus().setParagraph().run();
      } else {
        chain.setParagraph().run();
      }
      break;
    case 'character':
      chain.setHeading({ level: 2 }).run();
      break;
    case 'dialogue':
      chain.setBlockquote().run();
      break;
    case 'direction':
      chain.setHeading({ level: 3 }).run();
      break;
  }
}

export default function DramaScriptToolbar({ editor }: DramaScriptToolbarProps) {
  const [copyDone, setCopyDone] = useState(false);

  const activeFormat = getActiveFormat(editor);

  const canUndo = (() => { try { return editor?.can().undo() ?? false; } catch { return false; } })();
  const canRedo = (() => { try { return editor?.can().redo() ?? false; } catch { return false; } })();

  return (
    <div className="drama-script-toolbar">
      {/* 撤销 / 重做 */}
      <button
        className="toolbar-btn"
        title="撤销"
        disabled={!canUndo}
        onClick={() => { try { editor?.chain().focus().undo().run(); } catch { /* no history */ } }}
      >
        <Undo2 size={14} />
      </button>
      <button
        className="toolbar-btn"
        title="重做"
        disabled={!canRedo}
        onClick={() => { try { editor?.chain().focus().redo().run(); } catch { /* no history */ } }}
      >
        <Redo2 size={14} />
      </button>

      <div className="drama-toolbar-divider" />

      {/* 剧本格式按钮 */}
      {FORMAT_BUTTONS.map(btn => (
        <button
          key={btn.id}
          className={`drama-fmt-btn ${btn.className} ${activeFormat === btn.id ? 'active' : ''}`}
          title={btn.title}
          onClick={() => editor && applyFormat(editor, btn.id)}
          disabled={!editor}
        >
          {btn.label}
        </button>
      ))}

      <div className="drama-toolbar-divider" />

      {/* 复制全文 */}
      <button
        className="toolbar-btn"
        title={copyDone ? '已复制' : '复制全文'}
        onClick={async () => {
          if (!editor) return;
          const ok = await copyToClipboard(editor.getText());
          if (ok) { setCopyDone(true); setTimeout(() => setCopyDone(false), 1500); }
        }}
      >
        {copyDone ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
