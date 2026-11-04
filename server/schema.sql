CREATE DATABASE IF NOT EXISTS employee_db;
USE employee_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  approved_headcount INT NOT NULL DEFAULT 0 CHECK (approved_headcount >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  termination_date DATE NULL DEFAULT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_employees_deleted_at (deleted_at),
  INDEX idx_employees_termination_date (termination_date),
  INDEX idx_employees_dept (department_id)
);

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
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_users_role (role),
  INDEX idx_users_dept (department_id)
);

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

INSERT INTO departments (name, approved_headcount) VALUES
  ('Engineering', 35),
  ('Human Resources', 5),
  ('Marketing', 8),
  ('Finance', 5),
  ('Sales', 6),
  ('Research & Development', 6),
  ('Frontend Engineering', 6),
  ('Backend Engineering', 8),
  ('Full Stack Development', 5),
  ('Database Administration', 3),
  ('Artificial Intelligence', 10),
  ('Information Technology', 4),
  ('Cybersecurity', 6),
  ('Product & Design', 0),
  ('Customer Operations', 6),
  ('Quality Assurance', 5)
ON DUPLICATE KEY UPDATE approved_headcount = VALUES(approved_headcount);

INSERT INTO employees (name, email, phone, department_id, designation, status, termination_date, deleted_at) VALUES
  ('Alex Mercer', 'alex.mercer@company.com', '+1-555-0101', (SELECT id FROM departments WHERE name = 'Engineering'), 'Principal Staff Architect', 'Active', NULL, NULL),
  ('Muhammad Hamdan', 'muhammadhumdan43@gmail.com', '+1-555-0102', (SELECT id FROM departments WHERE name = 'Engineering'), 'Senior Cloud Infrastructure Engineer', 'Active', NULL, NULL),
  ('David Zhang', 'david.zhang@company.com', '+1-555-0103', (SELECT id FROM departments WHERE name = 'Engineering'), 'Lead Systems Architect', 'Active', NULL, NULL),
  ('Elena Rostova', 'elena.rostova@company.com', '+1-555-0104', (SELECT id FROM departments WHERE name = 'Engineering'), 'Senior Firmware Engineer', 'Active', NULL, NULL),
  ('Julian Alvarez', 'julian.alvarez@company.com', '+1-555-0105', (SELECT id FROM departments WHERE name = 'Engineering'), 'Embedded Hardware Specialist', 'Active', NULL, NULL),
  ('Grace Hopper-Lee', 'grace.hopper@company.com', '+1-555-0106', (SELECT id FROM departments WHERE name = 'Engineering'), 'Distributed Systems Specialist', 'Active', NULL, NULL),
  ('Lucas Silva', 'lucas.silva@company.com', '+1-555-0107', (SELECT id FROM departments WHERE name = 'Engineering'), 'Senior Core Platform Dev', 'Active', NULL, NULL),
  ('Amelia Watson', 'amelia.watson@company.com', '+1-555-0108', (SELECT id FROM departments WHERE name = 'Engineering'), 'Microservices Architecture Lead', 'Active', NULL, NULL),
  ('Oliver Twist', 'oliver.twist@company.com', '+1-555-0109', (SELECT id FROM departments WHERE name = 'Engineering'), 'Linux Kernel & Performance Engineer', 'Active', NULL, NULL),
  ('Zoe Kravitz', 'zoe.kravitz@company.com', '+1-555-0110', (SELECT id FROM departments WHERE name = 'Engineering'), 'Reliability & Chaos Engineer', 'Active', NULL, NULL),
  ('Felix Baum', 'felix.baum@company.com', '+1-555-0111', (SELECT id FROM departments WHERE name = 'Engineering'), 'High-Throughput Stream Dev', 'Active', NULL, NULL),
  ('Priya Sharma', 'priya.sharma@company.com', '+1-555-0112', (SELECT id FROM departments WHERE name = 'Engineering'), 'Senior Protocol Engineer', 'Active', NULL, NULL),
  ('Kenji Sato', 'kenji.sato@company.com', '+1-555-0113', (SELECT id FROM departments WHERE name = 'Engineering'), 'Concurrency & Cache Specialist', 'Active', NULL, NULL),
  ('Dmitri Volkov', 'dmitri.volkov@company.com', '+1-555-0114', (SELECT id FROM departments WHERE name = 'Engineering'), 'Core Network Dev', 'Active', NULL, NULL),
  ('Henry Cavill', 'henry.cavill@company.com', '+1-555-0115', (SELECT id FROM departments WHERE name = 'Engineering'), 'Senior Automation Architect', 'Active', NULL, NULL),
  ('Nadia Petrova', 'nadia.petrova@company.com', '+1-555-0116', (SELECT id FROM departments WHERE name = 'Engineering'), 'DevOps Platform Engineer', 'Active', NULL, NULL),
  ('Tariq Al-Mansoor', 'tariq.mansoor@company.com', '+1-555-0117', (SELECT id FROM departments WHERE name = 'Engineering'), 'Observability & Telemetry Lead', 'Active', NULL, NULL),
  ('Claire Redfield', 'claire.redfield@company.com', '+1-555-0118', (SELECT id FROM departments WHERE name = 'Engineering'), 'API Gateway Architect', 'Active', NULL, NULL),
  ('Leo Noceda', 'leo.noceda@company.com', '+1-555-0119', (SELECT id FROM departments WHERE name = 'Engineering'), 'Release Engineering Lead', 'Active', NULL, NULL),
  ('Jordan Belfort', 'jordan.belfort@company.com', '+1-555-0120', (SELECT id FROM departments WHERE name = 'Engineering'), 'Security Tools Dev', 'Active', NULL, NULL),
  ('Stella Artois', 'stella.artois@company.com', '+1-555-0121', (SELECT id FROM departments WHERE name = 'Engineering'), 'Software Engineer II', 'Active', NULL, NULL),
  ('Victor Hugo', 'victor.hugo@company.com', '+1-555-0122', (SELECT id FROM departments WHERE name = 'Engineering'), 'Software Engineer II', 'Active', NULL, NULL),
  ('Layla Vance', 'layla.vance@company.com', '+1-555-0123', (SELECT id FROM departments WHERE name = 'Engineering'), 'Software Engineer I', 'Active', NULL, NULL),
  ('Gordon Freeman', 'gordon.freeman@company.com', '+1-555-0124', (SELECT id FROM departments WHERE name = 'Engineering'), 'Software Engineer I', 'Active', NULL, NULL),
  ('Alyx Vance', 'alyx.vance@company.com', '+1-555-0125', (SELECT id FROM departments WHERE name = 'Engineering'), 'Software Engineer I', 'Active', NULL, NULL),
  ('Barney Calhoun', 'barney.calhoun@company.com', '+1-555-0126', (SELECT id FROM departments WHERE name = 'Engineering'), 'Associate Engineer', 'Active', NULL, NULL),
  ('Maya Lin', 'maya.lin@company.com', '+1-555-0127', (SELECT id FROM departments WHERE name = 'Engineering'), 'Junior Test Automation Dev', 'Active', NULL, NULL),
  ('Arjun Reddy', 'arjun.reddy@company.com', '+1-555-0128', (SELECT id FROM departments WHERE name = 'Engineering'), 'Junior Build Engineer', 'Active', NULL, NULL),
  ('Sarah Jenkins', 'sarah.jenkins@company.com', '+1-555-0201', (SELECT id FROM departments WHERE name = 'Human Resources'), 'VP of People & Culture', 'Active', NULL, NULL),
  ('Marcus Vance', 'marcus.vance@company.com', '+1-555-0202', (SELECT id FROM departments WHERE name = 'Human Resources'), 'Senior HR Business Partner', 'Active', NULL, NULL),
  ('Emily Chen', 'emily.chen@company.com', '+1-555-0203', (SELECT id FROM departments WHERE name = 'Human Resources'), 'Talent Acquisition Manager', 'Active', NULL, NULL),
  ('Liam Gallagher', 'liam.gallagher@company.com', '+1-555-0204', (SELECT id FROM departments WHERE name = 'Human Resources'), 'People Operations Specialist', 'Active', NULL, NULL),
  ('Olivia Martinez', 'olivia.martinez@company.com', '+1-555-0301', (SELECT id FROM departments WHERE name = 'Marketing'), 'Head of Growth Marketing', 'Active', NULL, NULL),
  ('Noah Patel', 'noah.patel@company.com', '+1-555-0302', (SELECT id FROM departments WHERE name = 'Marketing'), 'Product Marketing Lead', 'Active', NULL, NULL),
  ('Ava Kowalski', 'ava.kowalski@company.com', '+1-555-0303', (SELECT id FROM departments WHERE name = 'Marketing'), 'Senior Content Strategist', 'Active', NULL, NULL),
  ('Sophia Rossi', 'sophia.rossi@company.com', '+1-555-0304', (SELECT id FROM departments WHERE name = 'Marketing'), 'SEO & Performance Lead', 'Active', NULL, NULL),
  ('Ethan Hunt', 'ethan.hunt@company.com', '+1-555-0305', (SELECT id FROM departments WHERE name = 'Marketing'), 'Brand & Campaign Designer', 'Active', NULL, NULL),
  ('David Kim', 'david.kim@company.com', '+1-555-0306', (SELECT id FROM departments WHERE name = 'Marketing'), 'Community Marketing Manager', 'Active', NULL, NULL),
  ('Chloe Dubois', 'chloe.dubois@company.com', '+1-555-0307', (SELECT id FROM departments WHERE name = 'Marketing'), 'Social Media Specialist', 'Active', NULL, NULL),
  ('Alexander Wright', 'alexander.wright@company.com', '+1-555-0308', (SELECT id FROM departments WHERE name = 'Marketing'), 'Marketing Analytics Lead', 'Active', NULL, NULL),
  ('Mia Thompson', 'mia.thompson@company.com', '+1-555-0401', (SELECT id FROM departments WHERE name = 'Finance'), 'Chief Financial Officer', 'Active', NULL, NULL),
  ('Daniel Craig', 'daniel.craig@company.com', '+1-555-0402', (SELECT id FROM departments WHERE name = 'Finance'), 'Senior Corporate Controller', 'Active', NULL, NULL),
  ('Jessica Taylor', 'jessica.taylor@company.com', '+1-555-0403', (SELECT id FROM departments WHERE name = 'Finance'), 'Lead Financial Analyst', 'Active', NULL, NULL),
  ('Benjamin Scott', 'benjamin.scott@company.com', '+1-555-0404', (SELECT id FROM departments WHERE name = 'Finance'), 'Treasury & Compliance Manager', 'Active', NULL, NULL),
  ('Hannah Abbott', 'hannah.abbott@company.com', '+1-555-0405', (SELECT id FROM departments WHERE name = 'Finance'), 'Senior Payroll Accountant', 'Active', NULL, NULL),
  ('Dr. Robert Oppen', 'robert.oppen@company.com', '+1-555-0501', (SELECT id FROM departments WHERE name = 'Sales'), 'VP of Global Enterprise Sales', 'Active', NULL, NULL),
  ('Julian Morales', 'julian.morales@company.com', '+1-555-0502', (SELECT id FROM departments WHERE name = 'Sales'), 'Director of Strategic Accounts', 'Active', NULL, NULL),
  ('Grace Lee', 'grace.lee@company.com', '+1-555-0503', (SELECT id FROM departments WHERE name = 'Sales'), 'Enterprise Account Executive', 'Active', NULL, NULL),
  ('Lucas Silva Jr', 'lucas.silvajr@company.com', '+1-555-0504', (SELECT id FROM departments WHERE name = 'Sales'), 'Mid-Market Account Executive', 'Active', NULL, NULL),
  ('Amelia Pond', 'amelia.pond@company.com', '+1-555-0505', (SELECT id FROM departments WHERE name = 'Sales'), 'Commercial Sales Specialist', 'Active', NULL, NULL),
  ('Oliver Queen', 'oliver.queen@company.com', '+1-555-0506', (SELECT id FROM departments WHERE name = 'Sales'), 'Sales Enablement Manager', 'Active', NULL, NULL),
  ('Zoe Saldana', 'zoe.saldana@company.com', '+1-555-0507', (SELECT id FROM departments WHERE name = 'Sales'), 'Senior Sales Engineer', 'Active', NULL, NULL),
  ('Felix Leiter', 'felix.leiter@company.com', '+1-555-0508', (SELECT id FROM departments WHERE name = 'Sales'), 'Inbound Business Representative', 'Active', NULL, NULL),
  ('Dr. Victor Frank', 'victor.frank@company.com', '+1-555-0601', (SELECT id FROM departments WHERE name = 'Research & Development'), 'Principal Research Fellow', 'Active', NULL, NULL),
  ('Hedy Lamarr', 'hedy.lamarr@company.com', '+1-555-0602', (SELECT id FROM departments WHERE name = 'Research & Development'), 'Wireless Systems Scientist', 'Active', NULL, NULL),
  ('Nikola Tesla', 'nikola.tesla@company.com', '+1-555-0603', (SELECT id FROM departments WHERE name = 'Research & Development'), 'Signal Processing Architect', 'Active', NULL, NULL),
  ('Marie Curie', 'marie.curie@company.com', '+1-555-0604', (SELECT id FROM departments WHERE name = 'Research & Development'), 'Materials Science Specialist', 'Active', NULL, NULL),
  ('Alan Turing', 'alan.turing@company.com', '+1-555-0605', (SELECT id FROM departments WHERE name = 'Research & Development'), 'Applied Algorithms Lead', 'Active', NULL, NULL),
  ('Sophie Germain', 'sophie.germain@company.com', '+1-555-0701', (SELECT id FROM departments WHERE name = 'Frontend Engineering'), 'Staff Frontend Architect', 'Active', NULL, NULL),
  ('Klaus Weber', 'klaus.weber@company.com', '+1-555-0702', (SELECT id FROM departments WHERE name = 'Frontend Engineering'), 'Senior React & Design Systems Lead', 'Active', NULL, NULL),
  ('Iris West', 'iris.west@company.com', '+1-555-0703', (SELECT id FROM departments WHERE name = 'Frontend Engineering'), 'Web Performance & Next.js Engineer', 'Active', NULL, NULL),
  ('Richard Hendricks', 'richard.hendricks@company.com', '+1-555-0704', (SELECT id FROM departments WHERE name = 'Frontend Engineering'), 'Senior UI/UX Component Dev', 'Active', NULL, NULL),
  ('Bertram Gilfoyle', 'bertram.gilfoyle@company.com', '+1-555-0705', (SELECT id FROM departments WHERE name = 'Frontend Engineering'), 'Animation & Micro-Interactions Dev', 'Active', NULL, NULL),
  ('Dinesh Chugtai', 'dinesh.chugtai@company.com', '+1-555-0706', (SELECT id FROM departments WHERE name = 'Frontend Engineering'), 'Accessibility & Web Standards Lead', 'Active', NULL, NULL),
  ('Jared Dunn', 'jared.dunn@company.com', '+1-555-0801', (SELECT id FROM departments WHERE name = 'Backend Engineering'), 'Staff Backend Architect', 'Active', NULL, NULL),
  ('Elliot Alderson', 'elliot.alderson@company.com', '+1-555-0802', (SELECT id FROM departments WHERE name = 'Backend Engineering'), 'Principal Distributed Systems Dev', 'Active', NULL, NULL),
  ('Darlene Alderson', 'darlene.alderson@company.com', '+1-555-0803', (SELECT id FROM departments WHERE name = 'Backend Engineering'), 'Senior Go Microservices Engineer', 'Active', NULL, NULL),
  ('Angela Moss', 'angela.moss@company.com', '+1-555-0804', (SELECT id FROM departments WHERE name = 'Backend Engineering'), 'Event Streaming & Kafka Lead', 'Active', NULL, NULL),
  ('Tyrell Wellick', 'tyrell.wellick@company.com', '+1-555-0805', (SELECT id FROM departments WHERE name = 'Backend Engineering'), 'High-Throughput Node.js Dev', 'Active', NULL, NULL),
  ('Gideon Goddard', 'gideon.goddard@company.com', '+1-555-0806', (SELECT id FROM departments WHERE name = 'Backend Engineering'), 'Backend Infrastructure Dev', 'Active', NULL, NULL),
  ('Fernando Vera', 'fernando.vera@company.com', '+1-555-0807', (SELECT id FROM departments WHERE name = 'Backend Engineering'), 'Database Integration Engineer', 'Active', NULL, NULL),
  ('Dominique DiPierro', 'dom.dipierro@company.com', '+1-555-0901', (SELECT id FROM departments WHERE name = 'Full Stack Development'), 'Lead Full Stack Architect', 'Active', NULL, NULL),
  ('Krista Gordon', 'krista.gordon@company.com', '+1-555-0902', (SELECT id FROM departments WHERE name = 'Full Stack Development'), 'Senior Full Stack TypeScript Dev', 'Active', NULL, NULL),
  ('Leon Black', 'leon.black@company.com', '+1-555-0903', (SELECT id FROM departments WHERE name = 'Full Stack Development'), 'Full Stack Cloud Integrations Dev', 'Active', NULL, NULL),
  ('Trenton Stewart', 'trenton.stewart@company.com', '+1-555-0904', (SELECT id FROM departments WHERE name = 'Full Stack Development'), 'Full Stack Web Platform Dev', 'Active', NULL, NULL),
  ('Sunil Mobley', 'sunil.mobley@company.com', '+1-555-0905', (SELECT id FROM departments WHERE name = 'Full Stack Development'), 'Full Stack API Specialist', 'Active', NULL, NULL),
  ('Phillip Price', 'phillip.price@company.com', '+1-555-1001', (SELECT id FROM departments WHERE name = 'Database Administration'), 'Lead DBA & Storage Architect', 'Active', NULL, NULL),
  ('Whiterose Zhang', 'whiterose@company.com', '+1-555-1002', (SELECT id FROM departments WHERE name = 'Database Administration'), 'MySQL & TiDB Distributed DBA', 'Active', NULL, NULL),
  ('Grant Ward', 'grant.ward@company.com', '+1-555-1003', (SELECT id FROM departments WHERE name = 'Database Administration'), 'PostgreSQL Scalability Specialist', 'Active', NULL, NULL),
  ('Irving Bailey', 'irving.bailey@company.com', '+1-555-1004', (SELECT id FROM departments WHERE name = 'Database Administration'), 'Data Pipeline & Backup Administrator', 'Active', NULL, NULL),
  ('Dr. Geoffrey Hinton', 'geoffrey.hinton@company.com', '+1-555-1101', (SELECT id FROM departments WHERE name = 'Artificial Intelligence'), 'Chief AI Scientist', 'Active', NULL, NULL),
  ('Yann LeCun', 'yann.lecun@company.com', '+1-555-1102', (SELECT id FROM departments WHERE name = 'Artificial Intelligence'), 'Director of Deep Learning Systems', 'Active', NULL, NULL),
  ('Yoshua Bengio', 'yoshua.bengio@company.com', '+1-555-1103', (SELECT id FROM departments WHERE name = 'Artificial Intelligence'), 'Principal LLM & Reasoning Architect', 'Active', NULL, NULL),
  ('Fei-Fei Li', 'feifei.li@company.com', '+1-555-1104', (SELECT id FROM departments WHERE name = 'Artificial Intelligence'), 'Computer Vision & Multimodal Lead', 'Active', NULL, NULL),
  ('Demis Hassabis', 'demis.hassabis@company.com', '+1-555-1105', (SELECT id FROM departments WHERE name = 'Artificial Intelligence'), 'Reinforcement Learning Specialist', 'Active', NULL, NULL),
  ('Ilya Sutskever', 'ilya.sutskever@company.com', '+1-555-1106', (SELECT id FROM departments WHERE name = 'Artificial Intelligence'), 'Senior Inference Optimization Dev', 'Active', NULL, NULL),
  ('Andrej Karpathy', 'andrej.karpathy@company.com', '+1-555-1107', (SELECT id FROM departments WHERE name = 'Artificial Intelligence'), 'ML Training & Data Pipeline Lead', 'Active', NULL, NULL),
  ('Linus Torvalds', 'linus.torvalds@company.com', '+1-555-1201', (SELECT id FROM departments WHERE name = 'Information Technology'), 'Director of Enterprise Infrastructure', 'Active', NULL, NULL),
  ('Ken Thompson', 'ken.thompson@company.com', '+1-555-1202', (SELECT id FROM departments WHERE name = 'Information Technology'), 'Senior Systems Administrator', 'Active', NULL, NULL),
  ('Dennis Ritchie', 'dennis.ritchie@company.com', '+1-555-1203', (SELECT id FROM departments WHERE name = 'Information Technology'), 'Enterprise Network & Identity Lead', 'Active', NULL, NULL),
  ('Brian Kernighan', 'brian.kernighan@company.com', '+1-555-1204', (SELECT id FROM departments WHERE name = 'Information Technology'), 'IT Support & Asset Lead', 'Active', NULL, NULL),
  ('Bruce Schneier', 'bruce.schneier@company.com', '+1-555-1301', (SELECT id FROM departments WHERE name = 'Cybersecurity'), 'Chief Information Security Officer', 'Active', NULL, NULL),
  ('Kevin Mitnick', 'kevin.mitnick@company.com', '+1-555-1302', (SELECT id FROM departments WHERE name = 'Cybersecurity'), 'Principal Red Team & Pen Tester', 'Active', NULL, NULL),
  ('Ada Lovelace', 'ada.lovelace@company.com', '+1-555-1303', (SELECT id FROM departments WHERE name = 'Cybersecurity'), 'SOC Threat Intelligence Lead', 'Active', NULL, NULL),
  ('Claude Shannon', 'claude.shannon@company.com', '+1-555-1304', (SELECT id FROM departments WHERE name = 'Cybersecurity'), 'Cryptography & Protocol Analyst', 'Active', NULL, NULL),
  ('Whitfield Diffie', 'whitfield.diffie@company.com', '+1-555-1305', (SELECT id FROM departments WHERE name = 'Cybersecurity'), 'Cloud SecOps Engineer', 'Active', NULL, NULL),
  ('Jony Ive', 'jony.ive@company.com', '+1-555-1401', (SELECT id FROM departments WHERE name = 'Product & Design'), 'VP of Product Design', 'Active', NULL, NULL),
  ('Dieter Rams', 'dieter.rams@company.com', '+1-555-1402', (SELECT id FROM departments WHERE name = 'Product & Design'), 'Principal Design Systems Architect', 'Active', NULL, NULL),
  ('Don Norman', 'don.norman@company.com', '+1-555-1403', (SELECT id FROM departments WHERE name = 'Product & Design'), 'Lead UX Researcher & Human Factors', 'Active', NULL, NULL),
  ('Susan Kare', 'susan.kare@company.com', '+1-555-1404', (SELECT id FROM departments WHERE name = 'Product & Design'), 'Senior UI & Iconography Designer', 'Active', NULL, NULL),
  ('Tony Stark', 'tony.stark@company.com', '+1-555-1501', (SELECT id FROM departments WHERE name = 'Customer Operations'), 'Head of Customer Experience', 'Active', NULL, NULL),
  ('Pepper Potts', 'pepper.potts@company.com', '+1-555-1502', (SELECT id FROM departments WHERE name = 'Customer Operations'), 'Operations Escalations Lead', 'Active', NULL, NULL),
  ('Happy Hogan', 'happy.hogan@company.com', '+1-555-1503', (SELECT id FROM departments WHERE name = 'Customer Operations'), 'Enterprise Client Success Manager', 'Active', NULL, NULL),
  ('James Rhodes', 'james.rhodes@company.com', '+1-555-1504', (SELECT id FROM departments WHERE name = 'Customer Operations'), 'Support Engineering Lead', 'Active', NULL, NULL),
  ('Jarvis AI', 'jarvis.support@company.com', '+1-555-1505', (SELECT id FROM departments WHERE name = 'Customer Operations'), 'Customer Onboarding Specialist', 'Active', NULL, NULL),
  ('Margaret Hamilton', 'margaret.hamilton@company.com', '+1-555-1601', (SELECT id FROM departments WHERE name = 'Quality Assurance'), 'Director of Quality Engineering', 'Active', NULL, NULL),
  ('Dorothy Vaughan', 'dorothy.vaughan@company.com', '+1-555-1602', (SELECT id FROM departments WHERE name = 'Quality Assurance'), 'Lead Performance & Load Tester', 'Active', NULL, NULL),
  ('Mary Jackson', 'mary.jackson@company.com', '+1-555-1603', (SELECT id FROM departments WHERE name = 'Quality Assurance'), 'Senior QA Automation Dev', 'Active', NULL, NULL)
