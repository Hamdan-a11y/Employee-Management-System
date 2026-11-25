# Attendance Performance Benchmark Report: AFTER

- **Date**: 2026-11-20T12:35:08.799Z
- **Database**: `employee_test_db` (1,000,000+ attendance records)
- **Iterations per query**: 5

## Summary Table

| Query | Mean (ms) | Min (ms) | Max (ms) | Rows |
|---|---|---|---|---|
| **Attendance List (Filters + Pagination)** | `97.12 ms` | 82.79 ms | 127.47 ms | 50 |
| **Monthly Report Aggregation** | `2041.2 ms` | 1356.53 ms | 3763.28 ms | 995 |
| **Department Attendance %** | `1049.12 ms` | 957.74 ms | 1371.6 ms | 27 |
| **Punctuality Ranking** | `2967.33 ms` | 2597.21 ms | 3814.55 ms | 10 |
| **Absenteeism Trend** | `1348.02 ms` | 982.78 ms | 2144.73 ms | 36 |
| **Dashboard Stats** | `3.45 ms` | 2.76 ms | 4.48 ms | 1 |

---

## Detailed Execution Plans (EXPLAIN ANALYZE)

### Attendance List (Filters + Pagination)
> Filter by date range, department, status with OFFSET 1000 LIMIT 50

```
-> Limit/Offset: 50/1000 row(s)  (cost=98767 rows=50) (actual time=480..482 rows=50 loops=1)
    -> Nested loop left join  (cost=98767 rows=31656) (actual time=4.82..482 rows=1050 loops=1)
        -> Nested loop inner join  (cost=95601 rows=31656) (actual time=3.87..481 rows=1050 loops=1)
            -> Filter: (a.`status` = 'Present')  (cost=31558 rows=182981) (actual time=2.02..454 rows=6154 loops=1)
                -> Index range scan on a using idx_attendance_date over ('2024-01-01' <= date <= '2024-06-30') (reverse), with index condition: (a.`date` between '2024-01-01' and '2024-06-30')  (cost=31558 rows=365962) (actual time=1.83..451 rows=8428 loops=1)
            -> Filter: (e.department_id = 2)  (cost=0.25 rows=0.173) (actual time=0.00404..0.00407 rows=0.171 loops=6154)
                -> Single-row index lookup on e using PRIMARY (id=a.employee_id)  (cost=0.25 rows=1) (actual time=0.00368..0.00372 rows=1 loops=6154)
        -> Constant row from d  (cost=8.62e-6..8.62e-6 rows=1) (actual time=0.00107..0.00111 rows=1 loops=1050)
```

### Monthly Report Aggregation
> Aggregates attendance metrics per employee for a calendar month

```
-> Sort: e.`name`  (actual time=2811..2811 rows=995 loops=1)
    -> Table scan on <temporary>  (actual time=2808..2809 rows=995 loops=1)
        -> Aggregate using temporary table  (actual time=2808..2808 rows=995 loops=1)
            -> Nested loop left join  (cost=744240 rows=1.08e+6) (actual time=6.24..2622 rows=30845 loops=1)
                -> Nested loop left join  (cost=451 rows=995) (actual time=0.207..10.5 rows=995 loops=1)
                    -> Filter: (e.deleted_at is null)  (cost=103 rows=995) (actual time=0.191..3.48 rows=995 loops=1)
                        -> Table scan on e  (cost=103 rows=1000) (actual time=0.19..2.64 rows=1000 loops=1)
                    -> Single-row index lookup on d using PRIMARY (id=e.department_id)  (cost=0.25 rows=1) (actual time=0.00594..0.00614 rows=1 loops=995)
                -> Index lookup on a using unique_emp_attendance_date (employee_id=e.id), with index condition: <if>(is_not_null_compl(a), (a.`date` between '2024-03-01' and '2024-03-31'), true)  (cost=639 rows=1088) (actual time=2.61..2.62 rows=31 loops=995)
```

### Department Attendance %
> Calculates present employee counts grouped by department over 6 months

