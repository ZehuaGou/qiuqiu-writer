import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Film, Clock, FileText, Trash2, MoreHorizontal, Search } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import './DramaListPage.css';

export default function DramaListPage() {
  const navigate = useNavigate();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadWorks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await worksApi.listWorks({ work_type: 'video', size: 50 });
      setWorks(res.works);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorks();
  }, [loadWorks]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const handleCreate = async () => {
    try {
      const work = await worksApi.createWork({
        title: '未命名剧本',
        work_type: 'video',
        is_public: false,
      });
      navigate(`/drama/editor?workId=${work.id}`);
    } catch {
      alert('创建失败，请重试');
    }
  };

  const handleDelete = async (workId: string) => {
    if (!confirm('确定删除这个剧本吗？此操作不可撤销。')) return;
    setDeletingId(workId);
    try {
      await worksApi.deleteWork(workId);
      setWorks(prev => prev.filter(w => w.id !== workId));
    } catch {
      alert('删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const filtered = works.filter(w =>
    !searchQuery || (w.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="drama-list-page">
      <div className="drama-list-container">
        {/* 页头 */}
        <div className="drama-list-header">
          <div className="drama-list-title-row">
            <div className="drama-list-title-group">
              <Film size={24} className="drama-list-icon" />
              <h1 className="drama-list-title">剧本创作</h1>
              <span className="drama-list-count">{works.length}</span>
            </div>
            <button className="drama-create-btn" onClick={handleCreate}>
              <Plus size={16} />
              新建剧本
            </button>
          </div>

          <div className="drama-search-bar">
            <Search size={15} className="drama-search-icon" />
            <input
              className="drama-search-input"
              type="text"
              placeholder="搜索剧本..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 内容区 */}
        {loading ? (
          <div className="drama-loading">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="drama-empty">
            <div className="drama-empty-icon">
              <Film size={48} />
            </div>
            <p className="drama-empty-title">
              {searchQuery ? '没有找到匹配的剧本' : '还没有剧本'}
            </p>
            {!searchQuery && (
              <p className="drama-empty-hint">点击「新建剧本」开始你的第一个剧本创作</p>
            )}
            {!searchQuery && (
              <button className="drama-create-btn" onClick={handleCreate}>
                <Plus size={16} />
                新建剧本
              </button>
            )}
          </div>
        ) : (
          <div className="drama-grid">
            {/* 新建卡片 */}
            <div className="drama-card drama-card-new" onClick={handleCreate}>
              <div className="drama-card-new-inner">
                <div className="drama-card-new-icon">
                  <Plus size={28} />
                </div>
                <span>新建剧本</span>
              </div>
            </div>

            {filtered.map(work => (
              <div
                key={work.id}
                className="drama-card"
                onClick={() => navigate(`/drama/editor?workId=${work.id}`)}
              >
                {/* 封面区 */}
                <div className="drama-card-cover">
                  {work.cover_image ? (
                    <img src={work.cover_image} alt={work.title} className="drama-card-cover-img" />
                  ) : (
                    <div className="drama-card-cover-placeholder">
                      <Film size={32} />
                    </div>
                  )}
                  <div className="drama-card-overlay">
                    <span className="drama-card-badge">剧本</span>
                  </div>
                </div>

                {/* 信息区 */}
                <div className="drama-card-body">
                  <div className="drama-card-title-row">
                    <h3 className="drama-card-title">{work.title || '未命名剧本'}</h3>
                    <button
                      className="drama-card-menu-btn"
                      onClick={e => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === work.id ? null : work.id);
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenuId === work.id && (
                      <div
                        className="drama-card-menu"
                        onMouseDown={e => e.stopPropagation()}
                      >
                        <button
                          className="drama-card-menu-item danger"
                          onClick={e => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            handleDelete(work.id);
                          }}
                          disabled={deletingId === work.id}
                        >
                          <Trash2 size={14} />
                          {deletingId === work.id ? '删除中...' : '删除'}
                        </button>
                      </div>
                    )}
                  </div>

                  {work.description && (
                    <p className="drama-card-desc">{work.description}</p>
                  )}

                  <div className="drama-card-meta">
                    <span className="drama-card-meta-item">
                      <FileText size={12} />
                      {work.word_count || 0} 字
                    </span>
                    <span className="drama-card-meta-item">
                      <Clock size={12} />
                      {formatDate(work.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
