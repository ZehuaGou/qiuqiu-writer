import { Bell, User, Coins } from 'lucide-react';
import './HomeHeader.css';

export default function HomeHeader() {
  return (
    <header className="home-header">
      <div className="header-left">
        <span className="greeting">Hi, 蛙蛙tL2L3z</span>
        <span className="welcome-text">欢迎来到蛙蛙写作!</span>
      </div>
      
      <div className="header-center">
        <button className="competition-btn">
          AI工具大赛第五期
        </button>
      </div>
      
    </header>
  );
}

