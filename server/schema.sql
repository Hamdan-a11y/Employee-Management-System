-- Creating Employee Database
CREATE DATABASE IF NOT EXISTS employee_db;
USE employee_db;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'hr_manager', 'department_manager', 'employee') NOT NULL DEFAULT 'employee',
  employee_id INT NULL, 
  department_id INT NULL,
  token_version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Password Resets Table
CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token_hash (token_hash),
  INDEX idx_user_id (user_id)
);

-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_token_hash (token_hash),
  INDEX idx_refresh_user (user_id)
);

-- Departments Table
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL,
  department_id INT,
  designation VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(255) NULL,
  status ENUM('Active', 'Inactive') DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_employees_deleted_at (deleted_at)
);

-- Employee Documents Table
CREATE TABLE IF NOT EXISTS employee_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_size INT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_employee_id (employee_id)
);

-- Audit Logs Table (immutable system activity trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  user_name VARCHAR(100) NOT NULL,
  user_email VARCHAR(150) NOT NULL,
  action ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE') NOT NULL,
  entity_type VARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE',
  entity_id INT NULL,
  employee_name VARCHAR(150) NOT NULL,
  details TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created_at (created_at DESC),
  INDEX idx_audit_action (action),
  INDEX idx_audit_user_id (user_id),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_employee_name (employee_name)
);

-- Notifications Table (In-app notifications for account, profile, security, and operations)
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('account', 'profile', 'security', 'system') NOT NULL DEFAULT 'system',
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_read (user_id, is_read),
  INDEX idx_notifications_created_at (created_at DESC)
);

-- Seed initial departments
INSERT IGNORE INTO departments (id, name)
VALUES
  (1, 'Engineering'),
  (2, 'Human Resources'),
  (3, 'Marketing'),
  (4, 'Finance'),
  (5, 'Sales');

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  check_in DATETIME NOT NULL,
  check_out DATETIME NULL,
  total_hours DECIMAL(5, 2) DEFAULT 0.00,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  late_minutes INT NOT NULL DEFAULT 0,
  status ENUM('Present', 'Half Day', 'Late', 'Absent') DEFAULT 'Present',
  is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY unique_emp_attendance_date (employee_id, date),
  INDEX idx_attendance_date (date),
  INDEX idx_attendance_emp_date (employee_id, date),
  INDEX idx_attendance_status (status)
);

-- Attendance Corrections Table
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attendance_id INT NULL,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  requested_check_in DATETIME NOT NULL,
  requested_check_out DATETIME NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_corr_emp (employee_id),
  INDEX idx_corr_status (status),
  INDEX idx_corr_date (date)
);

-- Leave Balances Table
CREATE TABLE IF NOT EXISTS leave_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  year INT NOT NULL,
  annual_total INT NOT NULL DEFAULT 15,
  annual_used INT NOT NULL DEFAULT 0,
  sick_total INT NOT NULL DEFAULT 10,
  sick_used INT NOT NULL DEFAULT 0,
  casual_total INT NOT NULL DEFAULT 5,
  casual_used INT NOT NULL DEFAULT 0,
  maternity_total INT NOT NULL DEFAULT 90,
  maternity_used INT NOT NULL DEFAULT 0,
  paternity_total INT NOT NULL DEFAULT 10,
  paternity_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY unique_emp_year (employee_id, year)
);

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  leave_type ENUM('Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid') NOT NULL DEFAULT 'Annual',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INT NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_leave_emp_status (employee_id, status),
  INDEX idx_leave_dates (start_date, end_date)
);
