import { useState, useEffect } from 'react';
import { Menu, X, MessageSquare } from 'lucide-react';
import './EditorPage.css';
import SideNav, { type NavItem } from '../components/editor/SideNav';
import TagsManager from '../components/editor/TagsManager';
import AIAssistant from '../components/editor/AIAssistant';

export default function EditorPage() {
  const [activeNav, setActiveNav] = useState<NavItem>('tags');
  const [isMobile, setIsMobile] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setShowNav(false);
        setMobileChatOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="editor-page">
      {isMobile && (
        <div className="editor-mobile-header">
          <button 
            className="editor-mobile-toggle"
            onClick={() => setShowNav(!showNav)}
          >
            {showNav ? <X size={24} /> : <Menu size={24} />}
          </button>
          <span className="editor-mobile-title">作品管理</span>
          <button 
            className="editor-mobile-toggle"
            onClick={() => setMobileChatOpen(!mobileChatOpen)}
          >
            {mobileChatOpen ? <X size={24} /> : <MessageSquare size={24} />}
          </button>
        </div>
      )}

      <div className="editor-body">
        {/* Mobile Sidebar Overlay */}
        {isMobile && showNav && (
          <div 
            className="editor-sidebar-overlay" 
            onClick={() => setShowNav(false)}
          />
        )}

        <div className={`editor-sidebar-container ${showNav ? 'mobile-open' : ''}`}>
          <SideNav activeNav={activeNav} onNavChange={(nav) => {
            setActiveNav(nav);
            if (isMobile) setShowNav(false);
          }} />
        </div>

        <div className="editor-main">
          {activeNav === 'tags' && <TagsManager />}
          {activeNav === 'work-info' && (
            <div className="placeholder-content">
              <h2>作品信息</h2>
              <p>作品信息管理功能开发中...</p>
            </div>
          )}
          {activeNav === 'outline' && (
            <div className="placeholder-content">
              <h2>总纲</h2>
              <p>总纲管理功能开发中...</p>
            </div>
          )}
          {activeNav === 'characters' && (
            <div className="placeholder-content">
              <h2>角色</h2>
              <p>角色管理功能开发中...</p>
            </div>
          )}
        </div>
        
        {/* Desktop AI Assistant or Mobile Chat Drawer */}
        {(!isMobile || mobileChatOpen) && (
          <div className={`editor-right-sidebar ${isMobile ? 'mobile-drawer' : ''}`}>
            {isMobile && (
              <div className="mobile-drawer-header">
                <h3>AI 助手</h3>
                <button onClick={() => setMobileChatOpen(false)}>
                  <X size={20} />
                </button>
              </div>
            )}
            <AIAssistant />
          </div>
        )}
        
        {/* Mobile Chat Overlay */}
        {isMobile && mobileChatOpen && (
          <div 
            className="editor-sidebar-overlay" 
            style={{ zIndex: 1001 }}
            onClick={() => setMobileChatOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

