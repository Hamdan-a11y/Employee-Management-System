const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Employee Management System API',
    version: '1.0.0',
    description: `
### Overview
Comprehensive RESTful API for the **Employee Management System**.

Provides full-featured endpoints for:
- **Authentication & RBAC**: Dual-token authentication (JWT access token + rotating refresh token), CSRF protection, and role-based access control (Admin & Employee).
- **Employee Directory**: Full CRUD, search, department filtering, profile management, and contact updates.
- **Soft Delete & Restoration**: Safe employee archival with complete data preservation and instant restoration.
- **Document & Avatar Vault**: Secure file uploads with MIME validation, size enforcement, and authenticated streaming.
- **Department Management**: Organizational structure management and staff allocation metrics.
- **Interactive Dashboard**: Real-time KPI summaries, active/inactive employee breakdowns, and hiring trends.
- **Audit Logs**: Immutable activity trails tracking operations, users, timestamps, and IP addresses.
- **Notification System**: In-app feedback, unread counters, event alerts, and email notifications.

### Authentication
Endpoints require an **Authorization** header with a Bearer token or HttpOnly session cookies:
\`\`\`http
Authorization: Bearer <access_token>
X-CSRF-Token: <csrf_token> (for state-changing requests like POST, PUT, PATCH, DELETE)
\`\`\`
    `,
    contact: {
      name: 'System Support & Engineering',
      email: 'admin@company.com'
    }
  },
  servers: [
    {
      url: 'http://localhost:5000/api',
      description: 'Local Development Server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT access token. Format: `Bearer <token>`'
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'accessToken',
        description: 'HttpOnly cookie containing the signed session JWT'
      },
      csrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'x-csrf-token',
        description: 'Anti-CSRF token required for state-changing operations (POST, PUT, PATCH, DELETE)'
      }
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Invalid credentials or resource not found.' },
          error: { type: 'string', example: 'Detailed error trace if applicable' }
        }
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Admin User' },
          email: { type: 'string', format: 'email', example: 'admin@example.com' },
          role: { type: 'string', enum: ['admin', 'employee'], example: 'admin' },
          employee_id: { type: 'integer', nullable: true, example: null },
          created_at: { type: 'string', format: 'date-time' }
        }
      },
      Employee: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 101 },
          name: { type: 'string', example: 'Jane Doe' },
          email: { type: 'string', format: 'email', example: 'jane.doe@company.com' },
          phone: { type: 'string', example: '+1-555-0199' },
          department_id: { type: 'integer', nullable: true, example: 2 },
          department_name: { type: 'string', nullable: true, example: 'Engineering' },
          designation: { type: 'string', example: 'Senior Software Engineer' },
          avatar_url: { type: 'string', nullable: true, example: '/uploads/avatars/avatar-101.png' },
          status: { type: 'string', enum: ['Active', 'Inactive'], example: 'Active' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          deleted_at: { type: 'string', format: 'date-time', nullable: true, example: null }
        }
      },
      Department: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Engineering' },
          employee_count: { type: 'integer', example: 14 },
          created_at: { type: 'string', format: 'date-time' }
        }
      },
      Document: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 12 },
          employee_id: { type: 'integer', example: 101 },
          title: { type: 'string', example: 'Employment Contract' },
          file_name: { type: 'string', example: 'contract.pdf' },
          file_size: { type: 'integer', example: 245102 },
          file_type: { type: 'string', example: 'application/pdf' },
          created_at: { type: 'string', format: 'date-time' }
        }
      },
      AuditLog: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 45 },
          user_id: { type: 'integer', nullable: true, example: 1 },
          user_name: { type: 'string', example: 'Admin User' },
          user_email: { type: 'string', example: 'admin@example.com' },
          action: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'], example: 'UPDATE' },
          entity_type: { type: 'string', example: 'EMPLOYEE' },
          entity_id: { type: 'integer', nullable: true, example: 101 },
          employee_name: { type: 'string', example: 'Jane Doe' },
          details: { type: 'string', example: 'Updated contact info (Email: jane.doe@company.com)' },
          ip_address: { type: 'string', example: '127.0.0.1' },
          created_at: { type: 'string', format: 'date-time' }
        }
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 8 },
          user_id: { type: 'integer', example: 1 },
          type: { type: 'string', enum: ['account', 'profile', 'security', 'system'], example: 'profile' },
          title: { type: 'string', example: 'Contact Information Updated' },
          message: { type: 'string', example: 'Your contact info was updated: jane.doe@company.com' },
          is_read: { type: 'integer', enum: [0, 1], example: 0 },
          link: { type: 'string', nullable: true, example: '/employees/101' },
          created_at: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  security: [
    { bearerAuth: [] },
    { cookieAuth: [] }
  ],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register new user account',
        description: 'Creates a new user account with employee role. Automatically links to employee record if matching email exists.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'John Smith' },
                  email: { type: 'string', format: 'email', example: 'john.smith@company.com' },
                  password: { type: 'string', format: 'password', example: 'Password123!' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'User registered successfully and authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
          },
          400: { description: 'Validation error or email already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate user & issue session',
        description: 'Validates user credentials, issues 15-minute JWT access token, 7-day rotating refresh token, and CSRF token.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'admin@example.com' },
                  password: { type: 'string', format: 'password', example: 'Password123!' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Authentication successful. Returns token and sets HttpOnly cookies.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Login successful!' },
                    token: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
                    csrfToken: { type: 'string', example: '4a6f23b...' },
                    user: { $ref: '#/components/schemas/User' }
                  }
                }
              }
            }
          },
          400: { description: 'Missing email or password' },
          401: { description: 'Invalid email or password' }
        }
      }
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get currently authenticated user session',
        description: 'Returns authenticated user info, active role, and linked employee ID.',
        responses: {
          200: {
            description: 'Session valid',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                    csrfToken: { type: 'string' }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized or token expired' }
        }
      }
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Log out user & invalidate session',
        description: 'Revokes refresh token in database and clears authentication cookies.',
        responses: {
          200: { description: 'Logged out successfully' }
        }
      }
    },
    '/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate refresh token and issue new access token',
        description: 'Validates rotating refresh token and extends session.',
        security: [],
        responses: {
          200: { description: 'Session refreshed successfully' },
          401: { description: 'Invalid or expired refresh token' }
        }
      }
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Request password reset email',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'If account exists, password reset instructions are dispatched.' }
        }
      }
    },
    '/auth/reset-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Reset password using token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'newPassword'],
                properties: {
                  token: { type: 'string', example: '6f42a...' },
                  newPassword: { type: 'string', format: 'password', example: 'NewSecret123!' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Password reset successfully' },
          400: { description: 'Invalid or expired token' }
        }
      }
    },
    '/employees': {
      get: {
        tags: ['Employees'],
        summary: 'List active employees',
        description: 'Returns all active (non-deleted) employees. Supports search query, department filtering, and status filtering. Employees are restricted to viewing their own record.',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by employee name or email' },
          { name: 'department_id', in: 'query', schema: { type: 'string' }, description: 'Filter by department ID or "all"' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'Active', 'Inactive'] }, description: 'Filter by employee status' }
        ],
        responses: {
          200: {
            description: 'Array of active employee records',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Employee' } } } }
          }
        }
      },
      post: {
        tags: ['Employees'],
        summary: 'Create new employee record (Admin only)',
        description: 'Creates a new employee record and notifies system administrators.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'phone', 'department_id', 'designation'],
                properties: {
                  name: { type: 'string', example: 'Alice Johnson' },
                  email: { type: 'string', format: 'email', example: 'alice.johnson@company.com' },
                  phone: { type: 'string', example: '+1-555-123-4567' },
                  department_id: { type: 'integer', example: 1 },
                  designation: { type: 'string', example: 'Product Designer' },
                  status: { type: 'string', enum: ['Active', 'Inactive'], default: 'Active' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Employee created successfully' },
          400: { description: 'Validation error or email already in use' },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/employees/deleted': {
      get: {
        tags: ['Employees'],
        summary: 'List soft-deleted employees archive (Admin only)',
        description: 'Retrieves all archived employees where `deleted_at IS NOT NULL`.',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name or email' },
          { name: 'department_id', in: 'query', schema: { type: 'string' }, description: 'Filter by department ID' }
        ],
        responses: {
          200: {
            description: 'List of archived employees',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Employee' } } } }
          },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/employees/{id}': {
      get: {
        tags: ['Employees'],
        summary: 'Get employee details by ID',
        description: 'Returns full profile of employee. Accessible by Admins or by employees viewing their own profile.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Employee ID or "me"' }
        ],
        responses: {
          200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
          403: { description: 'Forbidden - Cannot view another employee profile' },
          404: { description: 'Employee not found' }
        }
      },
      put: {
        tags: ['Employees'],
        summary: 'Update employee record (Admin only)',
        description: 'Updates full employee details. Soft-deleted records cannot be edited.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'phone', 'department_id', 'designation'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  department_id: { type: 'integer' },
                  designation: { type: 'string' },
                  status: { type: 'string', enum: ['Active', 'Inactive'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Employee updated successfully' },
          400: { description: 'Validation error or record is archived' },
          403: { description: 'Forbidden - Admin access required' },
          404: { description: 'Employee not found' }
        }
      },
      delete: {
        tags: ['Employees'],
        summary: 'Soft-delete employee (Admin only)',
        description: 'Safely marks employee as soft-deleted by recording `deleted_at = NOW()`. Preserves all documents, files, and audit logs.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'Employee moved to deleted archive successfully' },
          400: { description: 'Employee already deleted' },
          403: { description: 'Forbidden - Admin access required' },
          404: { description: 'Employee not found' }
        }
      }
    },
    '/employees/{id}/restore': {
      patch: {
        tags: ['Employees'],
        summary: 'Restore soft-deleted employee (Admin only)',
        description: 'Restores an archived employee back to the active directory (`deleted_at = NULL`).',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'Employee restored successfully' },
          400: { description: 'Employee is not deleted or active email conflict' },
          403: { description: 'Forbidden - Admin access required' },
          404: { description: 'Employee not found' }
        }
      }
    },
    '/employees/{id}/contact': {
      patch: {
        tags: ['Employees'],
        summary: 'Update employee contact details',
        description: 'Updates email and phone number. Permitted for Admins or the employee updating their own contact details.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Employee ID or "me"' }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'phone'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'updated@company.com' },
                  phone: { type: 'string', example: '+1-555-999-8888' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Contact information updated successfully' },
          400: { description: 'Invalid email or duplicate email' },
          403: { description: 'Forbidden - Can only update own contact info' }
        }
      }
    },
    '/employees/{id}/avatar': {
      post: {
        tags: ['Employee Avatars'],
        summary: 'Upload profile picture',
        description: 'Uploads avatar image (JPEG, PNG, WEBP, max 2MB). Permitted for Admin or own profile.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  avatar: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Profile picture updated successfully' },
          400: { description: 'Invalid file format or file exceeds 2MB limit' }
        }
      },
      delete: {
        tags: ['Employee Avatars'],
        summary: 'Remove profile picture',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Profile picture removed successfully' }
        }
      }
    },
    '/employees/{id}/documents': {
      get: {
        tags: ['Employee Documents'],
        summary: 'List employee attached documents',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Document' } } } }
          }
        }
      },
      post: {
        tags: ['Employee Documents'],
        summary: 'Upload document for employee',
        description: 'Uploads document (PDF, Word, Images, Text, max 5MB). Permitted for Admin or own profile.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['document'],
                properties: {
                  title: { type: 'string', example: 'Certification' },
                  document: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Document uploaded successfully' }
        }
      }
    },
    '/employees/{id}/documents/{docId}': {
      delete: {
        tags: ['Employee Documents'],
        summary: 'Delete employee document',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'docId', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'Document deleted successfully' }
        }
      }
    },
    '/employees/{id}/documents/{docId}/download': {
      get: {
        tags: ['Employee Documents'],
        summary: 'Download document binary file',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'docId', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'Binary stream attachment' }
        }
      }
    },
    '/employees/export/csv': {
      get: {
        tags: ['Employees'],
        summary: 'Export active employee records to CSV (Admin only)',
        responses: {
          200: { description: 'CSV file attachment' },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/employees/export/excel': {
      get: {
        tags: ['Employees'],
        summary: 'Export active employee records to Excel (.xlsx) (Admin only)',
        responses: {
          200: { description: 'Excel spreadsheet file attachment' },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/departments': {
      get: {
        tags: ['Departments'],
        summary: 'List departments with active employee count',
        responses: {
          200: {
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Department' } } } }
          }
        }
      },
      post: {
        tags: ['Departments'],
        summary: 'Create new department (Admin only)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Product Operations' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Department created successfully' },
          400: { description: 'Department name already exists' },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/departments/{id}': {
      get: {
        tags: ['Departments'],
        summary: 'Get department by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Department' } } } },
          404: { description: 'Department not found' }
        }
      },
      put: {
        tags: ['Departments'],
        summary: 'Update department name (Admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', example: 'Core Engineering' } }
              }
            }
          }
        },
        responses: {
          200: { description: 'Department updated successfully' },
          400: { description: 'Duplicate name' },
          403: { description: 'Forbidden - Admin access required' }
        }
      },
      delete: {
        tags: ['Departments'],
        summary: 'Delete department (Admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Department deleted successfully' },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/dashboard/stats': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get dashboard KPI metrics and hiring statistics',
        responses: {
          200: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalEmployees: { type: 'integer', example: 42 },
                    activeEmployees: { type: 'integer', example: 38 },
                    inactiveEmployees: { type: 'integer', example: 4 },
                    totalDepartments: { type: 'integer', example: 6 },
                    departmentBreakdown: { type: 'array', items: { type: 'object' } },
                    recentEmployees: { type: 'array', items: { $ref: '#/components/schemas/Employee' } },
                    monthlyHiringStats: { type: 'array', items: { type: 'object' } }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/audit-logs': {
      get: {
        tags: ['Audit Logs'],
        summary: 'List audit trail records (Admin only)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'action', in: 'query', schema: { type: 'string', enum: ['all', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    logs: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
                    pagination: { type: 'object' },
                    stats: { type: 'object' }
                  }
                }
              }
            }
          },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get user in-app notifications and unread count',
        parameters: [
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean', default: false } }
        ],
        responses: {
          200: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    notifications: { type: 'array', items: { $ref: '#/components/schemas/Notification' } },
                    unreadCount: { type: 'integer', example: 2 },
                    totalCount: { type: 'integer', example: 10 }
                  }
                }
              }
            }
          }
        }
      },
      delete: {
        tags: ['Notifications'],
        summary: 'Clear all read notifications',
        responses: {
          200: { description: 'Read notifications cleared successfully' }
        }
      }
    },
    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark single notification as read',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'Notification marked as read' }
        }
      }
    },
    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        responses: {
          200: { description: 'All notifications marked as read' }
        }
      }
    },
    '/notifications/{id}': {
      delete: {
        tags: ['Notifications'],
        summary: 'Delete single notification',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'Notification deleted successfully' }
        }
      }
    }
  }
};

module.exports = swaggerSpec;
