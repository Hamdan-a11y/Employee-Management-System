# Attendance Performance Optimization Comparison

Comparison between baseline (**before** optimization) and indexed/optimized execution (**after** optimization).

- **Database**: `employee_test_db` (1,096,000 attendance records)
- **Date**: 2026-11-20T12:35:08.826Z

## Query Execution Time Comparison

| Query | Before (ms) | After (ms) | % Gain |
|---|---|---|---|
| **Attendance List (Filters + Pagination)** | `113.25 ms` | `97.12 ms` | **+14.2%** |
| **Monthly Report Aggregation** | `1479.62 ms` | `2041.2 ms` | **-38%** |
| **Department Attendance %** | `3436.06 ms` | `1049.12 ms` | **+69.5%** |
| **Punctuality Ranking** | `3911.25 ms` | `2967.33 ms` | **+24.1%** |
| **Absenteeism Trend** | `1558.27 ms` | `1348.02 ms` | **+13.5%** |
| **Dashboard Stats** | `7.76 ms` | `3.45 ms` | **+55.5%** |

## Load Test Results (50 Concurrent Users, 30s Duration)

Benchmarked against `employee_test_db` (1,000,000+ attendance records) with 50 concurrent simulated users.

| Scenario / Endpoint | Requests / Sec | p95 Latency (ms) | Error Rate (%) |
|---|---|---|---|
| **Attendance List** (`/api/attendance/history?limit=20`) | `1.8 req/s` | `9150 ms` | `100%` |
| **Dashboard Stats** (`/api/dashboard/stats`) | `169.5 req/s` | `1645 ms` | `1.1%` |
| **Analytics (Department Attendance)** (`/api/analytics/department-attendance?start_month=2024-01&end_month=2024-06`) | `0 req/s` | `0 ms` | `100%` |
