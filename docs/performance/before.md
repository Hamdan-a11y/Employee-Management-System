# Attendance Performance Benchmark Report: BEFORE

- **Date**: 2026-11-20T12:26:41.949Z
- **Database**: `employee_test_db` (1,000,000+ attendance records)
- **Iterations per query**: 5

## Summary Table

| Query | Mean (ms) | Min (ms) | Max (ms) | Rows |
|---|---|---|---|---|
| **Attendance List (Filters + Pagination)** | `113.25 ms` | 72.56 ms | 248.4 ms | 50 |
| **Monthly Report Aggregation** | `1479.62 ms` | 1334.91 ms | 1856.99 ms | 995 |
| **Department Attendance %** | `3436.06 ms` | 2593.82 ms | 4536.7 ms | 27 |
| **Punctuality Ranking** | `3911.25 ms` | 3234.64 ms | 4732.74 ms | 10 |
| **Absenteeism Trend** | `1558.27 ms` | 1302.45 ms | 2215.13 ms | 36 |
| **Dashboard Stats** | `7.76 ms` | 6.78 ms | 8.66 ms | 1 |

---

## Detailed Execution Plans (EXPLAIN ANALYZE)

### Attendance List (Filters + Pagination)
> Filter by date range, department, status with OFFSET 1000 LIMIT 50

```
-> Limit/Offset: 50/1000 row(s)  (actual time=997..997 rows=50 loops=1)
    -> Sort: a.`date` DESC, a.id DESC, limit input to 1050 row(s) per chunk  (actual time=996..997 rows=1050 loops=1)
        -> Stream results  (cost=118605 rows=31624) (actual time=7.28..950 rows=22980 loops=1)
            -> Nested loop inner join  (cost=118605 rows=31624) (actual time=7.23..815 rows=22980 loops=1)
                -> Nested loop left join  (cost=66.1 rows=173) (actual time=4.07..10.7 rows=173 loops=1)
                    -> Index lookup on e using idx_emp_department (department_id=2)  (cost=47.8 rows=173) (actual time=3..9.18 rows=173 loops=1)
                    -> Constant row from d  (cost=0.00636..0.00636 rows=1) (actual time=0.00717..0.00747 rows=1 loops=173)
                -> Filter: (a.`status` = 'Present')  (cost=576 rows=183) (actual time=1.62..4.63 rows=133 loops=173)
                    -> Index lookup on a using unique_emp_attendance_date (employee_id=e.id), with index condition: (a.`date` between '2024-01-01' and '2024-06-30')  (cost=576 rows=1088) (actual time=1.58..4.56 rows=182 loops=173)
```

### Monthly Report Aggregation
> Aggregates attendance metrics per employee for a calendar month

```
-> Sort: e.`name`  (actual time=2290..2290 rows=995 loops=1)
    -> Table scan on <temporary>  (actual time=2288..2289 rows=995 loops=1)
        -> Aggregate using temporary table  (actual time=2288..2288 rows=995 loops=1)
            -> Nested loop left join  (cost=631516 rows=1.08e+6) (actual time=1.18..2089 rows=30845 loops=1)
                -> Nested loop left join  (cost=451 rows=995) (actual time=0.187..11.6 rows=995 loops=1)
                    -> Filter: (e.deleted_at is null)  (cost=103 rows=995) (actual time=0.17..4.01 rows=995 loops=1)
                        -> Table scan on e  (cost=103 rows=1000) (actual time=0.168..2.62 rows=1000 loops=1)
                    -> Single-row index lookup on d using PRIMARY (id=e.department_id)  (cost=0.25 rows=1) (actual time=0.00663..0.0068 rows=1 loops=995)
                -> Index lookup on a using unique_emp_attendance_date (employee_id=e.id), with index condition: <if>(is_not_null_compl(a), (a.`date` between '2024-03-01' and '2024-03-31'), true)  (cost=526 rows=1088) (actual time=2.07..2.08 rows=31 loops=995)
```

### Department Attendance %
> Calculates present employee counts grouped by department over 6 months

