import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, ChevronDown, Menu, X } from 'lucide-react';
import ScriptSideNav, { type ScriptNavItem } from '../components/editor/ScriptSideNav';
import AIAssistant from '../components/editor/AIAssistant';
import TagsManager from '../components/editor/TagsManager';
import ChapterOutline from '../components/editor/ChapterOutline';
import ScriptCharacters from '../components/editor/ScriptCharacters';
import ScriptEditor from '../components/editor/ScriptEditor';
import { useIsMobile } from '../hooks/useMediaQuery';
import './ScriptEditorPage.css';

export default function ScriptEditorPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeNav, setActiveNav] = useState<ScriptNavItem>('work-info');
  const [scriptName, setScriptName] = useState('请输入剧本名称');
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="script-editor-page">
      {/* 移动端菜单抽屉 */}
      {isMobile && mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <h2>菜单</h2>
              <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="mobile-menu-content">
              <ScriptSideNav
                activeNav={activeNav}
                onNavChange={(nav) => {
                  setActiveNav(nav);
                  setMobileMenuOpen(false);
                }}
                selectedEpisode={selectedEpisode}
                onEpisodeSelect={(ep) => {
                  setSelectedEpisode(ep);
                  setMobileMenuOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <header className="script-editor-header">
        <div className="header-left">
          {/* 移动端菜单按钮 */}
          {isMobile && (
            <button
              className="btn btn-text mobile-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          )}
          <button className="btn btn-text" onClick={() => navigate('/script')}>
            <ArrowLeft size={16} />
            {!isMobile && <span>退出</span>}
          </button>
          <div className="work-info">
            <input
              type="text"
              className="script-name-input"
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              placeholder="请输入剧本名称"
            />
            {!isMobile && (
              <div className="work-tags">
                <span className="status-tag">剧本已保存到云端</span>
                <span className="word-count-tag">
                  总字数: 0
                  <Info size={12} />
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <div className="header-actions">
            {!isMobile && (
              <button className="btn btn-text">
                <span>皮肤:</span>
                <ChevronDown size={14} />
              </button>
            )}
            {!isMobile && <button className="btn btn-secondary btn-sm">替换</button>}
            {!isMobile && <button className="btn btn-secondary btn-sm">回收站</button>}
            <button className="btn btn-secondary btn-sm">分享</button>
          </div>
        </div>
      </header>

      <div className="script-editor-body">
        {/* 左侧边栏 */}
        {!isMobile && (
          <ScriptSideNav
            activeNav={activeNav}
            onNavChange={setActiveNav}
            selectedEpisode={selectedEpisode}
            onEpisodeSelect={setSelectedEpisode}
          />
        )}

        {/* 主编辑区 */}
        <div className="script-editor-main">
          {/* 根据导航项显示不同内容 */}
          {activeNav === 'tags' && <TagsManager />}
          {activeNav === 'outline' && <ChapterOutline volumes={[]} />}
          {activeNav === 'characters' && <ScriptCharacters />}
          {activeNav === 'work-info' && selectedEpisode !== null && <ScriptEditor />}
          {activeNav === 'work-info' && selectedEpisode === null && (
            <div className="placeholder-content">
              <h2>作品信息</h2>
              <p>请选择一个剧集开始编辑</p>
            </div>
          )}
        </div>

        {/* 右侧边栏 */}
        {!isMobile && <AIAssistant />}
      </div>
    </div>
  );
}
