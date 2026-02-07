/**
 * 大纲/细纲格式化工具（用于续写推荐展示与章节设置预填）
 */

/** 将大纲/细纲（对象或字符串）格式化为简短摘要字符串 */
export function formatOutlineSummary(
  o: Record<string, unknown> | string,
  maxLen = 120
): string {
  if (typeof o === 'string') return o.trim().slice(0, maxLen) + (o.length > maxLen ? '…' : '');
  const core = (o as Record<string, unknown>)?.core_function as string | undefined;
  if (core) return core.slice(0, maxLen) + (core.length > maxLen ? '…' : '');
  const points = (o as Record<string, unknown>)?.key_points as string[] | undefined;
  if (Array.isArray(points) && points.length) return points.join('、').slice(0, maxLen) + '…';
  return JSON.stringify(o).slice(0, maxLen) + '…';
}

/** 将大纲（对象或字符串）格式化为可编辑的字符串（用于章节设置弹窗） */
export function formatOutlineForEditor(o: Record<string, unknown> | string): string {
  if (typeof o === 'string') return o.trim();
  if (!o || typeof o !== 'object') return '';
  const lines: string[] = [];
  if (o.core_function) lines.push(`核心功能：${o.core_function}`);
  if (Array.isArray(o.key_points)) lines.push(`关键情节点：${o.key_points.join('、')}`);
  if (o.visual_scenes && Array.isArray(o.visual_scenes)) lines.push(`画面感：${o.visual_scenes.join('、')}`);
  if (o.atmosphere && Array.isArray(o.atmosphere)) lines.push(`氛围：${o.atmosphere.join('、')}`);
  if (o.hook) lines.push(`结尾钩子：${o.hook}`);
  return lines.join('\n');
}

/** 将细纲对象 sections 格式化为可编辑的字符串 */
export function formatDetailedOutlineForEditor(o: Record<string, unknown> | string): string {
  if (typeof o === 'string') return o.trim();
  if (!o || typeof o !== 'object') return '';
  const sections = (o as Record<string, unknown>).sections as
    | Array<{ section_number?: number; title?: string; content?: string }>
    | undefined;
  if (!Array.isArray(sections)) return JSON.stringify(o);
  return sections.map((s) => `${s.section_number ?? ''}. ${s.title ?? ''}：${s.content ?? ''}`).join('\n');
}
