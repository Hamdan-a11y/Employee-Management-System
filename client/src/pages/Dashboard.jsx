import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Building2, 
  UserPlus, 
  ArrowRight, 
  Briefcase,
  AlertCircle,
  Calendar,
  TrendingUp,
  PieChart
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTooltip, setActiveTooltip] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/dashboard/stats');
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Donut chart calculations for Active vs. Inactive personnel
  const totalEmployees = stats?.totalEmployees ?? 0;
  const activeEmployees = stats?.activeEmployees ?? 0;
  const inactiveEmployees = stats?.inactiveEmployees ?? 0;

  const radius = 54;
  const circumference = 2 * Math.PI * radius; // ≈ 339.29
  const activeRatio = totalEmployees > 0 ? activeEmployees / totalEmployees : 0;
  const inactiveRatio = totalEmployees > 0 ? inactiveEmployees / totalEmployees : 0;

  const activeDash = activeRatio * circumference;
  const inactiveDash = inactiveRatio * circumference;

  const activePercent = totalEmployees > 0 ? (activeRatio * 100).toFixed(1) : 0;
  const inactivePercent = totalEmployees > 0 ? (inactiveRatio * 100).toFixed(1) : 0;

  // Monthly hiring statistics calculation
  const hiringData = stats?.monthlyHiringStats || [];
  const maxHires = Math.max(4, ...hiringData.map((d) => d.count || 0));
  const totalRecentHires = hiringData.reduce((sum, d) => sum + (d.count || 0), 0);

  return (
    <div className="app-container">
      <Sidebar />

      <main className="dashboard-main">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">
              Company Overview
            </h1>
            <p className="dashboard-subtitle">
              Real-time directory metrics, organizational distribution, and hiring analytics.
            </p>
          </div>

          {isAdmin ? (
            <Link to="/employees/new" className="btn btn-primary">
              <UserPlus size={16} />
              <span>Add Employee</span>
            </Link>
          ) : (
            <Link 
              to={user?.employee_id ? `/employees/${user.employee_id}` : '/employees/me'} 
              className="btn btn-primary"
            >
              <Briefcase size={16} />
              <span>View My Profile</span>
            </Link>
          )}
        </div>

        {error && (
          <div className="dashboard-error">
            <div className="dashboard-error-content">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
            <button onClick={fetchStats} className="btn btn-secondary dashboard-retry-btn">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="dashboard-skeleton-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card dashboard-skeleton-card">
                <div className="dashboard-skeleton-bar-sm" />
                <div className="dashboard-skeleton-bar-lg" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Top Stat Cards */}
            <div className="dashboard-stats-grid">
              <div className="card dashboard-stat-card">
                <div className="dashboard-stat-icon primary">
                  <Users size={24} />
                </div>
                <div>
                  <div className="dashboard-stat-label">
                    Total Staff
                  </div>
                  <div className="dashboard-stat-value">
                    {stats?.totalEmployees ?? 0}
                  </div>
                </div>
              </div>

              <div className="card dashboard-stat-card">
                <div className="dashboard-stat-icon success">
                  <UserCheck size={24} />
                </div>
                <div>
                  <div className="dashboard-stat-label">
                    Active Status
                  </div>
                  <div className="dashboard-stat-value">
                    {stats?.activeEmployees ?? 0}
                  </div>
                </div>
              </div>

              <div className="card dashboard-stat-card">
                <div className="dashboard-stat-icon muted">
                  <UserX size={24} />
                </div>
                <div>
                  <div className="dashboard-stat-label">
                    Inactive Status
                  </div>
                  <div className="dashboard-stat-value">
                    {stats?.inactiveEmployees ?? 0}
                  </div>
                </div>
              </div>

              <div className="card dashboard-stat-card">
                <div className="dashboard-stat-icon primary">
                  <Building2 size={24} />
                </div>
                <div>
                  <div className="dashboard-stat-label">
                    Departments
                  </div>
                  <div className="dashboard-stat-value">
                    {stats?.totalDepartments ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Row: Interactive Analytical Charts */}
            <div className="dashboard-charts-grid">
              {/* Monthly Hiring Statistics Chart */}
              <div className="card dashboard-chart-card">
                <div className="dashboard-section-header">
                  <div>
                    <h2 className="dashboard-section-title">
                      Monthly Hiring Statistics
                    </h2>
                    <p className="dashboard-section-subtitle">
                      New team members joined over the last 6 months
                    </p>
                  </div>
                  <span className="badge badge-inactive dashboard-hiring-badge">
                    <TrendingUp size={13} />
                    <span>{totalRecentHires} {totalRecentHires === 1 ? 'hire' : 'hires'} (6 mos)</span>
                  </span>
                </div>

                <div className="hiring-chart-container">
                  <div className="hiring-bars-wrapper">
                    {hiringData.map((item, index) => {
                      const barHeightPct = maxHires > 0 && item.count > 0 
                        ? Math.max(12, Math.round((item.count / maxHires) * 100))
                        : 0;
                      const isLatest = index === hiringData.length - 1;

                      return (
                        <div 
                          key={`${item.year}-${item.month}`}
                          className="hiring-bar-slot"
                          onMouseEnter={() => setActiveTooltip(index)}
                          onMouseLeave={() => setActiveTooltip(null)}
                        >
                          {/* Interactive Tooltip */}
                          <div className={`hiring-bar-tooltip ${activeTooltip === index ? 'visible' : ''}`}>
                            <div className="tooltip-title">{item.monthLabel}</div>
                            <div className="tooltip-value">{item.count} {item.count === 1 ? 'new hire' : 'new hires'}</div>
                          </div>

                          {/* Bar Value Indicator */}
                          <span className={`hiring-bar-count ${item.count > 0 ? 'has-hires' : ''}`}>
                            {item.count > 0 ? item.count : ''}
                          </span>

                          {/* Track and Fill */}
                          <div className="hiring-bar-track">
                            {item.count > 0 && (
                              <div 
                                className={`hiring-bar-fill ${isLatest ? 'latest' : ''}`}
                                style={{ height: `${barHeightPct}%` }}
                              />
                            )}
                          </div>

                          {/* Month Label */}
                          <span className="hiring-bar-label">
                            {item.monthLabel.split(' ')[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Active vs. Inactive Personnel Chart */}
              <div className="card dashboard-chart-card">
                <div className="dashboard-section-header">
                  <div>
                    <h2 className="dashboard-section-title">
                      Active vs. Inactive Ratio
                    </h2>
                    <p className="dashboard-section-subtitle">
                      Distribution of employee engagement status
                    </p>
                  </div>
                  <span className="badge badge-inactive">
                    <PieChart size={13} />
                    <span>Breakdown</span>
                  </span>
                </div>

                <div className="status-donut-container">
                  <div className="donut-chart-box">
                    <svg viewBox="0 0 160 160" className="donut-svg">
                      {/* Track background circle */}
                      <circle
                        cx="80"
                        cy="80"
                        r={radius}
                        fill="none"
                        stroke="var(--bg-subtle)"
                        strokeWidth="15"
                      />

                      {totalEmployees > 0 ? (
                        <>
                          {/* Active segment */}
                          <circle
                            cx="80"
                            cy="80"
                            r={radius}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="15"
                            strokeDasharray={`${activeDash} ${circumference}`}
                            strokeDashoffset="0"
                            transform="rotate(-90 80 80)"
                            className="donut-segment active-segment"
                          />
                          {/* Inactive segment */}
                          <circle
                            cx="80"
                            cy="80"
                            r={radius}
                            fill="none"
                            stroke="#94a3b8"
                            strokeWidth="15"
                            strokeDasharray={`${inactiveDash} ${circumference}`}
                            strokeDashoffset={-activeDash}
                            transform="rotate(-90 80 80)"
                            className="donut-segment inactive-segment"
                          />
                        </>
                      ) : null}

                      {/* Center summary count */}
                      <text x="80" y="75" textAnchor="middle" className="donut-center-num">
                        {totalEmployees}
                      </text>
                      <text x="80" y="93" textAnchor="middle" className="donut-center-text">
                        Total Staff
                      </text>
                    </svg>
                  </div>

                  {/* Status Legend Details */}
                  <div className="donut-legend-list">
                    <div className="donut-legend-item">
                      <div className="donut-legend-head">
                        <span className="legend-dot active-dot" />
                        <span className="legend-name">Active Employees</span>
                      </div>
                      <div className="legend-metrics">
                        <span className="legend-count">{activeEmployees}</span>
                        <span className="legend-pct">({activePercent}%)</span>
                      </div>
                    </div>

                    <div className="donut-legend-item">
                      <div className="donut-legend-head">
                        <span className="legend-dot inactive-dot" />
                        <span className="legend-name">Inactive Employees</span>
                      </div>
                      <div className="legend-metrics">
                        <span className="legend-count">{inactiveEmployees}</span>
                        <span className="legend-pct">({inactivePercent}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Lower Row: Employees by Department & Recently Joined Employees */}
            <div className="dashboard-sections-grid">
              {/* Employees by Department Chart */}
              <div className="card">
                <div className="dashboard-section-header">
                  <div>
                    <h2 className="dashboard-section-title">
                      Employees by Department
                    </h2>
                    <p className="dashboard-section-subtitle">
                      Headcount distribution across company units
                    </p>
                  </div>
                  <Link to="/departments" className="dashboard-link-view-all">
                    <span>Manage</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>

                <div className="dashboard-dept-chart-list">
                  {stats?.departmentBreakdown?.map((dept) => {
                    const deptCount = Number(dept.employeeCount) || 0;
                    const deptSharePct = totalEmployees > 0 
                      ? Math.round((deptCount / totalEmployees) * 100) 
                      : 0;

                    return (
                      <div key={dept.id} className="dashboard-dept-chart-item">
                        <div className="dashboard-dept-header">
                          <div className="dashboard-dept-info">
                            <Briefcase size={16} color="var(--text-secondary)" />
                            <span className="dashboard-dept-name">
                              {dept.name}
                            </span>
                          </div>
                          <div className="dashboard-dept-badge-group">
                            <span className="badge badge-inactive">
                              {deptCount} {deptCount === 1 ? 'employee' : 'employees'}
                            </span>
                            <span className="dashboard-dept-pct">
                              {deptSharePct}%
                            </span>
                          </div>
                        </div>

                        {/* Interactive Proportional Bar */}
                        <div className="dashboard-dept-bar-track">
                          <div 
                            className="dashboard-dept-bar-fill" 
                            style={{ width: `${deptSharePct}%` }}
                            title={`${dept.name}: ${deptCount} employees (${deptSharePct}% of total)`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recently Joined Employees */}
              <div className="card">
                <div className="dashboard-section-header">
                  <div>
                    <h2 className="dashboard-section-title">
                      Recently Joined Employees
                    </h2>
                    <p className="dashboard-section-subtitle">
                      Latest team additions and joined dates
                    </p>
                  </div>
                  {isAdmin && (
                    <Link to="/employees" className="dashboard-link-view-all">
                      <span>View all</span>
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </div>

                {stats?.recentEmployees?.length === 0 ? (
                  <p className="dashboard-recent-empty">
                    No employees added yet. Click "Add Employee" above to add your first team member!
                  </p>
                ) : (
                  <div className="dashboard-recent-list">
                    {stats?.recentEmployees?.map((emp) => (
                      <div key={emp.id} className="dashboard-recent-item">
                        <div className="dashboard-recent-left">
                          <div className="dashboard-recent-avatar">
                            {emp.name ? emp.name.charAt(0).toUpperCase() : 'E'}
                          </div>
                          <div>
                            <div className="dashboard-recent-name">
                              {emp.name}
                            </div>
                            <div className="dashboard-recent-meta">
                              <span>{emp.designation}</span>
                              <span className="meta-separator">•</span>
                              <span>{emp.department_name || 'No Dept'}</span>
                            </div>
                            {emp.created_at && (
                              <div className="dashboard-recent-date">
                                <Calendar size={12} />
                                <span>Joined {formatDate(emp.created_at)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <span className={`badge ${emp.status === 'Active' ? 'badge-active' : 'badge-inactive'}`}>
                          {emp.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
