/**
 * StoryboardView — 分镜视图
 * 将集数的分镜脚本按场次（actTitle）分组，以网格卡片展示
 */
import { useState } from 'react';
import { Sparkles, RefreshCw, Image as ImageIcon, Edit2, X, Check } from 'lucide-react';
import { dramaGenerateImage } from '../../utils/dramaApi';
import type { DramaCharacter, DramaEpisode, DramaMeta, DramaPanel, DramaScene, DramaStoryboard } from './dramaTypes';
import './StoryboardView.css';

const SHOT_TYPE_LABELS: Record<string, string> = {
  wide: '全景',
  medium: '中景',
  close: '近景',
  'extreme-close': '特写',
  'bird-eye': '俯瞰',
  'low-angle': '仰拍',
};

interface StoryboardViewProps {
  episode: DramaEpisode;
  meta: DramaMeta;
  workId: string | null;
  selectedImageSize?: string;
  onUpdateStoryboard: (storyboard: DramaStoryboard) => void;
  onRegenerateStoryboard: () => void;
}

interface ActGroup {
  actIndex: number;
  actTitle: string;
  panels: DramaPanel[];
}

function groupPanelsByAct(panels: DramaPanel[]): ActGroup[] {
  const map = new Map<string, ActGroup>();
  for (const panel of panels) {
    const key = panel.actTitle || '场次1';
    if (!map.has(key)) {
      map.set(key, { actIndex: panel.actIndex ?? 1, actTitle: key, panels: [] });
    }
    map.get(key)!.panels.push(panel);
  }
  return Array.from(map.values()).sort((a, b) => a.actIndex - b.actIndex);
}

// ─── 角色头像气泡 ────────────────────────────────────────────
function CharAvatar({ char, size = 20 }: { char: DramaCharacter; size?: number }) {
  return (
    <div className="storyboard-ref-avatar" title={char.name} style={{ width: size, height: size }}>
      {char.imageUrl ? (
        <img src={char.imageUrl} alt={char.name} />
      ) : (
        <span>{char.name.charAt(0)}</span>
      )}
    </div>
  );
}

// ─── 场景缩略图气泡 ──────────────────────────────────────────
function SceneThumb({ scene, size = 20 }: { scene: DramaScene; size?: number }) {
  return (
    <div className="storyboard-ref-scene" title={`${scene.location} · ${scene.time}`} style={{ width: size, height: size }}>
      {scene.imageUrl ? (
        <img src={scene.imageUrl} alt={scene.location} />
      ) : (
        <span>{scene.location.charAt(0)}</span>
      )}
    </div>
  );
}

