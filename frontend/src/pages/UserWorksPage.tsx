import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Grid, List, BookOpen, User, Calendar, FileText } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import { authApi, type UserInfo } from '../utils/authApi';
import './UserWorksPage.css';

export default function UserWorksPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [works, setWorks] = useState<Work[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const itemsPerPage = 20;
  const isCurrentUser = authApi.isAuthenticated() && 
    authApi.getUserInfo()?.id === Number(userId);

  useEffect(() => {
    if (userId) {
      loadUserWorks();
      loadUserInfo();
    }
  }, [userId, currentPage]);

  const loadUserWorks = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    try {
      // 如果是当前用户，使用listWorks获取所有作品（包括私有）
      // 否则，只显示公开作品
      if (isCurrentUser) {
        const response = await worksApi.listWorks({
          page: currentPage,
          size: itemsPerPage,
        });
        setWorks(response.works);
        setTotal(response.total);
      } else {
        // 对于其他用户，只显示公开作品
        // 注意：这里需要后端支持按用户ID筛选公开作品
        // 暂时使用公开作品API，然后在前端过滤
        const response = await worksApi.getPublicWorks({
          page: currentPage,
          size: itemsPerPage,
        });
        // 过滤出该用户的作品
        const userWorks = response.works.filter(w => w.owner_id === Number(userId));
        setWorks(userWorks);
        setTotal(userWorks.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载作品失败');
      console.error('Error loading user works:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserInfo = async () => {
    if (!userId) return;
    
    try {
      // 如果是当前用户，使用已存储的用户信息
      if (isCurrentUser) {
        const currentUser = authApi.getUserInfo();
        if (currentUser) {
          setUserInfo(currentUser);
          return;
        }
      }
      
      // TODO: 添加获取其他用户信息的API调用
      // 目前使用占位符
      setUserInfo({
        id: Number(userId),
        username: `user_${userId}`,
        email: '',
        display_name: `用户 ${userId}`,
        status: 'active',
      });
    } catch (err) {
      console.error('Error loading user info:', err);
    }
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleWorkClick = (work: Work) => {
    navigate(`/novel/editor?workId=${work.id}`);
  };

  if (loading && works.length === 0) {
    return (
      <div className="user-works-page">
        <div className="loading-state">加载中...</div>
      </div>
    );
  }

  if (error && works.length === 0) {
    return (
      <div className="user-works-page">
        <div className="error-state">错误: {error}</div>
      </div>
    );
  }

  return (
    <div className="user-works-page">
      <div className="user-header">
        <div className="user-avatar">
          <User size={48} />
        </div>
        <div className="user-info">
          <h1 className="user-name">
            {userInfo?.display_name || userInfo?.username || `用户 ${userId}`}
          </h1>
          {userInfo?.email && (
            <p className="user-email">{userInfo.email}</p>
          )}
        </div>
      </div>

      <div className="works-section">
        <div className="works-header">
          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="网格视图"
            >
              <Grid size={18} />
            </button>
            <button
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="列表视图"
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {works.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={48} />
            <p>暂无作品</p>
            {isCurrentUser && (
              <p className="empty-hint">开始创建你的第一个作品吧！</p>
            )}
          </div>
        ) : (
          <>
            <div className={`works-content ${viewMode}`}>
              {works.map((work) => (
                <div
                  key={work.id}
                  className="work-item"
                  onClick={() => handleWorkClick(work)}
                >
                  {viewMode === 'grid' ? (
                    <>
                      <div className="work-item-header">
                        <h3 className="work-item-title">{work.title}</h3>
                      </div>
                      {work.description && (
                        <p className="work-item-description">{work.description}</p>
                      )}
                      <div className="work-item-footer">
                        <div className="work-item-stats">
                          <span className="stat-item">
                            <FileText size={14} />
                            {work.word_count || 0} 字
                          </span>
                        </div>
                        <span className="work-item-date">
                          <Calendar size={14} />
                          {formatDate(work.updated_at)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="work-item-main">
                        <div className="work-item-header">
                          <h3 className="work-item-title">{work.title}</h3>
                        </div>
                        {work.description && (
                          <p className="work-item-description">{work.description}</p>
                        )}
                      </div>
                      <div className="work-item-meta">
                        <div className="work-item-stats">
                          <span className="stat-item">
                            <FileText size={14} />
                            {work.word_count || 0} 字
                          </span>
                        </div>
                        <span className="work-item-date">
                          <Calendar size={14} />
                          {formatDate(work.updated_at)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {total > itemsPerPage && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  上一页
                </button>
                <span className="pagination-info">
                  第 {currentPage} 页，共 {Math.ceil(total / itemsPerPage)} 页
                </span>
                <button
                  className="pagination-btn"
                  disabled={currentPage * itemsPerPage >= total}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

