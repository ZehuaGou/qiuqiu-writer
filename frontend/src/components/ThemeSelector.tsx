import { useState, useEffect, useRef } from 'react';
import { Check, Palette } from 'lucide-react';
import { themes, getCurrentTheme, applyTheme } from '../utils/theme';
import './ThemeSelector.css';

interface ThemeSelectorProps {
  onClose?: () => void;
}

export default function ThemeSelector({ onClose }: ThemeSelectorProps) {
  const [currentThemeId, setCurrentThemeId] = useState<string>(getCurrentTheme());
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onClose?.();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // 切换主题
  const handleThemeChange = (themeId: string) => {
    setCurrentThemeId(themeId);
    applyTheme(themeId);
    setIsOpen(false);
    onClose?.();
  };

  return (
    <div className="theme-selector-wrapper" ref={dropdownRef}>
      <button
        className="theme-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="选择主题"
      >
        <Palette size={16} />
        <span>皮肤</span>
      </button>

      {isOpen && (
        <div className="theme-selector-dropdown">
          <div className="theme-selector-header">
            <span>选择主题</span>
          </div>
          <div className="theme-list">
            {themes.map((theme) => (
              <button
                key={theme.id}
                className={`theme-item ${currentThemeId === theme.id ? 'active' : ''}`}
                onClick={() => handleThemeChange(theme.id)}
              >
                <div className="theme-preview">
                  <div
                    className="theme-color-preview"
                    style={{
                      background: `linear-gradient(135deg, ${theme.colors.bgGradientStart} 0%, ${theme.colors.bgGradientEnd} 100%)`,
                    }}
                  />
                  <div className="theme-info">
                    <span className="theme-name">{theme.name}</span>
                    <div className="theme-colors">
                      <span
                        className="theme-color-dot"
                        style={{ backgroundColor: theme.colors.accentPrimary }}
                      />
                      <span
                        className="theme-color-dot"
                        style={{ backgroundColor: theme.colors.bgSecondary }}
                      />
                    </div>
                  </div>
                </div>
                {currentThemeId === theme.id && (
                  <Check size={16} className="theme-check" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