export default function StoryboardView({
  episode,
  meta,
  workId,
  selectedImageSize = '1024x1024',
  onUpdateStoryboard,
  onRegenerateStoryboard,
}: StoryboardViewProps) {
  const storyboard = episode.storyboard;
  const [generatingPanelId, setGeneratingPanelId] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [editingPanel, setEditingPanel] = useState<DramaPanel | null>(null);

  if (!storyboard || storyboard.panels.length === 0) {
    return (
      <div className="storyboard-empty">
        <ImageIcon size={48} />
        <p>暂无分镜数据</p>
        <button className="storyboard-regen-btn" onClick={onRegenerateStoryboard}>
          <RefreshCw size={14} />
          生成分镜
        </button>
      </div>
    );
  }

  const acts = groupPanelsByAct(storyboard.panels);
  const totalPanels = storyboard.panels.length;
  const panelsWithImage = storyboard.panels.filter(p => p.imageUrl).length;

  const updatePanel = (panelId: string, patch: Partial<DramaPanel>) => {
    const newPanels = storyboard.panels.map(p => p.id === panelId ? { ...p, ...patch } : p);
    onUpdateStoryboard({ ...storyboard, panels: newPanels });
  };

  const handleGeneratePanelImage = async (panel: DramaPanel) => {
    if (!workId) return;
    setGeneratingPanelId(panel.id);
    try {
      const sceneInfo = `场次：${panel.actTitle || ''}，镜头：${SHOT_TYPE_LABELS[panel.shotType] || panel.shotType}`;
      const charInfo = panel.characters.length > 0 ? `出场角色：${panel.characters.join('、')}` : '';
      const dialogueInfo = panel.dialogue ? `台词："${panel.dialogue}"` : '';

      // 从 meta 查找角色外貌描述，丰富生成效果
      const linkedCharsForGen = panel.characters
        .map(name => meta.characters.find(c => c.name === name))
        .filter((c): c is DramaCharacter => !!c);
      const charAppearances = linkedCharsForGen.map(c => c.appearance).filter(Boolean);
      const appearanceInfo = charAppearances.length > 0
        ? `角色外貌：${charAppearances.join('；')}`
        : '';

      // 从 meta 查找关联场景描述
      const linkedScene = panel.sceneId ? meta.scenes?.find(s => s.id === panel.sceneId) : undefined;
      const sceneDesc = linkedScene
        ? `场景：${linkedScene.location} · ${linkedScene.time}，${linkedScene.description}`
        : '';

      const prompt = panel.imagePrompt || [
        '横版漫剧情节，完整独立画面，电影感宽幅构图，高质量细节。',
        sceneInfo,
        sceneDesc,
        panel.action,
        charInfo,
        appearanceInfo,
        dialogueInfo,
        `情绪基调：${panel.emotion || ''}`,
      ].filter(Boolean).join('，');

      // 收集所有有图片的角色参考图 + 场景参考图
      const referenceImageUrls: string[] = [
        ...linkedCharsForGen.map(c => c.imageUrl).filter((u): u is string => !!u),
        ...(linkedScene?.imageUrl ? [linkedScene.imageUrl] : []),
      ];

      const imageUrl = await dramaGenerateImage(prompt, workId, {
        size: selectedImageSize,
        referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
      });
      if (imageUrl) updatePanel(panel.id, { imageUrl });
    } catch {
      // 图片生成失败不弹错误，允许重试
    } finally {
      setGeneratingPanelId(null);
    }
  };

  const handleBatchGenerateImages = async () => {
    if (!workId || batchGenerating) return;
    const panelsWithoutImage = storyboard.panels.filter(p => !p.imageUrl);
    if (panelsWithoutImage.length === 0) return;
    setBatchGenerating(true);
    for (const panel of panelsWithoutImage) {
      await handleGeneratePanelImage(panel);
    }
    setBatchGenerating(false);
  };

  return (
    <div className="storyboard-view">
      {/* 工具栏 */}
      <div className="storyboard-toolbar">
        <div className="storyboard-toolbar-left">
          <span className="storyboard-stats">
            {totalPanels} 格分镜 · {panelsWithImage}/{totalPanels} 已生图
          </span>
          {storyboard.generatedAt && (
            <span className="storyboard-gen-time">
              生成于 {new Date(storyboard.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="storyboard-toolbar-right">
          <button
            className="storyboard-batch-btn"
            onClick={handleBatchGenerateImages}
            disabled={batchGenerating || panelsWithImage === totalPanels}
            title="为所有未生图的分镜格批量生成图片"
          >
            {batchGenerating
              ? <><span className="drama-spinner" style={{ width: 12, height: 12 }} /> 生成中...</>
              : <><Sparkles size={13} /> 批量生成图片</>
            }
          </button>
          <button
            className="storyboard-regen-btn outline"
            onClick={onRegenerateStoryboard}
            title="重新生成分镜脚本（会覆盖当前分镜）"
          >
            <RefreshCw size={13} />
            重新生成分镜
          </button>
        </div>
      </div>

      {/* 分镜内容区（按场次分组） */}
      <div className="storyboard-content">
        {acts.map(act => (
          <div key={act.actTitle} className="storyboard-act-section">
            {/* 场次标题 */}
            <div className="storyboard-act-header">
              <span className="storyboard-act-index">场次 {act.actIndex}</span>
              <span className="storyboard-act-title">{act.actTitle}</span>
              <span className="storyboard-act-count">{act.panels.length} 格</span>
            </div>

            {/* 分镜网格 */}
            <div className="storyboard-panels-grid">
              {act.panels.map(panel => {
                const linkedChars = panel.characters
                  .map(name => meta.characters.find(c => c.name === name))
                  .filter((c): c is DramaCharacter => !!c);
                const linkedScene = panel.sceneId
                  ? meta.scenes?.find(s => s.id === panel.sceneId)
                  : undefined;
                const hasRefs = linkedChars.length > 0 || !!linkedScene;

                return (
                  <div key={panel.id} className="storyboard-panel-card">
                    {/* 图片区 */}
                    <div className="storyboard-panel-image">
                      {panel.imageUrl ? (
                        <img src={panel.imageUrl} alt={`分镜 ${panel.index}`} className="storyboard-panel-img" />
                      ) : (
                        <div className="storyboard-panel-img-placeholder">
                          <ImageIcon size={24} />
                          <span>未生成</span>
                        </div>
                      )}
                      {/* 格序号 */}
                      <span className="storyboard-panel-index-badge">#{panel.index}</span>
                    </div>

                    {/* 信息区 */}
                    <div className="storyboard-panel-info">
                      <div className="storyboard-panel-meta">
                        <span className="storyboard-shot-badge">{SHOT_TYPE_LABELS[panel.shotType] || panel.shotType}</span>
                        {panel.emotion && (
                          <span className="storyboard-emotion-tag">{panel.emotion}</span>
                        )}
                      </div>

                      <p className="storyboard-panel-action">{panel.action}</p>

                      {panel.dialogue && (
                        <p className="storyboard-panel-dialogue">"{panel.dialogue}"</p>
                      )}

                      {/* 角色 & 场景参考图行 */}
                      {hasRefs && (
                        <div className="storyboard-panel-refs">
                          {linkedChars.slice(0, 3).map(char => (
                            <CharAvatar key={char.id} char={char} size={22} />
                          ))}
                          {linkedChars.length > 3 && (
                            <div className="storyboard-ref-more" title={`还有 ${linkedChars.length - 3} 位角色`}>
                              +{linkedChars.length - 3}
                            </div>
                          )}
                          {linkedScene && (
                            <SceneThumb scene={linkedScene} size={22} />
                          )}
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="storyboard-panel-actions">
                      <button
                        className="storyboard-panel-btn generate"
                        onClick={() => handleGeneratePanelImage(panel)}
                        disabled={generatingPanelId === panel.id || batchGenerating}
                        title="生成分镜图"
                      >
                        {generatingPanelId === panel.id
                          ? <span className="drama-spinner" style={{ width: 11, height: 11 }} />
                          : <Sparkles size={11} />}
                        生图
                      </button>
                      <button
                        className="storyboard-panel-btn edit"
                        onClick={() => setEditingPanel({ ...panel })}
                        title="编辑分镜格"
                      >
                        <Edit2 size={11} />
                        编辑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 编辑分镜格模态框 */}
      {editingPanel && (
        <PanelEditModal
          panel={editingPanel}
          meta={meta}
          onChange={setEditingPanel}
          onSave={() => {
            updatePanel(editingPanel.id, editingPanel);
            setEditingPanel(null);
          }}
          onClose={() => setEditingPanel(null)}
        />
      )}
    </div>
  );
}

// ─── 分镜格编辑模态框 ────────────────────────────────────────
function PanelEditModal({
  panel,
  meta,
  onChange,
  onSave,
  onClose,
}: {
  panel: DramaPanel;
  meta: DramaMeta;
  onChange: (p: DramaPanel) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const scenes = meta.scenes ?? [];

  const toggleCharacter = (name: string) => {
    const next = panel.characters.includes(name)
      ? panel.characters.filter(n => n !== name)
      : [...panel.characters, name];
    onChange({ ...panel, characters: next });
  };

  const selectScene = (sceneId: string | undefined) => {
    onChange({ ...panel, sceneId });
  };

  return (
    <div className="drama-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drama-modal-content" style={{ maxWidth: 560 }}>
        <div className="drama-modal-header">
          <h3>编辑分镜格 #{panel.index}</h3>
          <button className="drama-modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="drama-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>

          {/* 镜头类型 */}
          <div className="storyboard-edit-field">
            <label>镜头类型</label>
            <select
              value={panel.shotType}
              onChange={e => onChange({ ...panel, shotType: e.target.value as DramaPanel['shotType'] })}
              className="storyboard-edit-select"
            >
              {Object.entries(SHOT_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* 出场角色多选 */}
          {meta.characters.length > 0 && (
            <div className="storyboard-edit-field">
              <label>出场角色</label>
              <div className="storyboard-char-selector">
                {meta.characters.map(char => {
                  const selected = panel.characters.includes(char.name);
                  return (
                    <button
                      key={char.id}
                      type="button"
                      className={`storyboard-char-option${selected ? ' selected' : ''}`}
                      onClick={() => toggleCharacter(char.name)}
                      title={char.name}
                    >
                      <div className="storyboard-char-avatar">
                        {char.imageUrl ? (
                          <img src={char.imageUrl} alt={char.name} />
                        ) : (
                          <span>{char.name.charAt(0)}</span>
                        )}
                      </div>
                      <span className="storyboard-char-name">{char.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 关联场景选择 */}
          {scenes.length > 0 && (
            <div className="storyboard-edit-field">
              <label>关联场景</label>
              <div className="storyboard-scene-selector">
                {/* 不关联选项 */}
                <button
                  type="button"
                  className={`storyboard-scene-option${!panel.sceneId ? ' selected' : ''}`}
                  onClick={() => selectScene(undefined)}
                  title="不关联场景"
                >
                  <div className="storyboard-scene-thumb no-scene">
                    <span>—</span>
                  </div>
                  <span className="storyboard-scene-label">不关联</span>
                </button>
                {scenes.map(scene => {
                  const selected = panel.sceneId === scene.id;
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      className={`storyboard-scene-option${selected ? ' selected' : ''}`}
                      onClick={() => selectScene(scene.id)}
                      title={`${scene.location} · ${scene.time}`}
                    >
                      <div className="storyboard-scene-thumb">
                        {scene.imageUrl ? (
                          <img src={scene.imageUrl} alt={scene.location} />
                        ) : (
                          <span>{scene.location.charAt(0)}</span>
                        )}
                      </div>
                      <span className="storyboard-scene-label">{scene.location}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 情绪基调 */}
          <div className="storyboard-edit-field">
            <label>情绪基调</label>
            <input
              className="storyboard-edit-input"
              value={panel.emotion || ''}
              onChange={e => onChange({ ...panel, emotion: e.target.value })}
              placeholder="如：紧张、温馨、震撼"
            />
          </div>

          {/* 动作描述 */}
          <div className="storyboard-edit-field">
            <label>动作描述</label>
            <textarea
              className="storyboard-edit-textarea"
              value={panel.action}
              onChange={e => onChange({ ...panel, action: e.target.value })}
              rows={3}
              placeholder="画面中的动作和环境描述"
            />
          </div>

          {/* 台词 */}
          <div className="storyboard-edit-field">
            <label>台词</label>
            <input
              className="storyboard-edit-input"
              value={panel.dialogue || ''}
              onChange={e => onChange({ ...panel, dialogue: e.target.value || undefined })}
              placeholder="本格对白（可为空）"
            />
          </div>

          {/* 图片生成提示词 */}
          <div className="storyboard-edit-field">
            <label>图片生成提示词（可选，覆盖自动生成）</label>
            <textarea
              className="storyboard-edit-textarea"
              value={panel.imagePrompt || ''}
              onChange={e => onChange({ ...panel, imagePrompt: e.target.value || undefined })}
              rows={2}
              placeholder="留空则自动构建提示词（含角色外貌 & 场景描述）"
            />
          </div>
        </div>
        <div className="drama-modal-footer">
          <button className="drama-btn-secondary" onClick={onClose}>取消</button>
          <button className="drama-btn-primary" onClick={onSave}>
            <Check size={13} /> 保存
          </button>
        </div>
      </div>
    </div>
  );
}
