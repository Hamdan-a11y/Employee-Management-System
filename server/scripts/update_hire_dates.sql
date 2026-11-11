-- ==============================================================================
-- Employee Management System - Realistic Hire Date Updates
-- Generated: 2026-11-11
-- Target: employees table in employee_db
-- ==============================================================================

USE employee_db;

-- 1. Ensure backup exists
CREATE TABLE IF NOT EXISTS employees_backup_20261111 AS SELECT * FROM employees;

-- 2. Update employee hire/join dates (created_at)
UPDATE employees SET created_at = '2024-01-03 09:00:00', updated_at = GREATEST(updated_at, '2024-01-03 09:00:00') WHERE id = 2;
UPDATE employees SET created_at = '2024-02-08 10:13:00', updated_at = GREATEST(updated_at, '2024-02-08 10:13:00') WHERE id = 20;
UPDATE employees SET created_at = '2024-03-13 11:26:00', updated_at = GREATEST(updated_at, '2024-03-13 11:26:00') WHERE id = 46;
UPDATE employees SET created_at = '2024-04-16 12:39:00', updated_at = GREATEST(updated_at, '2024-04-16 12:39:00') WHERE id = 47;
UPDATE employees SET created_at = '2024-05-21 13:52:00', updated_at = GREATEST(updated_at, '2024-05-21 13:52:00') WHERE id = 49;
UPDATE employees SET created_at = '2024-06-26 14:05:00', updated_at = GREATEST(updated_at, '2024-06-26 14:05:00') WHERE id = 50;
UPDATE employees SET created_at = '2024-07-29 15:18:00', updated_at = GREATEST(updated_at, '2024-07-29 15:18:00') WHERE id = 51;
UPDATE employees SET created_at = '2024-08-02 16:31:00', updated_at = GREATEST(updated_at, '2024-08-02 16:31:00') WHERE id = 57;
UPDATE employees SET created_at = '2024-09-09 09:44:00', updated_at = GREATEST(updated_at, '2024-09-09 09:44:00') WHERE id = 58;
UPDATE employees SET created_at = '2024-10-09 10:57:00', updated_at = GREATEST(updated_at, '2024-10-09 10:57:00') WHERE id = 62;
UPDATE employees SET created_at = '2024-11-18 11:10:00', updated_at = GREATEST(updated_at, '2024-11-18 11:10:00') WHERE id = 64;
UPDATE employees SET created_at = '2024-12-19 12:23:00', updated_at = GREATEST(updated_at, '2024-12-19 12:23:00') WHERE id = 88;
UPDATE employees SET created_at = '2025-01-22 13:36:00', updated_at = GREATEST(updated_at, '2025-01-22 13:36:00') WHERE id = 89;
UPDATE employees SET created_at = '2025-02-04 14:49:00', updated_at = GREATEST(updated_at, '2025-02-04 14:49:00') WHERE id = 90;
UPDATE employees SET created_at = '2025-03-05 15:02:00', updated_at = GREATEST(updated_at, '2025-03-05 15:02:00') WHERE id = 94;
UPDATE employees SET created_at = '2025-04-04 16:15:00', updated_at = GREATEST(updated_at, '2025-04-04 16:15:00') WHERE id = 167;
UPDATE employees SET created_at = '2025-05-09 09:28:00', updated_at = GREATEST(updated_at, '2025-05-09 09:28:00') WHERE id = 168;
UPDATE employees SET created_at = '2025-06-17 10:41:00', updated_at = GREATEST(updated_at, '2025-06-17 10:41:00') WHERE id = 183;
UPDATE employees SET created_at = '2025-07-15 11:54:00', updated_at = GREATEST(updated_at, '2025-07-15 11:54:00') WHERE id = 188;
UPDATE employees SET created_at = '2025-08-26 12:07:00', updated_at = GREATEST(updated_at, '2025-08-26 12:07:00') WHERE id = 189;
UPDATE employees SET created_at = '2025-09-25 13:20:00', updated_at = GREATEST(updated_at, '2025-09-25 13:20:00') WHERE id = 190;
UPDATE employees SET created_at = '2025-10-28 14:33:00', updated_at = GREATEST(updated_at, '2025-10-28 14:33:00') WHERE id = 192;
UPDATE employees SET created_at = '2025-11-13 15:46:00', updated_at = GREATEST(updated_at, '2025-11-13 15:46:00') WHERE id = 199;
UPDATE employees SET created_at = '2025-12-03 16:59:00', updated_at = GREATEST(updated_at, '2025-12-03 16:59:00') WHERE id = 203;
UPDATE employees SET created_at = '2026-01-13 09:12:00', updated_at = GREATEST(updated_at, '2026-01-13 09:12:00') WHERE id = 212;
UPDATE employees SET created_at = '2026-02-25 10:25:00', updated_at = GREATEST(updated_at, '2026-02-25 10:25:00') WHERE id = 217;
UPDATE employees SET created_at = '2026-03-20 11:38:00', updated_at = GREATEST(updated_at, '2026-03-20 11:38:00') WHERE id = 218;
UPDATE employees SET created_at = '2026-04-24 12:51:00', updated_at = GREATEST(updated_at, '2026-04-24 12:51:00') WHERE id = 219;
UPDATE employees SET created_at = '2026-05-05 13:04:00', updated_at = GREATEST(updated_at, '2026-05-05 13:04:00') WHERE id = 3;
UPDATE employees SET created_at = '2024-01-29 14:17:00', updated_at = GREATEST(updated_at, '2024-01-29 14:17:00') WHERE id = 4;
UPDATE employees SET created_at = '2024-02-13 15:30:00', updated_at = GREATEST(updated_at, '2024-02-13 15:30:00') WHERE id = 14;
UPDATE employees SET created_at = '2024-03-18 16:43:00', updated_at = GREATEST(updated_at, '2024-03-18 16:43:00') WHERE id = 15;
UPDATE employees SET created_at = '2024-04-15 09:56:00', updated_at = GREATEST(updated_at, '2024-04-15 09:56:00') WHERE id = 16;
UPDATE employees SET created_at = '2024-05-14 10:09:00', updated_at = GREATEST(updated_at, '2024-05-14 10:09:00') WHERE id = 17;
UPDATE employees SET created_at = '2024-06-07 11:22:00', updated_at = GREATEST(updated_at, '2024-06-07 11:22:00') WHERE id = 18;
UPDATE employees SET created_at = '2024-07-22 12:35:00', updated_at = GREATEST(updated_at, '2024-07-22 12:35:00') WHERE id = 19;
UPDATE employees SET created_at = '2024-08-01 13:48:00', updated_at = GREATEST(updated_at, '2024-08-01 13:48:00') WHERE id = 21;
UPDATE employees SET created_at = '2024-09-12 14:01:00', updated_at = GREATEST(updated_at, '2024-09-12 14:01:00') WHERE id = 22;
UPDATE employees SET created_at = '2024-10-02 15:14:00', updated_at = GREATEST(updated_at, '2024-10-02 15:14:00') WHERE id = 23;
UPDATE employees SET created_at = '2024-11-21 16:27:00', updated_at = GREATEST(updated_at, '2024-11-21 16:27:00') WHERE id = 24;
UPDATE employees SET created_at = '2024-12-18 09:40:00', updated_at = GREATEST(updated_at, '2024-12-18 09:40:00') WHERE id = 25;
UPDATE employees SET created_at = '2025-01-15 10:53:00', updated_at = GREATEST(updated_at, '2025-01-15 10:53:00') WHERE id = 26;
UPDATE employees SET created_at = '2025-02-13 11:06:00', updated_at = GREATEST(updated_at, '2025-02-13 11:06:00') WHERE id = 27;
UPDATE employees SET created_at = '2025-03-10 12:19:00', updated_at = GREATEST(updated_at, '2025-03-10 12:19:00') WHERE id = 28;
UPDATE employees SET created_at = '2025-04-03 13:32:00', updated_at = GREATEST(updated_at, '2025-04-03 13:32:00') WHERE id = 29;
UPDATE employees SET created_at = '2026-06-02 09:00:00', updated_at = GREATEST(updated_at, '2026-06-02 09:00:00') WHERE id = 30;
UPDATE employees SET created_at = '2026-06-04 10:17:00', updated_at = GREATEST(updated_at, '2026-06-04 10:17:00') WHERE id = 31;
UPDATE employees SET created_at = '2026-06-08 11:34:00', updated_at = GREATEST(updated_at, '2026-06-08 11:34:00') WHERE id = 32;
UPDATE employees SET created_at = '2026-06-10 12:51:00', updated_at = GREATEST(updated_at, '2026-06-10 12:51:00') WHERE id = 33;
UPDATE employees SET created_at = '2026-06-12 13:08:00', updated_at = GREATEST(updated_at, '2026-06-12 13:08:00') WHERE id = 34;
UPDATE employees SET created_at = '2026-06-16 14:25:00', updated_at = GREATEST(updated_at, '2026-06-16 14:25:00') WHERE id = 35;
UPDATE employees SET created_at = '2026-06-18 15:42:00', updated_at = GREATEST(updated_at, '2026-06-18 15:42:00') WHERE id = 36;
UPDATE employees SET created_at = '2026-06-22 16:59:00', updated_at = GREATEST(updated_at, '2026-06-22 16:59:00') WHERE id = 37;
UPDATE employees SET created_at = '2026-06-24 09:16:00', updated_at = GREATEST(updated_at, '2026-06-24 09:16:00') WHERE id = 38;
UPDATE employees SET created_at = '2026-06-26 10:33:00', updated_at = GREATEST(updated_at, '2026-06-26 10:33:00') WHERE id = 39;
UPDATE employees SET created_at = '2026-06-30 11:50:00', updated_at = GREATEST(updated_at, '2026-06-30 11:50:00') WHERE id = 40;
UPDATE employees SET created_at = '2026-07-02 09:00:00', updated_at = GREATEST(updated_at, '2026-07-02 09:00:00') WHERE id = 41;
UPDATE employees SET created_at = '2026-07-06 10:17:00', updated_at = GREATEST(updated_at, '2026-07-06 10:17:00') WHERE id = 42;
UPDATE employees SET created_at = '2026-07-08 11:34:00', updated_at = GREATEST(updated_at, '2026-07-08 11:34:00') WHERE id = 43;
UPDATE employees SET created_at = '2026-07-10 12:51:00', updated_at = GREATEST(updated_at, '2026-07-10 12:51:00') WHERE id = 44;
UPDATE employees SET created_at = '2026-07-14 13:08:00', updated_at = GREATEST(updated_at, '2026-07-14 13:08:00') WHERE id = 45;
UPDATE employees SET created_at = '2026-07-16 14:25:00', updated_at = GREATEST(updated_at, '2026-07-16 14:25:00') WHERE id = 48;
UPDATE employees SET created_at = '2026-07-20 15:42:00', updated_at = GREATEST(updated_at, '2026-07-20 15:42:00') WHERE id = 52;
UPDATE employees SET created_at = '2026-07-22 16:59:00', updated_at = GREATEST(updated_at, '2026-07-22 16:59:00') WHERE id = 53;
UPDATE employees SET created_at = '2026-07-24 09:16:00', updated_at = GREATEST(updated_at, '2026-07-24 09:16:00') WHERE id = 54;
UPDATE employees SET created_at = '2026-07-28 10:33:00', updated_at = GREATEST(updated_at, '2026-07-28 10:33:00') WHERE id = 55;
UPDATE employees SET created_at = '2026-07-30 11:50:00', updated_at = GREATEST(updated_at, '2026-07-30 11:50:00') WHERE id = 56;
UPDATE employees SET created_at = '2026-07-01 12:07:00', updated_at = GREATEST(updated_at, '2026-07-01 12:07:00') WHERE id = 59;
UPDATE employees SET created_at = '2026-07-03 13:24:00', updated_at = GREATEST(updated_at, '2026-07-03 13:24:00') WHERE id = 60;
UPDATE employees SET created_at = '2026-07-07 14:41:00', updated_at = GREATEST(updated_at, '2026-07-07 14:41:00') WHERE id = 61;
UPDATE employees SET created_at = '2026-07-09 15:58:00', updated_at = GREATEST(updated_at, '2026-07-09 15:58:00') WHERE id = 63;
UPDATE employees SET created_at = '2026-07-13 16:15:00', updated_at = GREATEST(updated_at, '2026-07-13 16:15:00') WHERE id = 65;
UPDATE employees SET created_at = '2026-07-15 09:32:00', updated_at = GREATEST(updated_at, '2026-07-15 09:32:00') WHERE id = 66;
UPDATE employees SET created_at = '2026-08-04 09:00:00', updated_at = GREATEST(updated_at, '2026-08-04 09:00:00') WHERE id = 67;
UPDATE employees SET created_at = '2026-08-06 10:17:00', updated_at = GREATEST(updated_at, '2026-08-06 10:17:00') WHERE id = 68;
UPDATE employees SET created_at = '2026-08-10 11:34:00', updated_at = GREATEST(updated_at, '2026-08-10 11:34:00') WHERE id = 69;
UPDATE employees SET created_at = '2026-08-12 12:51:00', updated_at = GREATEST(updated_at, '2026-08-12 12:51:00') WHERE id = 70;
UPDATE employees SET created_at = '2026-08-14 13:08:00', updated_at = GREATEST(updated_at, '2026-08-14 13:08:00') WHERE id = 71;
UPDATE employees SET created_at = '2026-08-18 14:25:00', updated_at = GREATEST(updated_at, '2026-08-18 14:25:00') WHERE id = 72;
UPDATE employees SET created_at = '2026-08-20 15:42:00', updated_at = GREATEST(updated_at, '2026-08-20 15:42:00') WHERE id = 73;
UPDATE employees SET created_at = '2026-08-24 16:59:00', updated_at = GREATEST(updated_at, '2026-08-24 16:59:00') WHERE id = 74;
UPDATE employees SET created_at = '2026-08-26 09:16:00', updated_at = GREATEST(updated_at, '2026-08-26 09:16:00') WHERE id = 75;
UPDATE employees SET created_at = '2026-08-28 10:33:00', updated_at = GREATEST(updated_at, '2026-08-28 10:33:00') WHERE id = 76;
UPDATE employees SET created_at = '2026-08-03 11:50:00', updated_at = GREATEST(updated_at, '2026-08-03 11:50:00') WHERE id = 77;
UPDATE employees SET created_at = '2026-08-05 12:07:00', updated_at = GREATEST(updated_at, '2026-08-05 12:07:00') WHERE id = 78;
UPDATE employees SET created_at = '2026-08-07 13:24:00', updated_at = GREATEST(updated_at, '2026-08-07 13:24:00') WHERE id = 79;
UPDATE employees SET created_at = '2026-08-11 14:41:00', updated_at = GREATEST(updated_at, '2026-08-11 14:41:00') WHERE id = 80;
UPDATE employees SET created_at = '2026-08-13 15:58:00', updated_at = GREATEST(updated_at, '2026-08-13 15:58:00') WHERE id = 81;
UPDATE employees SET created_at = '2026-08-17 16:15:00', updated_at = GREATEST(updated_at, '2026-08-17 16:15:00') WHERE id = 82;
UPDATE employees SET created_at = '2026-08-19 09:32:00', updated_at = GREATEST(updated_at, '2026-08-19 09:32:00') WHERE id = 83;
UPDATE employees SET created_at = '2026-08-21 10:49:00', updated_at = GREATEST(updated_at, '2026-08-21 10:49:00') WHERE id = 84;
UPDATE employees SET created_at = '2026-08-25 11:06:00', updated_at = GREATEST(updated_at, '2026-08-25 11:06:00') WHERE id = 85;
UPDATE employees SET created_at = '2026-08-27 12:23:00', updated_at = GREATEST(updated_at, '2026-08-27 12:23:00') WHERE id = 86;
UPDATE employees SET created_at = '2026-08-31 13:40:00', updated_at = GREATEST(updated_at, '2026-08-31 13:40:00') WHERE id = 87;
UPDATE employees SET created_at = '2026-08-04 14:57:00', updated_at = GREATEST(updated_at, '2026-08-04 14:57:00') WHERE id = 91;
UPDATE employees SET created_at = '2026-08-06 15:14:00', updated_at = GREATEST(updated_at, '2026-08-06 15:14:00') WHERE id = 92;
UPDATE employees SET created_at = '2026-08-10 16:31:00', updated_at = GREATEST(updated_at, '2026-08-10 16:31:00') WHERE id = 93;
UPDATE employees SET created_at = '2026-09-02 09:00:00', updated_at = GREATEST(updated_at, '2026-09-02 09:00:00') WHERE id = 95;
UPDATE employees SET created_at = '2026-09-04 10:17:00', updated_at = GREATEST(updated_at, '2026-09-04 10:17:00') WHERE id = 96;
UPDATE employees SET created_at = '2026-09-08 11:34:00', updated_at = GREATEST(updated_at, '2026-09-08 11:34:00') WHERE id = 97;
UPDATE employees SET created_at = '2026-09-10 12:51:00', updated_at = GREATEST(updated_at, '2026-09-10 12:51:00') WHERE id = 98;
UPDATE employees SET created_at = '2026-09-14 13:08:00', updated_at = GREATEST(updated_at, '2026-09-14 13:08:00') WHERE id = 99;
UPDATE employees SET created_at = '2026-09-16 14:25:00', updated_at = GREATEST(updated_at, '2026-09-16 14:25:00') WHERE id = 100;
UPDATE employees SET created_at = '2026-09-18 15:42:00', updated_at = GREATEST(updated_at, '2026-09-18 15:42:00') WHERE id = 101;
UPDATE employees SET created_at = '2026-09-22 16:59:00', updated_at = GREATEST(updated_at, '2026-09-22 16:59:00') WHERE id = 102;
UPDATE employees SET created_at = '2026-09-24 09:16:00', updated_at = GREATEST(updated_at, '2026-09-24 09:16:00') WHERE id = 103;
UPDATE employees SET created_at = '2026-09-28 10:33:00', updated_at = GREATEST(updated_at, '2026-09-28 10:33:00') WHERE id = 104;
UPDATE employees SET created_at = '2026-09-30 11:50:00', updated_at = GREATEST(updated_at, '2026-09-30 11:50:00') WHERE id = 105;
UPDATE employees SET created_at = '2026-09-02 12:07:00', updated_at = GREATEST(updated_at, '2026-09-02 12:07:00') WHERE id = 169;
UPDATE employees SET created_at = '2026-09-04 13:24:00', updated_at = GREATEST(updated_at, '2026-09-04 13:24:00') WHERE id = 170;
UPDATE employees SET created_at = '2026-09-08 14:41:00', updated_at = GREATEST(updated_at, '2026-09-08 14:41:00') WHERE id = 171;
UPDATE employees SET created_at = '2026-09-10 15:58:00', updated_at = GREATEST(updated_at, '2026-09-10 15:58:00') WHERE id = 172;
UPDATE employees SET created_at = '2026-10-02 09:00:00', updated_at = GREATEST(updated_at, '2026-10-02 09:00:00') WHERE id = 173;
UPDATE employees SET created_at = '2026-10-06 10:17:00', updated_at = GREATEST(updated_at, '2026-10-06 10:17:00') WHERE id = 174;
UPDATE employees SET created_at = '2026-10-08 11:34:00', updated_at = GREATEST(updated_at, '2026-10-08 11:34:00') WHERE id = 175;
UPDATE employees SET created_at = '2026-10-12 12:51:00', updated_at = GREATEST(updated_at, '2026-10-12 12:51:00') WHERE id = 176;
UPDATE employees SET created_at = '2026-10-14 13:08:00', updated_at = GREATEST(updated_at, '2026-10-14 13:08:00') WHERE id = 177;
UPDATE employees SET created_at = '2026-10-16 14:25:00', updated_at = GREATEST(updated_at, '2026-10-16 14:25:00') WHERE id = 178;
UPDATE employees SET created_at = '2026-10-20 15:42:00', updated_at = GREATEST(updated_at, '2026-10-20 15:42:00') WHERE id = 179;
UPDATE employees SET created_at = '2026-10-22 16:59:00', updated_at = GREATEST(updated_at, '2026-10-22 16:59:00') WHERE id = 180;
UPDATE employees SET created_at = '2026-10-26 09:16:00', updated_at = GREATEST(updated_at, '2026-10-26 09:16:00') WHERE id = 181;
UPDATE employees SET created_at = '2026-10-28 10:33:00', updated_at = GREATEST(updated_at, '2026-10-28 10:33:00') WHERE id = 182;
UPDATE employees SET created_at = '2026-10-30 11:50:00', updated_at = GREATEST(updated_at, '2026-10-30 11:50:00') WHERE id = 184;
UPDATE employees SET created_at = '2026-10-02 12:07:00', updated_at = GREATEST(updated_at, '2026-10-02 12:07:00') WHERE id = 185;
UPDATE employees SET created_at = '2026-10-06 13:24:00', updated_at = GREATEST(updated_at, '2026-10-06 13:24:00') WHERE id = 186;
UPDATE employees SET created_at = '2026-10-08 14:41:00', updated_at = GREATEST(updated_at, '2026-10-08 14:41:00') WHERE id = 187;
UPDATE employees SET created_at = '2026-10-12 15:58:00', updated_at = GREATEST(updated_at, '2026-10-12 15:58:00') WHERE id = 191;
UPDATE employees SET created_at = '2026-10-14 16:15:00', updated_at = GREATEST(updated_at, '2026-10-14 16:15:00') WHERE id = 193;
UPDATE employees SET created_at = '2026-10-16 09:32:00', updated_at = GREATEST(updated_at, '2026-10-16 09:32:00') WHERE id = 194;
UPDATE employees SET created_at = '2026-10-20 10:49:00', updated_at = GREATEST(updated_at, '2026-10-20 10:49:00') WHERE id = 195;
UPDATE employees SET created_at = '2026-10-22 11:06:00', updated_at = GREATEST(updated_at, '2026-10-22 11:06:00') WHERE id = 196;
UPDATE employees SET created_at = '2026-10-26 12:23:00', updated_at = GREATEST(updated_at, '2026-10-26 12:23:00') WHERE id = 197;
UPDATE employees SET created_at = '2026-10-28 13:40:00', updated_at = GREATEST(updated_at, '2026-10-28 13:40:00') WHERE id = 198;
UPDATE employees SET created_at = '2026-10-30 14:57:00', updated_at = GREATEST(updated_at, '2026-10-30 14:57:00') WHERE id = 200;
UPDATE employees SET created_at = '2026-10-02 15:14:00', updated_at = GREATEST(updated_at, '2026-10-02 15:14:00') WHERE id = 201;
UPDATE employees SET created_at = '2026-10-06 16:31:00', updated_at = GREATEST(updated_at, '2026-10-06 16:31:00') WHERE id = 202;
UPDATE employees SET created_at = '2026-10-08 09:48:00', updated_at = GREATEST(updated_at, '2026-10-08 09:48:00') WHERE id = 204;
UPDATE employees SET created_at = '2026-10-12 10:05:00', updated_at = GREATEST(updated_at, '2026-10-12 10:05:00') WHERE id = 205;
UPDATE employees SET created_at = '2026-11-03 09:00:00', updated_at = GREATEST(updated_at, '2026-11-03 09:00:00') WHERE id = 206;
UPDATE employees SET created_at = '2026-11-05 10:17:00', updated_at = GREATEST(updated_at, '2026-11-05 10:17:00') WHERE id = 207;
UPDATE employees SET created_at = '2026-11-09 11:34:00', updated_at = GREATEST(updated_at, '2026-11-09 11:34:00') WHERE id = 208;
UPDATE employees SET created_at = '2026-11-11 12:51:00', updated_at = GREATEST(updated_at, '2026-11-11 12:51:00') WHERE id = 209;
UPDATE employees SET created_at = '2026-11-03 13:08:00', updated_at = GREATEST(updated_at, '2026-11-03 13:08:00') WHERE id = 210;
UPDATE employees SET created_at = '2026-11-05 14:25:00', updated_at = GREATEST(updated_at, '2026-11-05 14:25:00') WHERE id = 211;
UPDATE employees SET created_at = '2026-11-09 15:42:00', updated_at = GREATEST(updated_at, '2026-11-09 15:42:00') WHERE id = 213;
UPDATE employees SET created_at = '2026-11-11 16:59:00', updated_at = GREATEST(updated_at, '2026-11-11 16:59:00') WHERE id = 214;
UPDATE employees SET created_at = '2026-11-03 09:16:00', updated_at = GREATEST(updated_at, '2026-11-03 09:16:00') WHERE id = 215;
UPDATE employees SET created_at = '2026-11-05 10:33:00', updated_at = GREATEST(updated_at, '2026-11-05 10:33:00') WHERE id = 216;
UPDATE employees SET created_at = '2026-11-09 11:50:00', updated_at = GREATEST(updated_at, '2026-11-09 11:50:00') WHERE id = 275;
UPDATE employees SET created_at = '2026-11-11 12:07:00', updated_at = GREATEST(updated_at, '2026-11-11 12:07:00') WHERE id = 276;
UPDATE employees SET created_at = '2026-11-03 13:24:00', updated_at = GREATEST(updated_at, '2026-11-03 13:24:00') WHERE id = 277;
UPDATE employees SET created_at = '2026-11-05 14:41:00', updated_at = GREATEST(updated_at, '2026-11-05 14:41:00') WHERE id = 278;
UPDATE employees SET created_at = '2026-11-09 15:58:00', updated_at = GREATEST(updated_at, '2026-11-09 15:58:00') WHERE id = 279;
UPDATE employees SET created_at = '2026-11-11 16:15:00', updated_at = GREATEST(updated_at, '2026-11-11 16:15:00') WHERE id = 280;
UPDATE employees SET created_at = '2026-11-03 09:32:00', updated_at = GREATEST(updated_at, '2026-11-03 09:32:00') WHERE id = 290;
UPDATE employees SET created_at = '2026-11-05 10:49:00', updated_at = GREATEST(updated_at, '2026-11-05 10:49:00') WHERE id = 291;
UPDATE employees SET created_at = '2025-04-01 10:30:00', updated_at = GREATEST(updated_at, '2025-04-01 10:30:00') WHERE id = 12;
UPDATE employees SET created_at = '2025-06-03 10:30:00', updated_at = GREATEST(updated_at, '2025-06-03 10:30:00') WHERE id = 13;
UPDATE employees SET created_at = '2025-08-05 10:30:00', updated_at = GREATEST(updated_at, '2025-08-05 10:30:00') WHERE id = 287;
UPDATE employees SET created_at = '2025-10-06 10:30:00', updated_at = GREATEST(updated_at, '2025-10-06 10:30:00') WHERE id = 288;
UPDATE employees SET created_at = '2025-12-05 10:30:00', updated_at = GREATEST(updated_at, '2025-12-05 10:30:00') WHERE id = 289;

-- 3. Consistency: Remove pre-hire attendance records (cannot work before being hired)
DELETE a FROM attendance a
JOIN employees e ON a.employee_id = e.id
WHERE a.date < DATE(e.created_at);

-- 4. Consistency: Align user account creation date if it preceded the employee hire date
UPDATE users u
JOIN employees e ON u.employee_id = e.id
SET u.created_at = e.created_at
WHERE u.created_at < e.created_at;

-- 5. Consistency: Align audit log timestamps if employee creation logs were earlier
UPDATE audit_logs a
JOIN employees e ON a.entity_id = e.id AND a.entity_type = 'EMPLOYEE'
SET a.created_at = e.created_at
WHERE a.action = 'CREATE' AND a.created_at < e.created_at;

-- 6. Verification Queries:
-- SELECT YEAR(created_at) as hireYear, MONTH(created_at) as hireMonth, COUNT(*) as count
-- FROM employees WHERE deleted_at IS NULL GROUP BY hireYear, hireMonth ORDER BY hireYear DESC, hireMonth DESC;
