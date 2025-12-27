import { ArrowLeft, Cloud, Coins, Info, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import './TopBar.css';

interface TopBarProps {
  workTitle: string;
  workType: string;
  perspective: string;
  frequency: string;
}

export default function TopBar({ workTitle, workType, perspective, frequency }: TopBarProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button className="exit-button">
          <ArrowLeft size={18} />
          <span>退出</span>
        </button>
        <div className="work-info">
          <h1 className="work-title">{workTitle}</h1>
          <div className="work-meta">
            <span className="meta-tag">{workType}</span>
            <span className="meta-tag">{perspective}</span>
            <span className="meta-tag">{frequency}</span>
          </div>
        </div>
      </div>

      <div className="top-bar-center">
        <div className="save-status">
          <Cloud size={16} />
          <span>已保存到云端</span>
        </div>
        <div className="word-count">
          <Info size={12} />
          <span className="separator">总字数:0</span>
        </div>
      </div>

      <div className="top-bar-right">
        <div className="skin-selector">
          <span>皮肤:</span>
          <select className="skin-select">
            <option>默认</option>
            <option>护眼</option>
            <option>夜间</option>
          </select>
        </div>
        <button className="action-button">替换</button>
        <button className="action-button">回收站</button>
        <button className="action-button">分享</button>
        <div className="user-menu">
          <button className="user-avatar" onClick={() => setShowMenu(!showMenu)}>
            <MoreVertical size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