```
-> Table scan on <temporary>  (actual time=3363..3363 rows=27 loops=1)
    -> Aggregate using temporary table  (actual time=3363..3363 rows=27 loops=1)
        -> Nested loop inner join  (cost=199010 rows=247024) (actual time=947..3272 rows=167440 loops=1)
            -> Filter: ((a.`date` between '2024-01-01' and '2024-06-30') and (a.`status` <> 'Absent') and (a.check_in is not null))  (cost=112551 rows=247024) (actual time=947..3160 rows=167440 loops=1)
                -> Table scan on a  (cost=112551 rows=1.09e+6) (actual time=17..2231 rows=1.1e+6 loops=1)
            -> Single-row index lookup on e using PRIMARY (id=a.employee_id)  (cost=0.25 rows=1) (actual time=339e-6..386e-6 rows=1 loops=167440)
```

### Punctuality Ranking
> Calculates on-time percentage and ranks employees using RANK() OVER window function

```
-> Filter: (ranked_top.rk <= 10)  (cost=0.338..27793 rows=82333) (actual time=5156..5157 rows=10 loops=1)
    -> Table scan on ranked_top  (cost=2.5..2.5 rows=0) (actual time=5156..5157 rows=1000 loops=1)
        -> Materialize CTE ranked_top  (cost=0..0 rows=0) (actual time=5156..5156 rows=1000 loops=1)
            -> Window aggregate: rank() OVER (ORDER BY emp_stats.punctuality_pct desc,emp_stats.days_present desc )   (cost=0 rows=0) (actual time=5153..5154 rows=1000 loops=1)
                -> Sort: emp_stats.punctuality_pct DESC, emp_stats.days_present DESC  (cost=2.6..2.6 rows=0) (actual time=5152..5153 rows=1000 loops=1)
                    -> Table scan on emp_stats  (cost=2.5..2.5 rows=0) (actual time=5151..5151 rows=1000 loops=1)
                        -> Materialize CTE emp_stats  (cost=0..0 rows=0) (actual time=5151..5151 rows=1000 loops=1)
                            -> Filter: (days_present >= 5)  (actual time=5148..5149 rows=1000 loops=1)
                                -> Table scan on <temporary>  (actual time=5148..5149 rows=1000 loops=1)
                                    -> Aggregate using temporary table  (actual time=5148..5148 rows=1000 loops=1)
                                        -> Nested loop left join  (cost=284460 rows=247024) (actual time=1197..4498 rows=167440 loops=1)
                                            -> Nested loop inner join  (cost=198002 rows=247024) (actual time=1197..4353 rows=167440 loops=1)
                                                -> Filter: ((a.`date` between '2024-01-01' and '2024-06-30') and (a.`status` <> 'Absent') and (a.check_in is not null))  (cost=111543 rows=247024) (actual time=1197..4195 rows=167440 loops=1)
                                                    -> Table scan on a  (cost=111543 rows=1.09e+6) (actual time=10.8..2984 rows=1.1e+6 loops=1)
                                                -> Single-row index lookup on e using PRIMARY (id=a.employee_id)  (cost=0.25 rows=1) (actual time=495e-6..565e-6 rows=1 loops=167440)
                                            -> Single-row index lookup on d using PRIMARY (id=e.department_id)  (cost=0.25 rows=1) (actual time=390e-6..502e-6 rows=1 loops=167440)
```

### Absenteeism Trend
> Monthly absent days across 3 years with month-over-month lag delta using LAG()

