/**
 * ═══════════════════════════════════════════════════════════════
 * BOTTOM NAVIGATION - Main App Navigation
 * ═══════════════════════════════════════════════════════════════
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useChatStore, useOrderStore } from '../store';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const { unreadTotal } = useChatStore();
  const { pendingCount } = useOrderStore();

  const navItems = [
    { path: '/dashboard', icon: 'fa-th-large', label: 'Dashboard' },
    { path: '/studio', icon: 'fa-clapperboard', label: 'Studio' },
    { path: '/chats', icon: 'fa-comments', label: 'Chats', badge: unreadTotal },
    { path: '/orders', icon: 'fa-shopping-bag', label: 'Orders', badge: pendingCount },
    { path: '/products', icon: 'fa-box', label: 'Products' },
    { path: '/settings', icon: 'fa-cog', label: 'Settings' },
  ];

  const isActive = (path) => {
    if (path === '/chats') {
      return location.pathname === '/chats' || location.pathname.startsWith('/chat/');
    }
    if (path === '/orders') {
      return location.pathname.startsWith('/orders');
    }
    if (path === '/products') {
      return location.pathname.startsWith('/products');
    }
    return location.pathname === path;
  };

  // Hide on certain routes
  const hiddenRoutes = ['/login'];
  if (hiddenRoutes.includes(location.pathname)) {
    return null;
  }

  // Hide on chat window
  if (location.pathname.startsWith('/chat/')) {
    return null;
  }

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <div
          key={item.path}
          className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          <i className={`fas ${item.icon}`}></i>
          <span>{item.label}</span>
          {item.badge > 0 && (
            <span className="nav-badge">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}

export default BottomNav;