ON DUPLICATE KEY UPDATE
  department_id = VALUES(department_id),
  designation = VALUES(designation),
  status = 'Active',
  termination_date = NULL,
  deleted_at = NULL;

INSERT INTO employees (name, email, phone, department_id, designation, status, termination_date, deleted_at) VALUES
  ('Chloe Former', 'chloe.former@company.com', '+1-555-9001', (SELECT id FROM departments WHERE name = 'Marketing'), 'Marketing Associate', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 2 MONTH), NULL),
  ('Lucas Departed', 'lucas.departed@company.com', '+1-555-9002', (SELECT id FROM departments WHERE name = 'Marketing'), 'Content Specialist', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 5 MONTH), NULL),
  ('Adam Exited', 'adam.exited@company.com', '+1-555-9003', (SELECT id FROM departments WHERE name = 'Database Administration'), 'Junior DBA', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 1 MONTH), NULL),
  ('Sam Engineer', 'sam.engineer@company.com', '+1-555-9004', (SELECT id FROM departments WHERE name = 'Engineering'), 'QA Specialist', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 2 MONTH), NULL),
  ('Rachel Dev', 'rachel.dev@company.com', '+1-555-9005', (SELECT id FROM departments WHERE name = 'Engineering'), 'Frontend Developer', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 8 MONTH), NULL),
  ('Ryan Seller', 'ryan.seller@company.com', '+1-555-9006', (SELECT id FROM departments WHERE name = 'Sales'), 'Junior SDR', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 1 MONTH), NULL),
  ('Victor Closer', 'victor.closer@company.com', '+1-555-9007', (SELECT id FROM departments WHERE name = 'Sales'), 'Account Representative', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 3 MONTH), NULL),
  ('Dr. Felix Neural', 'felix.neural@company.com', '+1-555-9008', (SELECT id FROM departments WHERE name = 'Artificial Intelligence'), 'Junior ML Researcher', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 4 MONTH), NULL),
  ('Tina Tester', 'tina.tester@company.com', '+1-555-9009', (SELECT id FROM departments WHERE name = 'Quality Assurance'), 'Manual QA Analyst', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 2 MONTH), NULL),
  ('Max Securi', 'max.securi@company.com', '+1-555-9010', (SELECT id FROM departments WHERE name = 'Cybersecurity'), 'Security Analyst', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 5 MONTH), NULL),
  ('Nancy Recruiter', 'nancy.recruiter@company.com', '+1-555-9011', (SELECT id FROM departments WHERE name = 'Human Resources'), 'HR Coordinator', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 4 MONTH), NULL),
  ('Carl Service', 'carl.service@company.com', '+1-555-9012', (SELECT id FROM departments WHERE name = 'Customer Operations'), 'Support Specialist', 'Inactive', DATE_SUB(CURDATE(), INTERVAL 2 MONTH), NULL)
