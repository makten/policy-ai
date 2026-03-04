# Role-Based Access Control (RBAC) Implementation Plan

## ✅ IMPLEMENTATION COMPLETE

This document outlines the implementation of a comprehensive Role-Based Access Control (RBAC) system for the Smart Hotel Management System.

### Completed Features
- ✅ Database schema with roles, permissions, role_permissions, and staff_roles tables
- ✅ 58 permissions across 16 categories (dashboard, rooms, reservations, etc.)
- ✅ 6 default roles (Admin, Manager, Front Desk, Housekeeping, Kitchen, Viewer)
- ✅ Backend API routes for roles and permissions management
- ✅ Enhanced auth middleware with permission checking
- ✅ JWT tokens include roles and permissions
- ✅ Frontend permission hooks and components (Can, CanAny, CanAll)
- ✅ Permission-based route protection
- ✅ Admin Role Management UI with permission editor
- ✅ Dynamic sidebar navigation based on user permissions
- ✅ Migration script for existing staff

---

## Current State Analysis


### Existing Infrastructure
- **Database**: PostgreSQL with `staff` table containing `role` (string) and `permissions` (text array) columns
- **Backend Auth**: JWT-based authentication with `authMiddleware` and `requirePermission` middleware
- **Frontend Auth**: Zustand store (`authStore.ts`) with `user` object containing `role` field
- **Pages**: 16+ pages requiring access control (Dashboard, Rooms, Reservations, Guests, Orders, Housekeeping, Menu, Staff, Service Requests, Reports, Kitchen, Payments, Front Desk, Attractions, Settings)

---

## Phase 1: Database Schema

### New Tables

#### 1. `roles` Table
```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES hotels(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted (Admin, etc.)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (hotel_id, name)
);
```

#### 2. `permissions` Table
```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'rooms.view', 'rooms.create'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- e.g., 'rooms', 'reservations', 'staff'
    action VARCHAR(50) NOT NULL, -- 'view', 'create', 'edit', 'delete'
    is_system BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3. `role_permissions` Table (Junction)
```sql
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);
```

#### 4. `staff_roles` Table (Junction - Multiple Roles Per User)
```sql
CREATE TABLE staff_roles (
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES staff(id),
    PRIMARY KEY (staff_id, role_id)
);
```

### Seed Data: Default Permissions
```sql
-- Dashboard
INSERT INTO permissions (code, name, description, category, action) VALUES
('dashboard.view', 'View Dashboard', 'Access the main dashboard', 'dashboard', 'view');

-- Rooms
INSERT INTO permissions (code, name, description, category, action) VALUES
('rooms.view', 'View Rooms', 'View room list and details', 'rooms', 'view'),
('rooms.create', 'Create Rooms', 'Create new rooms', 'rooms', 'create'),
('rooms.edit', 'Edit Rooms', 'Modify room details', 'rooms', 'edit'),
('rooms.delete', 'Delete Rooms', 'Delete rooms', 'rooms', 'delete'),
('rooms.status', 'Change Room Status', 'Update room status', 'rooms', 'edit');

-- Reservations
INSERT INTO permissions (code, name, description, category, action) VALUES
('reservations.view', 'View Reservations', 'View reservations', 'reservations', 'view'),
('reservations.create', 'Create Reservations', 'Create new reservations', 'reservations', 'create'),
('reservations.edit', 'Edit Reservations', 'Modify reservations', 'reservations', 'edit'),
('reservations.delete', 'Delete Reservations', 'Cancel reservations', 'reservations', 'delete'),
('reservations.checkin', 'Check-in Guests', 'Perform check-in', 'reservations', 'edit'),
('reservations.checkout', 'Check-out Guests', 'Perform check-out', 'reservations', 'edit');

