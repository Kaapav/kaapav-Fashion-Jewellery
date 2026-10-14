/**
 * ═══════════════════════════════════════════════════════════════
 * DASHBOARD SCREEN - Stats, Activities, Pending Actions
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useDashboardStore, useUIStore } from '../store';
import { dashboardAPI } from '../api';
import { formatCurrency, formatRelativeTime, getGreeting, getInitials } from '../utils/helpers';
import PullToRefresh from '../components/PullToRefresh';

function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { stats, activities, pendingActions, isLoading, setStats, setActivities, setPendingActions, setLoading } = useDashboardStore();
  const { showToast } = useUIStore();

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, activitiesRes, pendingRes] = await Promise.all([
        dashboardAPI.getStats(),
        dashboardAPI.getActivities(10),
        dashboardAPI.getPendingActions(),
      ]);

      if (statsRes) setStats(statsRes);
      if (activitiesRes?.activities) setActivities(activitiesRes.activities);
      if (pendingRes?.actions) setPendingActions(pendingRes.actions);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      showToast('Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    await fetchDashboardData();
  };

  const getActivityIcon = (type) => {
    const icons = {
      message: 'fa-comment',
      order: 'fa-shopping-bag',
      payment: 'fa-credit-card',
      customer: 'fa-user',
      product: 'fa-box',
    };
    return icons[type] || 'fa-bell';
  };

  const getActivityIconClass = (type) => {
    const classes = {
      message: 'message',
      order: 'order',
      payment: 'payment',
    };
    return classes[type] || '';
  };

  return (
    <div className="screen">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-top">
          <div>
            <div className="greeting-text">{getGreeting()} 👋</div>
            <div className="user-name">{user?.name || ''}</div>
          </div>
          <div
            className="user-avatar"
            onClick={() => navigate('/settings')}
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
            ) : (
              getInitials(user?.name)
            )}
          </div>
        </div>
      </div>

      <div className="screen-content with-nav">
        <PullToRefresh onRefresh={handleRefresh} isRefreshing={isLoading}>
          {/* Stats Grid */}
          <div className="dashboard-stats">
            <div className="dash-stat-card" onClick={() => navigate('/chats')}>
              <div className="dash-stat-icon green">
                <i className="fas fa-comments"></i>
              </div>
              <div className="dash-stat-value">{stats?.active_chats ?? '-'}</div>
              <div className="dash-stat-label">Active Chats</div>
              {stats?.chats_change !== undefined && (
                <div className={`dash-stat-change ${stats.chats_change >= 0 ? 'up' : 'down'}`}>
                  <i className={`fas fa-arrow-${stats.chats_change >= 0 ? 'up' : 'down'}`}></i>
                  {Math.abs(stats.chats_change)}% from yesterday
                </div>
              )}
            </div>

            <div className="dash-stat-card" onClick={() => navigate('/orders')}>
              <div className="dash-stat-icon gold">
                <i className="fas fa-rupee-sign"></i>
              </div>
              <div className="dash-stat-value">
                {stats?.today_revenue ? formatCurrency(stats.today_revenue) : '-'}
              </div>
              <div className="dash-stat-label">Today's Revenue</div>
              {stats?.revenue_change !== undefined && (
                <div className={`dash-stat-change ${stats.revenue_change >= 0 ? 'up' : 'down'}`}>
                  <i className={`fas fa-arrow-${stats.revenue_change >= 0 ? 'up' : 'down'}`}></i>
                  {Math.abs(stats.revenue_change)}% from yesterday
                </div>
              )}
            </div>

            <div className="dash-stat-card" onClick={() => navigate('/orders')}>
              <div className="dash-stat-icon blue">
                <i className="fas fa-shopping-bag"></i>
              </div>
              <div className="dash-stat-value">{stats?.new_orders ?? '-'}</div>
              <div className="dash-stat-label">New Orders</div>
              {stats?.orders_change !== undefined && (
                <div className={`dash-stat-change ${stats.orders_change >= 0 ? 'up' : 'down'}`}>
                  <i className={`fas fa-arrow-${stats.orders_change >= 0 ? 'up' : 'down'}`}></i>
                  {Math.abs(stats.orders_change)}% from yesterday
                </div>
              )}
            </div>

            <div className="dash-stat-card">
              <div className="dash-stat-icon purple">
                <i className="fas fa-clock"></i>
              </div>
              <div className="dash-stat-value">{stats?.avg_response_time || '-'}</div>
              <div className="dash-stat-label">Avg Response</div>
              {stats?.response_change !== undefined && (
                <div className={`dash-stat-change ${stats.response_change >= 0 ? 'up' : 'down'}`}>
                  <i className={`fas fa-arrow-${stats.response_change >= 0 ? 'up' : 'down'}`}></i>
                  {Math.abs(stats.response_change)}% faster
                </div>
              )}
            </div>
          </div>

          {/* Pending Actions */}
          {pendingActions?.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">⚡ Pending Actions</h2>
                <span className="section-link" onClick={() => navigate('/orders')}>View All</span>
              </div>
              <div className="activity-list">
                {pendingActions.map((action, index) => (
                  <div
                    key={action.id || index}
                    className="activity-item"
                    style={{ borderLeft: `3px solid var(--${action.severity || 'warning'})` }}
                  >
                    <div
                      className="activity-icon"
                      style={{
                        background: `var(--${action.severity || 'warning'}-light)`,
                        color: `var(--${action.severity || 'warning'})`,
                      }}
                    >
                      <i className={`fas ${action.icon || 'fa-exclamation'}`}></i>
                    </div>
                    <div className="activity-content">
                      <div className="activity-text">
                        <strong>{action.count || ''}</strong> {action.text || ''}
                      </div>
                      <div className="activity-time">{action.subtext || ''}</div>
                    </div>
                    {action.action_path && (
                      <button
                        className="activity-action"
                        onClick={() => navigate(action.action_path)}
                      >
                        {action.action_label || 'View'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Activity */}
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">📡 Live Activity</h2>
              <span className="section-link">View All</span>
            </div>
            <div className="activity-list">
              {activities?.length > 0 ? (
                activities.map((activity, index) => (
                  <div key={activity.id || index} className="activity-item">
                    <div className={`activity-icon ${getActivityIconClass(activity.type)}`}>
                      <i className={`fas ${getActivityIcon(activity.type)}`}></i>
                    </div>
                    <div className="activity-content">
                      <div className="activity-text">
                        {activity.customer_name && <strong>{activity.customer_name}</strong>}
                        {' '}{activity.text || ''}
                      </div>
                      <div className="activity-time">
                        {activity.created_at ? formatRelativeTime(activity.created_at) : ''}
                      </div>
                    </div>
                    {activity.action_path && (
                      <button
                        className="activity-action"
                        onClick={() => navigate(activity.action_path)}
                      >
                        {activity.action_label || 'View'}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state" style={{ padding: '40px 24px' }}>
                  <i className="fas fa-inbox"></i>
                  <p>No recent activity</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">🚀 Quick Actions</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <QuickAction
                icon="fa-broadcast-tower"
                label="Broadcast"
                onClick={() => navigate('/broadcasts')}
              />
              <QuickAction
                icon="fa-plus"
                label="New Order"
                onClick={() => navigate('/orders?action=new')}
              />
              <QuickAction
                icon="fa-box"
                label="Products"
                onClick={() => navigate('/products')}
              />
              <QuickAction
                icon="fa-chart-bar"
                label="Analytics"
                onClick={() => navigate('/settings?tab=analytics')}
              />
              <QuickAction
                icon="fa-clapperboard"
                label="Video Studio"
                onClick={() => navigate('/studio')}
              />
            </div>
          </div>

          <div style={{ height: '20px' }}></div>
        </PullToRefresh>
      </div>
    </div>
  );
}

// Quick Action Button Component
function QuickAction({ icon, label, onClick }) {
  return (
    <button
      className="dash-stat-card"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 8px',
        cursor: 'pointer',
      }}
    >
      <div className="dash-stat-icon gold" style={{ marginBottom: '8px' }}>
        <i className={`fas ${icon}`}></i>
      </div>
      <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--gray)' }}>{label}</div>
    </button>
  );
}

export default Dashboard;