ON DUPLICATE KEY UPDATE
  department_id = VALUES(department_id),
  designation = VALUES(designation),
  status = 'Inactive',
  termination_date = VALUES(termination_date),
  deleted_at = NULL;

INSERT INTO employees (name, email, phone, department_id, designation, status, termination_date, deleted_at) VALUES
  ('Deleted Arthur', 'arthur.deleted@company.com', '+1-555-9901', (SELECT id FROM departments WHERE name = 'Engineering'), 'Old Eng Contractor', 'Inactive', NULL, DATE_SUB(NOW(), INTERVAL 10 DAY)),
  ('Deleted Beatrice', 'beatrice.deleted@company.com', '+1-555-9902', (SELECT id FROM departments WHERE name = 'Sales'), 'Old Sales Rep', 'Inactive', NULL, DATE_SUB(NOW(), INTERVAL 25 DAY)),
  ('Deleted Charles', 'charles.deleted@company.com', '+1-555-9903', (SELECT id FROM departments WHERE name = 'Finance'), 'Old Finance Auditor', 'Inactive', NULL, DATE_SUB(NOW(), INTERVAL 45 DAY))
ON DUPLICATE KEY UPDATE
  status = 'Inactive',
  deleted_at = VALUES(deleted_at);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT 'Admin Master', 'admin@example.com', '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'admin', NULL, NULL
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT 'HR Manager', 'hr_manager@example.com', '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'hr_manager', e.id, e.department_id
FROM employees e WHERE e.email = 'sarah.jenkins@company.com'
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), employee_id = VALUES(employee_id), department_id = VALUES(department_id);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT 'Engineering Manager', 'manager_dept1@example.com', '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'department_manager', e.id, e.department_id
FROM employees e WHERE e.email = 'alex.mercer@company.com'
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), employee_id = VALUES(employee_id), department_id = VALUES(department_id);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT 'HR Dept Manager', 'manager_dept2@example.com', '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'department_manager', e.id, e.department_id
FROM employees e WHERE e.email = 'marcus.vance@company.com'
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), employee_id = VALUES(employee_id), department_id = VALUES(department_id);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT 'Marketing Manager', 'manager_dept3@example.com', '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'department_manager', e.id, e.department_id
FROM employees e WHERE e.email = 'olivia.martinez@company.com'
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), employee_id = VALUES(employee_id), department_id = VALUES(department_id);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT 'Finance Manager', 'manager_dept4@example.com', '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'department_manager', e.id, e.department_id
FROM employees e WHERE e.email = 'mia.thompson@company.com'
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), employee_id = VALUES(employee_id), department_id = VALUES(department_id);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT 'Sales Manager', 'manager_dept5@example.com', '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'department_manager', e.id, e.department_id
FROM employees e WHERE e.email = 'robert.oppen@company.com'
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), employee_id = VALUES(employee_id), department_id = VALUES(department_id);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT 'Sarah Jenkins', 'sarah.jenkins@company.com', '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'hr_manager', e.id, e.department_id
FROM employees e WHERE e.email = 'sarah.jenkins@company.com'
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), employee_id = VALUES(employee_id), department_id = VALUES(department_id);