-- Add more for: guests, orders, housekeeping, menu, staff, service-requests, 
-- reports, kitchen, payments, front-desk, attractions, settings
```

### Default Roles
| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | Full system access | All permissions |
| **Manager** | Manage operations | All except staff.delete, settings.* |
| **Front Desk** | Reception operations | reservations.*, guests.*, rooms.view, rooms.status |
| **Housekeeping** | Cleaning tasks | housekeeping.*, rooms.view, rooms.status |
| **Kitchen** | Food orders | orders.view, orders.edit, menu.view |
| **Viewer** | Read-only access | *.view permissions only |

---

## Phase 2: Backend Implementation

### 2.1 New Routes

#### `/api/roles` Routes
```typescript
// GET /api/roles - List all roles
// POST /api/roles - Create new role
// GET /api/roles/:id - Get role details including permissions
// PATCH /api/roles/:id - Update role
// DELETE /api/roles/:id - Delete role (if not system role)
// POST /api/roles/:id/permissions - Assign permissions to role
// DELETE /api/roles/:id/permissions/:permissionId - Remove permission
```

#### `/api/permissions` Routes  
```typescript
// GET /api/permissions - List all available permissions
// GET /api/permissions/categories - Get permissions grouped by category
```

#### Updated `/api/hotels/staff` Routes
```typescript
// GET /api/hotels/staff/:id/roles - Get user's assigned roles
// POST /api/hotels/staff/:id/roles - Assign roles to user
// DELETE /api/hotels/staff/:id/roles/:roleId - Remove role from user
```

### 2.2 Updated Auth Middleware

```typescript
// Enhanced JWTPayload
interface JWTPayload {
    userId: string;
    hotelId: string;
    roles: string[]; // Role names
    permissions: string[]; // Compiled permission codes
}

// Enhanced requirePermission middleware
export function requirePermission(...requiredPermissions: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Admin bypass
        if (req.user.permissions.includes('*')) {
            return next();
        }

        const hasPermission = requiredPermissions.every(p => 
            req.user.permissions.includes(p)
        );

        if (!hasPermission) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                required: requiredPermissions 
            });
        }

        next();
    };
}
```

### 2.3 Apply Permissions to Existing Routes

Each route handler will be updated with permission checks:

```typescript
// Example: rooms.ts
router.get('/', authMiddleware, requirePermission('rooms.view'), async (req, res) => {...});
router.post('/', authMiddleware, requirePermission('rooms.create'), async (req, res) => {...});
router.patch('/:id', authMiddleware, requirePermission('rooms.edit'), async (req, res) => {...});
router.delete('/:id', authMiddleware, requirePermission('rooms.delete'), async (req, res) => {...});
```

---

## Phase 3: Frontend Implementation

### 3.1 Updated Auth Store

```typescript
// stores/authStore.ts
interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    permissions: string[];
    hotelId: string;
    hotelName: string;
}

interface AuthState {
    // ... existing fields
    hasPermission: (permission: string) => boolean;
    hasAnyPermission: (...permissions: string[]) => boolean;
    hasAllPermissions: (...permissions: string[]) => boolean;
}
```

### 3.2 Permission Hook

```typescript
// hooks/usePermission.ts
export function usePermission(permission: string): boolean {
    const { user } = useAuthStore();
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(permission);
}

export function usePermissions() {
    const { user } = useAuthStore();
    return {
        can: (permission: string) => 
            user?.permissions.includes('*') || user?.permissions.includes(permission),
        canAny: (...permissions: string[]) => 
            permissions.some(p => user?.permissions.includes(p)),
        canAll: (...permissions: string[]) => 
            permissions.every(p => user?.permissions.includes(p)),
    };
}
```

### 3.3 Protected Route Component

```typescript
// components/ProtectedRoute.tsx
interface ProtectedRouteProps {
    children: React.ReactNode;
    permission?: string;
    permissions?: string[];
    requireAll?: boolean;
    fallback?: React.ReactNode;
}

export function ProtectedRoute({ 
    children, 
    permission, 
    permissions = [], 
    requireAll = false,
    fallback = <AccessDenied />
}: ProtectedRouteProps) {
    const { can, canAny, canAll } = usePermissions();
    
    if (permission && !can(permission)) return fallback;
    if (permissions.length > 0) {
        const hasAccess = requireAll 
            ? canAll(...permissions) 
            : canAny(...permissions);
        if (!hasAccess) return fallback;
    }
    
    return <>{children}</>;
}
```

### 3.4 Conditional UI Component

```typescript
// components/Can.tsx
export function Can({ 
    permission, 
    children, 
    fallback = null 
}: { permission: string; children: ReactNode; fallback?: ReactNode }) {
    const can = usePermission(permission);
    return can ? <>{children}</> : <>{fallback}</>;
}

