import { apiRequest } from "./api";
import type { User } from "@/types/auth";

export type EmployeeProfileData = {
  id?: number;
  employeeCode?: string;
  dob?: string;
  gender?: string;
  address?: string;
  dateOfJoining?: string;
  employmentType?: string;
  employmentStatus?: string;
  workLocation?: string;
  departmentId?: number;
  department?: { id: number; name: string; code?: string };
};

// Employee type for frontend
export type Employee = User & {
  employeeProfile?: EmployeeProfileData;
  role?: {
    id: number;
    name: string;
  };
  designation?: {
    id: number;
    name: string;
  };
  assignedWorkItems?: Array<{
    id: number;
    title: string;
    type: string;
    status: string;
    project?: { id: number; name: string };
  }>;
  createdProjects?: Array<{ id: number; name: string }>;
  createdAt?: string;
  updatedAt?: string;
};

// Employee list response with pagination
export type EmployeeListResponse = {
  employees: Employee[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// Employee filters
export type EmployeeFilters = {
  page?: number;
  limit?: number;
  search?: string;
  roleId?: number;
  designationId?: number;
  status?: string;
};

// Create employee input
export type CreateEmployeeInput = {
  name: string;
  email: string;
  password: string;
  phoneNumber?: string;
  roleId?: number;
  designationId?: number;
};

// Update employee input
export type UpdateEmployeeInput = {
  name?: string;
  email?: string;
  password?: string;
  phoneNumber?: string;
  roleId?: number;
  designationId?: number;
  status?: string;
};

// Get all employees with filters and pagination
export async function getEmployees(
  filters: EmployeeFilters = {},
  token: string
): Promise<EmployeeListResponse> {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.append("page", String(filters.page));
  if (filters.limit) queryParams.append("limit", String(filters.limit));
  if (filters.search) queryParams.append("search", filters.search);
  if (filters.roleId) queryParams.append("roleId", String(filters.roleId));
  if (filters.designationId) 
    queryParams.append("designationId", String(filters.designationId));
  if (filters.status) queryParams.append("status", filters.status);

  const response = await apiRequest<EmployeeListResponse>(
    `/api/employees?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response;
}

// Get single employee by ID
export async function getEmployeeById(
  employeeId: number,
  token: string
): Promise<{ employee: Employee }> {
  const response = await apiRequest<{ employee: Employee }>(
    `/api/employees/${employeeId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response;
}

// Create new employee
export async function createEmployee(
  employeeData: CreateEmployeeInput,
  token: string
): Promise<{ message: string; employee: Employee }> {
  const response = await apiRequest<{ message: string; employee: Employee }>(
    "/api/employees",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(employeeData),
    }
  );
  return response;
}

// Update employee
export async function updateEmployee(
  employeeId: number,
  employeeData: UpdateEmployeeInput,
  token: string
): Promise<{ message: string; employee: Employee }> {
  const response = await apiRequest<{ message: string; employee: Employee }>(
    `/api/employees/${employeeId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(employeeData),
    }
  );
  return response;
}

// Delete employee (soft delete)
export async function deleteEmployee(
  employeeId: number,
  token: string
): Promise<{ message: string; employee: Employee }> {
  const response = await apiRequest<{ message: string; employee: Employee }>(
    `/api/employees/${employeeId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response;
}

// Get roles and designations for filters
export type Role = { id: number; name: string };
export type Designation = { id: number; name: string };

export type FiltersResponse = {
  roles: Role[];
  designations: Designation[];
};

export async function getEmployeeFilters(
  token: string
): Promise<FiltersResponse> {
  const response = await apiRequest<FiltersResponse>(
    "/api/employees/filters",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response;
}