INSERT INTO users (name, email, password, role, employee_id, department_id)
SELECT e.name, e.email, '$2b$10$zVe8TO0S9VsOcHTmwJZFAu54Gc2GAl/BqrTXF2h2.NViuumf7amUK', 'employee', e.id, e.department_id
FROM employees e
WHERE e.email IN (
  'muhammadhumdan43@gmail.com', 'olivia.martinez@company.com', 'mia.thompson@company.com',
  'robert.oppen@company.com', 'victor.frank@company.com', 'sophie.germain@company.com',
  'jared.dunn@company.com', 'phillip.price@company.com', 'geoffrey.hinton@company.com',
  'bruce.schneier@company.com', 'margaret.hamilton@company.com'
)
ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), employee_id = VALUES(employee_id), department_id = VALUES(department_id);

INSERT INTO leave_balances (employee_id, year, annual_total, annual_used, sick_total, sick_used, casual_total, casual_used, maternity_total, maternity_used, paternity_total, paternity_used)
SELECT
  e.id,
  2026 AS year,
  15 AS annual_total,
  CASE WHEN e.designation LIKE '%Architect%' OR e.designation LIKE '%Head%' THEN 5 ELSE 0 END AS annual_used,
  10 AS sick_total,
  0 AS sick_used,
  5 AS casual_total,
  0 AS casual_used,
  90 AS maternity_total,
  0 AS maternity_used,
  10 AS paternity_total,
  0 AS paternity_used
