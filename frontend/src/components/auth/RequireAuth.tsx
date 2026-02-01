import { Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../../utils/authApi';

interface RequireAuthProps {
  children: React.ReactNode;
}

/**
 * 需要登录的路由包装：未登录时重定向到首页并带上来源地址，登录后可返回原页面。
 */
export default function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();

  if (!authApi.isAuthenticated()) {
    return (
      <Navigate
        to="/"
        state={{ from: location.pathname + location.search, needLogin: true }}
        replace
      />
    );
  }

  return <>{children}</>;
}
