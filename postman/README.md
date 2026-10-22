# Postman Collection & Environment Guide

This folder contains the complete API testing suite for the **Employee Management System (EMS)**.

## Files Included

1. **`Employee_Management_System.postman_collection.json`**
   - OpenAPI 3.0-compliant Postman Collection (v2.1.0 format).
   - Contains 26 organized requests across 6 feature categories:
     - **Authentication & Session**: Registration, login, validation, session `/me`, CSRF defense, logout.
     - **Employee Directory & CRUD**: Paginated listings, creation, detail inspection, updates, contact updates, soft-deletion, restore, CSV & Excel exports.
     - **Role-Based Access Control (RBAC)**: Unauthorized (401) and Forbidden (403) scenarios verifying role boundaries.
     - **Departments Management**: Department CRUD and uniqueness checks.
     - **Dashboard & Audit Logs**: High-level metrics and immutable audit history.
     - **Notifications**: Fetching alerts, unread counts, and marking notifications as read.
   - Built-in test scripts verifying HTTP status codes and automatically saving variables.

2. **`Employee_Management_System.postman_environment.json`**
   - Pre-configured environment variables:
     - `baseUrl`: `http://localhost:5000/api`
     - `adminEmail`: `admin@ems.local`
     - `adminPassword`: `Password@123`
     - `employeeEmail`: `employee@ems.local`
     - `employeePassword`: `Password@123`
     - `csrfToken`: Captured automatically from responses.
     - `newEmployeeId`: Dynamically populated when an employee is created.
     - `newDepartmentId`: Dynamically populated when a department is created.

---

## How to Import & Run in Postman

1. **Import Files into Postman**:
   - Open Postman.
   - Click the **Import** button in the top left.
   - Drag and drop both `Employee_Management_System.postman_collection.json` and `Employee_Management_System.postman_environment.json`.
2. **Select the Environment**:
   - In the top right environment dropdown, choose **Employee Management System (Local)**.
3. **Cookie Jar Support**:
   - The EMS backend uses `HttpOnly` secure session cookies (`access_token`).
   - Postman's desktop app automatically manages cookies across requests to `http://localhost:5000`.
4. **Execute Requests**:
   - Run **Login as Admin** first to establish an authenticated admin session and capture the CSRF token.
   - Run any of the employee or department requests.
   - Run the **Role-Based Permissions** folder to verify that 401 and 403 status codes are correctly enforced for unauthorized actions.

---

## Running with Newman (CLI)

You can run this collection directly in CI/CD or the terminal via Newman:

```bash
npx newman run postman/Employee_Management_System.postman_collection.json \
  -e postman/Employee_Management_System.postman_environment.json
```