FROM employees e WHERE e.status = 'Active'
ON DUPLICATE KEY UPDATE year = VALUES(year);

INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status, reviewed_by, reviewed_at) VALUES
  ((SELECT id FROM employees WHERE email = 'phillip.price@company.com'), 'Sick', DATE_SUB(CURDATE(), INTERVAL 40 DAY), DATE_SUB(CURDATE(), INTERVAL 21 DAY), 20, 'Post-surgery recovery and rest', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 41 DAY)),
  ((SELECT id FROM employees WHERE email = 'whiterose@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_SUB(CURDATE(), INTERVAL 6 DAY), 15, 'Family vacation and personal travel', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 21 DAY)),
  ((SELECT id FROM employees WHERE email = 'grant.ward@company.com'), 'Casual', DATE_SUB(CURDATE(), INTERVAL 5 DAY), DATE_SUB(CURDATE(), INTERVAL 4 DAY), 2, 'Personal errand and legal appointment', 'PENDING', NULL, NULL),
  ((SELECT id FROM employees WHERE email = 'margaret.hamilton@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 50 DAY), DATE_SUB(CURDATE(), INTERVAL 21 DAY), 30, 'Extended sabbatical and research travel', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 51 DAY)),
  ((SELECT id FROM employees WHERE email = 'dorothy.vaughan@company.com'), 'Sick', DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_SUB(CURDATE(), INTERVAL 8 DAY), 3, 'Viral flu rest', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 11 DAY)),
  ((SELECT id FROM employees WHERE email = 'mary.jackson@company.com'), 'Casual', DATE_SUB(CURDATE(), INTERVAL 2 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), 2, 'Family function', 'REJECTED', 1, DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ((SELECT id FROM employees WHERE email = 'olivia.martinez@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 45 DAY), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 16, 'Annual family holiday abroad', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 46 DAY)),
  ((SELECT id FROM employees WHERE email = 'noah.patel@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 28 DAY), DATE_SUB(CURDATE(), INTERVAL 13 DAY), 16, 'Overseas trip and retreat', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 29 DAY)),
  ((SELECT id FROM employees WHERE email = 'ava.kowalski@company.com'), 'Casual', DATE_SUB(CURDATE(), INTERVAL 3 DAY), DATE_SUB(CURDATE(), INTERVAL 2 DAY), 2, 'Personal emergency', 'PENDING', NULL, NULL),
  ((SELECT id FROM employees WHERE email = 'sophie.germain@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 60 DAY), DATE_SUB(CURDATE(), INTERVAL 43 DAY), 18, 'Annual leave and relocation', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 61 DAY)),
  ((SELECT id FROM employees WHERE email = 'klaus.weber@company.com'), 'Sick', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 17 DAY), 14, 'Medical treatment and physical therapy', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 31 DAY)),
  ((SELECT id FROM employees WHERE email = 'iris.west@company.com'), 'Casual', DATE_SUB(CURDATE(), INTERVAL 5 DAY), DATE_SUB(CURDATE(), INTERVAL 4 DAY), 2, 'Home repairs and delivery', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 6 DAY)),
  ((SELECT id FROM employees WHERE email = 'alex.mercer@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 35 DAY), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 6, 'Annual leave', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 36 DAY)),
  ((SELECT id FROM employees WHERE email = 'muhammadhumdan43@gmail.com'), 'Casual', DATE_SUB(CURDATE(), INTERVAL 12 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 3, 'Short personal break', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 13 DAY)),
  ((SELECT id FROM employees WHERE email = 'david.zhang@company.com'), 'Sick', DATE_SUB(CURDATE(), INTERVAL 4 DAY), DATE_SUB(CURDATE(), INTERVAL 3 DAY), 2, 'Doctor consultation and recovery', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 5 DAY)),
  ((SELECT id FROM employees WHERE email = 'marcus.vance@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 25 DAY), DATE_SUB(CURDATE(), INTERVAL 22 DAY), 3, 'Short trip', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 26 DAY)),
  ((SELECT id FROM employees WHERE email = 'emily.chen@company.com'), 'Sick', DATE_SUB(CURDATE(), INTERVAL 15 DAY), DATE_SUB(CURDATE(), INTERVAL 14 DAY), 2, 'Migraine recovery', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 16 DAY)),
  ((SELECT id FROM employees WHERE email = 'mia.thompson@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 40 DAY), DATE_SUB(CURDATE(), INTERVAL 37 DAY), 3, 'Rest period post audit', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 41 DAY)),
  ((SELECT id FROM employees WHERE email = 'daniel.craig@company.com'), 'Casual', DATE_SUB(CURDATE(), INTERVAL 18 DAY), DATE_SUB(CURDATE(), INTERVAL 17 DAY), 2, 'Banking appointments', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 19 DAY)),
  ((SELECT id FROM employees WHERE email = 'robert.oppen@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 50 DAY), DATE_SUB(CURDATE(), INTERVAL 43 DAY), 7, 'Mid-year vacation', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 51 DAY)),
  ((SELECT id FROM employees WHERE email = 'julian.morales@company.com'), 'Casual', DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_SUB(CURDATE(), INTERVAL 16 DAY), 5, 'Personal commitments', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 21 DAY)),
  ((SELECT id FROM employees WHERE email = 'jared.dunn@company.com'), 'Sick', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 26 DAY), 5, 'Dental procedure recovery', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 31 DAY)),
  ((SELECT id FROM employees WHERE email = 'dom.dipierro@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 35 DAY), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 6, 'Annual family holiday', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 36 DAY)),
  ((SELECT id FROM employees WHERE email = 'geoffrey.hinton@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 45 DAY), DATE_SUB(CURDATE(), INTERVAL 38 DAY), 8, 'Conference and academic break', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 46 DAY)),
  ((SELECT id FROM employees WHERE email = 'linus.torvalds@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 25 DAY), DATE_SUB(CURDATE(), INTERVAL 22 DAY), 4, 'Annual break', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 26 DAY)),
  ((SELECT id FROM employees WHERE email = 'bruce.schneier@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 40 DAY), DATE_SUB(CURDATE(), INTERVAL 34 DAY), 7, 'Post-audit personal time off', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 41 DAY)),
  ((SELECT id FROM employees WHERE email = 'tony.stark@company.com'), 'Annual', DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_SUB(CURDATE(), INTERVAL 16 DAY), 5, 'Family visit', 'APPROVED', 1, DATE_SUB(NOW(), INTERVAL 21 DAY))
;

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:45:00' HOUR_SECOND) AS check_out,
  8.75 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Engineering') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:10:00' HOUR_SECOND) AS check_out,
  8.17 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Human Resources') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:00:00' HOUR_SECOND) AS check_out,
  8.00 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Marketing') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:00:00' HOUR_SECOND) AS check_out,
  8.00 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Finance') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '08:30:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '18:15:00' HOUR_SECOND) AS check_out,
  9.75 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Sales') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:00:00' HOUR_SECOND) AS check_out,
  8.00 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Research & Development') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:36:00' HOUR_SECOND) AS check_out,
  8.60 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Frontend Engineering') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:50:00' HOUR_SECOND) AS check_out,
  8.83 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Backend Engineering') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:20:00' HOUR_SECOND) AS check_out,
  8.33 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Full Stack Development') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:15:00' HOUR_SECOND) AS check_out,
  8.25 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Database Administration') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '08:45:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '18:30:00' HOUR_SECOND) AS check_out,
  9.75 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Artificial Intelligence') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:00:00' HOUR_SECOND) AS check_out,
  8.00 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Information Technology') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '08:30:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '18:15:00' HOUR_SECOND) AS check_out,
  9.75 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Cybersecurity') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:00:00' HOUR_SECOND) AS check_out,
  8.00 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Customer Operations') AND e.status = 'Active';

INSERT IGNORE INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
SELECT
  e.id,
  DATE_SUB(CURDATE(), INTERVAL cal.offset DAY) AS date,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '09:00:00' HOUR_SECOND) AS check_in,
  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL cal.offset DAY), INTERVAL '17:30:00' HOUR_SECOND) AS check_out,
  8.50 AS total_hours,
  FALSE AS is_late,
  0 AS late_minutes,
  'Present' AS status
FROM employees e
CROSS JOIN (
  SELECT 1 AS offset UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26
  UNION ALL SELECT 29 UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33
  UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
  UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47
  UNION ALL SELECT 50 UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53 UNION ALL SELECT 54
  UNION ALL SELECT 57 UNION ALL SELECT 58 UNION ALL SELECT 59 UNION ALL SELECT 60 UNION ALL SELECT 61
  UNION ALL SELECT 64 UNION ALL SELECT 65 UNION ALL SELECT 66 UNION ALL SELECT 67 UNION ALL SELECT 68
  UNION ALL SELECT 71 UNION ALL SELECT 72 UNION ALL SELECT 73 UNION ALL SELECT 74 UNION ALL SELECT 75
) cal
WHERE e.department_id = (SELECT id FROM departments WHERE name = 'Quality Assurance') AND e.status = 'Active';

INSERT INTO attendance_corrections (attendance_id, employee_id, date, requested_check_in, requested_check_out, reason, status, reviewed_by, reviewed_at)
SELECT
  a.id,
  a.employee_id,
  a.date,
  DATE_ADD(a.date, INTERVAL '08:30:00' HOUR_SECOND),
  DATE_ADD(a.date, INTERVAL '17:30:00' HOUR_SECOND),
  'Forgot to punch badge on entry at security turnstile',
  'APPROVED',
  1,
  NOW()
FROM attendance a WHERE a.employee_id = (SELECT id FROM employees WHERE email = 'alex.mercer@company.com') LIMIT 1;

INSERT INTO audit_logs (user_id, user_name, user_email, action, entity_type, entity_id, employee_name, details, ip_address, created_at) VALUES
  (1, 'Admin Master', 'admin@example.com', 'CREATE', 'EMPLOYEE', (SELECT id FROM employees WHERE email = 'alex.mercer@company.com'), 'Alex Mercer', 'Created initial principal architect profile', '127.0.0.1', DATE_SUB(NOW(), INTERVAL 60 DAY)),
  (1, 'Admin Master', 'admin@example.com', 'CREATE', 'EMPLOYEE', (SELECT id FROM employees WHERE email = 'muhammadhumdan43@gmail.com'), 'Muhammad Hamdan', 'Created cloud infrastructure engineer profile', '127.0.0.1', DATE_SUB(NOW(), INTERVAL 58 DAY)),
  (1, 'Admin Master', 'admin@example.com', 'UPDATE', 'EMPLOYEE', (SELECT id FROM employees WHERE email = 'muhammadhumdan43@gmail.com'), 'Muhammad Hamdan', 'Promoted to Senior Cloud Infrastructure Engineer', '127.0.0.1', DATE_SUB(NOW(), INTERVAL 30 DAY)),
  (3, 'HR Manager', 'hr_manager@example.com', 'UPDATE', 'EMPLOYEE', (SELECT id FROM employees WHERE email = 'olivia.martinez@company.com'), 'Olivia Martinez', 'Updated designation to Head of Growth Marketing', '127.0.0.1', DATE_SUB(NOW(), INTERVAL 20 DAY)),
  (1, 'Admin Master', 'admin@example.com', 'DELETE', 'EMPLOYEE', (SELECT id FROM employees WHERE email = 'arthur.deleted@company.com'), 'Deleted Arthur', 'Archived contractor record upon project completion', '127.0.0.1', DATE_SUB(NOW(), INTERVAL 10 DAY));

INSERT INTO notifications (user_id, type, title, message, is_read, link, created_at) VALUES
  (1, 'system', 'Workforce Planning Initialized', 'All 16 departments and workforce planning metrics have been successfully seeded.', FALSE, '/workforce', DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  (1, 'account', 'New Staff Onboarded', '100+ active personnel profiles are active and monitored in the directory.', FALSE, '/employees', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  (2, 'security', 'Password Security Confirmed', 'Your EMS account credentials are verified with bcrypt encryption.', TRUE, '/attendance', DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (3, 'profile', 'Leave Requests Pending Review', 'New time-off requests are awaiting HR review in the portal.', FALSE, '/leaves', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  (1, 'system', 'Engineering Headcount Alert', 'Engineering department currently has open hiring positions.', FALSE, '/workforce', DATE_SUB(NOW(), INTERVAL 4 HOUR));

SET FOREIGN_KEY_CHECKS = 1;