```
-> Sort: with_lag.`month`  (cost=2.6..2.6 rows=0) (actual time=1418..1418 rows=36 loops=1)
    -> Table scan on with_lag  (cost=2.5..2.5 rows=0) (actual time=1418..1418 rows=36 loops=1)
        -> Materialize CTE with_lag  (cost=0..0 rows=0) (actual time=1418..1418 rows=36 loops=1)
            -> Window aggregate with buffering: lag(monthly_absences.absent_days,1,0) OVER (ORDER BY monthly_absences.`month` )   (cost=0 rows=0) (actual time=1418..1418 rows=36 loops=1)
                -> Table scan on <temporary>  (cost=2.5..2.5 rows=0) (actual time=1418..1418 rows=36 loops=1)
                    -> Temporary table  (cost=0..0 rows=0) (actual time=1418..1418 rows=36 loops=1)
                        -> Window aggregate with buffering: lag(monthly_absences.absent_days,1,0) OVER (ORDER BY monthly_absences.`month` )   (cost=0 rows=0) (actual time=1418..1418 rows=36 loops=1)
                            -> Sort: monthly_absences.`month`  (cost=2.6..2.6 rows=0) (actual time=1418..1418 rows=36 loops=1)
                                -> Table scan on monthly_absences  (cost=2.5..2.5 rows=0) (actual time=1418..1418 rows=36 loops=1)
                                    -> Materialize CTE monthly_absences  (cost=0..0 rows=0) (actual time=1418..1418 rows=36 loops=1)
                                        -> Table scan on <temporary>  (actual time=1418..1418 rows=36 loops=1)
                                            -> Aggregate using temporary table  (actual time=1418..1418 rows=36 loops=1)
                                                -> Nested loop inner join  (cost=43539 rows=79298) (actual time=87.8..1330 rows=87680 loops=1)
                                                    -> Filter: (a.`date` between '2023-01-01' and '2025-12-31')  (cost=15784 rows=79298) (actual time=87.8..1261 rows=87680 loops=1)
                                                        -> Index lookup on a using idx_attendance_status (status='Absent'), with index condition: (a.`status` = 'Absent')  (cost=15784 rows=158596) (actual time=87.8..1194 rows=87680 loops=1)
                                                    -> Single-row covering index lookup on e using PRIMARY (id=a.employee_id)  (cost=0.25 rows=1) (actual time=520e-6..562e-6 rows=1 loops=87680)
```

### Dashboard Stats
> Live counts for active employees, present, late, absent, and missing checkouts

```
-> Rows fetched before execution  (cost=0..0 rows=1) (actual time=400e-6..500e-6 rows=1 loops=1)
-> Select #2 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=153 rows=1) (actual time=0.9..0.9 rows=1 loops=1)
        -> Filter: ((employees.`status` = 'Active') and (employees.deleted_at is null))  (cost=103 rows=498) (actual time=0.0576..0.838 rows=981 loops=1)
            -> Table scan on employees  (cost=103 rows=1000) (actual time=0.0519..0.577 rows=1000 loops=1)
-> Select #3 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=148 rows=1) (actual time=0.694..0.694 rows=1 loops=1)
        -> Filter: (attendance.`status` = 'Present')  (cost=74.8 rows=730) (actual time=0.0678..0.635 rows=730 loops=1)
            -> Covering index lookup on attendance using idx_att_date_status (date=DATE'2024-03-15', status='Present')  (cost=74.8 rows=730) (actual time=0.062..0.411 rows=730 loops=1)
-> Select #4 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=31.1 rows=1) (actual time=0.563..0.563 rows=1 loops=1)
        -> Covering index lookup on attendance using idx_att_date_is_late (date=DATE'2024-03-15', is_late=1)  (cost=16.1 rows=150) (actual time=0.529..0.551 rows=150 loops=1)
-> Select #5 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=17.1 rows=1) (actual time=0.0676..0.0676 rows=1 loops=1)
        -> Filter: (attendance.`status` = 'Absent')  (cost=9.07 rows=80) (actual time=0.0341..0.0621 rows=80 loops=1)
            -> Covering index lookup on attendance using idx_att_date_status (date=DATE'2024-03-15', status='Absent')  (cost=9.07 rows=80) (actual time=0.0323..0.0431 rows=80 loops=1)
-> Select #6 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=404 rows=1) (actual time=4.73..4.73 rows=1 loops=1)
        -> Filter: (attendance.is_missing_checkout = 1)  (cost=394 rows=100) (actual time=0.724..4.72 rows=30 loops=1)
            -> Index lookup on attendance using idx_attendance_date (date=DATE'2024-03-15')  (cost=394 rows=1000) (actual time=0.716..4.65 rows=1000 loops=1)
```