```
-> Table scan on <temporary>  (actual time=1713..1713 rows=27 loops=1)
    -> Aggregate using temporary table  (actual time=1713..1713 rows=27 loops=1)
        -> Nested loop inner join  (cost=155695 rows=239630) (actual time=4.02..1568 rows=167440 loops=1)
            -> Filter: ((a.`date` between '2024-01-01' and '2024-06-30') and (a.`status` <> 'Absent') and (a.check_in is not null))  (cost=71824 rows=239630) (actual time=3.98..721 rows=167440 loops=1)
                -> Covering index range scan on a using idx_att_perf_date_chk_stat_emp over ('2024-01-01' <= date <= '2024-06-30' AND NULL < check_in)  (cost=71824 rows=355008) (actual time=3.97..448 rows=181920 loops=1)
            -> Single-row index lookup on e using PRIMARY (id=a.employee_id)  (cost=0.25 rows=1) (actual time=0.00464..0.00474 rows=1 loops=167440)
```

### Punctuality Ranking
> Calculates on-time percentage and ranks employees using RANK() OVER window function

```
-> Filter: (ranked_top.rk <= 10)  (cost=0.338..27793 rows=82333) (actual time=3447..3447 rows=10 loops=1)
    -> Table scan on ranked_top  (cost=2.5..2.5 rows=0) (actual time=3447..3447 rows=1000 loops=1)
        -> Materialize CTE ranked_top  (cost=0..0 rows=0) (actual time=3447..3447 rows=1000 loops=1)
            -> Window aggregate: rank() OVER (ORDER BY emp_stats.punctuality_pct desc,emp_stats.days_present desc )   (cost=0 rows=0) (actual time=3445..3446 rows=1000 loops=1)
                -> Sort: emp_stats.punctuality_pct DESC, emp_stats.days_present DESC  (cost=2.6..2.6 rows=0) (actual time=3445..3445 rows=1000 loops=1)
                    -> Table scan on emp_stats  (cost=2.5..2.5 rows=0) (actual time=3443..3444 rows=1000 loops=1)
                        -> Materialize CTE emp_stats  (cost=0..0 rows=0) (actual time=3443..3443 rows=1000 loops=1)
                            -> Filter: (days_present >= 5)  (actual time=3441..3441 rows=1000 loops=1)
                                -> Table scan on <temporary>  (actual time=3440..3441 rows=1000 loops=1)
                                    -> Aggregate using temporary table  (actual time=3440..3440 rows=1000 loops=1)
                                        -> Nested loop left join  (cost=287171 rows=247024) (actual time=1006..2998 rows=167440 loops=1)
                                            -> Nested loop inner join  (cost=200713 rows=247024) (actual time=1006..2912 rows=167440 loops=1)
                                                -> Filter: ((a.`date` between '2024-01-01' and '2024-06-30') and (a.`status` <> 'Absent') and (a.check_in is not null))  (cost=114254 rows=247024) (actual time=1006..2816 rows=167440 loops=1)
                                                    -> Table scan on a  (cost=114254 rows=1.09e+6) (actual time=9.6..1919 rows=1.1e+6 loops=1)
                                                -> Single-row index lookup on e using PRIMARY (id=a.employee_id)  (cost=0.25 rows=1) (actual time=300e-6..340e-6 rows=1 loops=167440)
                                            -> Single-row index lookup on d using PRIMARY (id=e.department_id)  (cost=0.25 rows=1) (actual time=221e-6..261e-6 rows=1 loops=167440)
```

### Absenteeism Trend
> Monthly absent days across 3 years with month-over-month lag delta using LAG()