// Usage:
<Can permission="rooms.create">
    <button>Add Room</button>
</Can>
```

### 3.5 Updated App Routes

```typescript
// App.tsx
<Route path="rooms" element={
    <PermissionRoute permission="rooms.view">
        <RoomsPage />
    </PermissionRoute>
} />
```

### 3.6 Admin UI Pages

#### Role Management Page (`/settings/roles`)
- List all roles
- Create/Edit/Delete roles
- Assign permissions to roles via checkbox matrix
- View users in each role

#### User Role Assignment (Enhanced Staff Page)
- See assigned roles per user
- Assign/remove roles
- View effective permissions

---

## Phase 4: Page-Permission Mapping

| Page | Route | Required Permission |
|------|-------|---------------------|
| Dashboard | `/` | `dashboard.view` |
| Rooms | `/rooms` | `rooms.view` |
| Reservations | `/reservations` | `reservations.view` |
| Front Desk | `/front-desk` | `frontdesk.view` |
| Guests | `/guests` | `guests.view` |
| Orders | `/orders` | `orders.view` |
| Housekeeping | `/housekeeping` | `housekeeping.view` |
| Menu | `/menu` | `menu.view` |
| Kitchen | `/kitchen` | `kitchen.view` |
| Payments | `/payments` | `payments.view` |
| Service Requests | `/service-requests` | `services.view` |
| Reports | `/reports` | `reports.view` |
| Staff | `/staff` | `staff.view` |
| Attractions | `/attractions` | `attractions.view` |
| Settings | `/settings` | `settings.view` |

---

## Phase 5: Implementation Steps

### Step 1: Database Schema (Priority: High)
1. Create migration script with new tables
2. Seed default permissions
3. Seed default roles with permissions
4. Migrate existing staff roles to new system

### Step 2: Backend API (Priority: High)
1. Create `/api/roles` route handlers
2. Create `/api/permissions` route handlers  
3. Update auth middleware for new structure
4. Update login to return compiled permissions
5. Add permission checks to all existing routes

### Step 3: Frontend Core (Priority: High)
1. Update authStore with permissions
2. Create usePermission hook
3. Create Can component
4. Update ProtectedRoute

### Step 4: Admin UI (Priority: Medium)
1. Create RoleManagementPage
2. Update StaffPage with role assignment
3. Add permission matrix UI

### Step 5: Apply to All Pages (Priority: Medium)
1. Update each page with permission-based UI
2. Hide/disable unauthorized actions
3. Add AccessDenied component

### Step 6: Testing & Polish (Priority: High)
1. Test all permission combinations
2. Verify backend enforcement
3. Test role inheritance
4. Documentation

---

## File Changes Summary

### New Files
- `backend/src/routes/roles.ts` - Role management API
- `backend/src/routes/permissions.ts` - Permissions API
- `backend/src/db/migrations/add_rbac_tables.sql` - Database migration
- `frontend/src/hooks/usePermission.ts` - Permission hook
- `frontend/src/components/Can.tsx` - Conditional render component
- `frontend/src/components/AccessDenied.tsx` - Access denied page
- `frontend/src/pages/RoleManagementPage.tsx` - Role admin UI

### Modified Files
- `backend/src/middleware/auth.ts` - Enhanced middleware
- `backend/src/routes/auth.ts` - Return permissions in token
- `backend/src/routes/*.ts` - Add permission checks to all routes
- `frontend/src/stores/authStore.ts` - Add permissions
- `frontend/src/App.tsx` - Permission-based routing
- `frontend/src/pages/StaffPage.tsx` - Role assignment UI
- `frontend/src/components/Layout.tsx` - Permission-based navigation

---

## Success Criteria Checklist

- [ ] Users can only access pages explicitly allowed by their roles
- [ ] Admins can create, edit, and delete roles
- [ ] Admins can assign permissions to roles
- [ ] Admins can assign multiple roles to users
- [ ] Unauthorized UI elements are hidden/disabled
- [ ] Backend rejects unauthorized API calls with 403
- [ ] Changes take effect on next login/token refresh
- [ ] System roles (Admin) cannot be deleted
- [ ] Permission changes are auditable