```
-> Sort: with_lag.`month`  (cost=2.6..2.6 rows=0) (actual time=1039..1039 rows=36 loops=1)
    -> Table scan on with_lag  (cost=2.5..2.5 rows=0) (actual time=1039..1039 rows=36 loops=1)
        -> Materialize CTE with_lag  (cost=0..0 rows=0) (actual time=1039..1039 rows=36 loops=1)
            -> Window aggregate with buffering: lag(monthly_absences.absent_days,1,0) OVER (ORDER BY monthly_absences.`month` )   (cost=0 rows=0) (actual time=1039..1039 rows=36 loops=1)
                -> Table scan on <temporary>  (cost=2.5..2.5 rows=0) (actual time=1039..1039 rows=36 loops=1)
                    -> Temporary table  (cost=0..0 rows=0) (actual time=1039..1039 rows=36 loops=1)
                        -> Window aggregate with buffering: lag(monthly_absences.absent_days,1,0) OVER (ORDER BY monthly_absences.`month` )   (cost=0 rows=0) (actual time=1039..1039 rows=36 loops=1)
                            -> Sort: monthly_absences.`month`  (cost=2.6..2.6 rows=0) (actual time=1039..1039 rows=36 loops=1)
                                -> Table scan on monthly_absences  (cost=2.5..2.5 rows=0) (actual time=1039..1039 rows=36 loops=1)
                                    -> Materialize CTE monthly_absences  (cost=0..0 rows=0) (actual time=1039..1039 rows=36 loops=1)
                                        -> Table scan on <temporary>  (actual time=1039..1039 rows=36 loops=1)
                                            -> Aggregate using temporary table  (actual time=1039..1039 rows=36 loops=1)
                                                -> Nested loop inner join  (cost=46970 rows=79298) (actual time=51.8..948 rows=87680 loops=1)
                                                    -> Filter: (a.`date` between '2023-01-01' and '2025-12-31')  (cost=19215 rows=79298) (actual time=51.8..877 rows=87680 loops=1)
                                                        -> Index lookup on a using idx_attendance_status (status='Absent'), with index condition: (a.`status` = 'Absent')  (cost=19215 rows=158596) (actual time=51.8..808 rows=87680 loops=1)
                                                    -> Single-row covering index lookup on e using PRIMARY (id=a.employee_id)  (cost=0.25 rows=1) (actual time=530e-6..573e-6 rows=1 loops=87680)
```

### Dashboard Stats
> Live counts for active employees, present, late, absent, and missing checkouts

```
-> Rows fetched before execution  (cost=0..0 rows=1) (actual time=600e-6..700e-6 rows=1 loops=1)
-> Select #2 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=153 rows=1) (actual time=1.74..1.74 rows=1 loops=1)
        -> Filter: ((employees.`status` = 'Active') and (employees.deleted_at is null))  (cost=103 rows=498) (actual time=0.0432..1.59 rows=981 loops=1)
            -> Table scan on employees  (cost=103 rows=1000) (actual time=0.0404..0.995 rows=1000 loops=1)
-> Select #3 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=148 rows=1) (actual time=1.09..1.09 rows=1 loops=1)
        -> Filter: (attendance.`status` = 'Present')  (cost=74.8 rows=730) (actual time=0.11..1.01 rows=730 loops=1)
            -> Covering index lookup on attendance using idx_att_date_status (date=DATE'2024-03-15', status='Present')  (cost=74.8 rows=730) (actual time=0.106..0.666 rows=730 loops=1)
-> Select #4 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=31.1 rows=1) (actual time=0.192..0.192 rows=1 loops=1)
        -> Covering index lookup on attendance using idx_att_date_is_late (date=DATE'2024-03-15', is_late=1)  (cost=16.1 rows=150) (actual time=0.157..0.181 rows=150 loops=1)
-> Select #5 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=17.1 rows=1) (actual time=0.0635..0.0635 rows=1 loops=1)
        -> Filter: (attendance.`status` = 'Absent')  (cost=9.07 rows=80) (actual time=0.0344..0.058 rows=80 loops=1)
            -> Covering index lookup on attendance using idx_att_date_status (date=DATE'2024-03-15', status='Absent')  (cost=9.07 rows=80) (actual time=0.0329..0.0426 rows=80 loops=1)
-> Select #6 (subquery in projection; run only once)
    -> Aggregate: count(0)  (cost=7.03 rows=1) (actual time=0.0345..0.0345 rows=1 loops=1)
        -> Covering index lookup on attendance using idx_att_perf_date_missing (date=DATE'2024-03-15', is_missing_checkout=1)  (cost=4.03 rows=30) (actual time=0.0205..0.0317 rows=30 loops=1)
```

