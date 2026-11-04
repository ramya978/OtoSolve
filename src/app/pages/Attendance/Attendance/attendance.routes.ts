import { Routes } from '@angular/router';

/* =====================================================================================================
   ATTENDANCE ROUTES - every attendance page, lazy loaded.
   Optional: app.routes.ts already registers every page through REAL_SCREENS + the sidebar menu (menu.data.ts).
   Use this only if you prefer lazy loading:  ...ATTENDANCE_ROUTES  inside APP_ROUTES.
   Paths here, in menu.data.ts and in ATTENDANCE_LINKS (attendance-data.service.ts) must stay the same.
   ===================================================================================================== */
export const ATTENDANCE_ROUTES: Routes = [
  { path: 'app/attendance/overview', title: 'Attendance overview', loadComponent: () => import('../attendance-overview/attendance-overview').then(m => m.AttendanceOverview) },
  { path: 'app/attendance', title: 'Attendance', loadComponent: () => import('./attendance').then(m => m.Attendance) },
  { path: 'app/individual-attendance', title: 'My attendance', loadComponent: () => import('../Individual_attendance/user_attendance').then(m => m.IndividualAttendance) },
  { path: 'app/attendance/punch-station', title: 'Punch station', loadComponent: () => import('../punch-station/punch-station').then(m => m.PunchStation) },
  { path: 'app/bulk-attendance', title: 'Bulk attendance', loadComponent: () => import('../bulk-attendance/bulk-attendance').then(m => m.BulkAttendance) },
  { path: 'app/attendance/field-hub', title: 'Attendance field hub', loadComponent: () => import('../attendance-field-hub/attendance-field-hub').then(m => m.AttendanceFieldHub) },
  { path: 'app/attendance/employees', title: 'Employee directory', loadComponent: () => import('../employee-directory/employee-directory').then(m => m.EmployeeDirectory) },
  { path: 'app/attendance/locations', title: 'Work locations', loadComponent: () => import('../work-locations/work-locations').then(m => m.WorkLocations) },
  { path: 'app/shift-planner', title: 'Shift planner', loadComponent: () => import('../shift-planner/shift-planner').then(m => m.ShiftPlannerComponent) },
  { path: 'app/shift-templates', title: 'Shift templates', loadComponent: () => import('../shift-templates/shift-templates').then(m => m.ShiftTemplatesComponent) },
  { path: 'app/permission-desk', title: 'Permission desk', loadComponent: () => import('../permission-desk/permission-desk').then(m => m.PermissionDeskComponent) },
  { path: 'app/attendance-policies', title: 'Attendance policies', loadComponent: () => import('../attendance-policies/attendance-policies').then(m => m.AttendancePoliciesComponent) },
  { path: 'app/attendance/payroll', title: 'Payroll summary', loadComponent: () => import('../payroll-summary/payroll-summary').then(m => m.PayrollSummary) },
  { path: 'app/attendance/audit', title: 'Attendance audit', loadComponent: () => import('../attendance-audit/attendance-audit').then(m => m.AttendanceAudit) },

  /* HR suite: leave, holidays, exceptions, set-up and reports (admin) */
  { path: 'app/attendance/leave', title: 'Leave management', loadComponent: () => import('../leave-management/leave-management').then(m => m.LeaveManagement) },
  { path: 'app/attendance/holidays', title: 'Holiday calendar', loadComponent: () => import('../holiday-calendar/holiday-calendar').then(m => m.HolidayCalendar) },
  { path: 'app/attendance/exceptions', title: 'Missed punches & overtime', loadComponent: () => import('../attendance-exceptions/attendance-exceptions').then(m => m.AttendanceExceptions) },
  { path: 'app/attendance/approval-flow', title: 'Approval flow', loadComponent: () => import('../approval-flow/approval-flow').then(m => m.ApprovalFlow) },
  { path: 'app/attendance/geo-fencing', title: 'Geo-fencing', loadComponent: () => import('../geo-fencing/geo-fencing').then(m => m.GeoFencing) },
  { path: 'app/attendance/devices', title: 'Punch methods & devices', loadComponent: () => import('../punch-devices/punch-devices').then(m => m.PunchDevices) },
  { path: 'app/attendance/reports', title: 'Attendance reports', loadComponent: () => import('../attendance-reports/attendance-reports').then(m => m.AttendanceReports) },

  /* HR suite: employee self-service */
  { path: 'app/attendance/my-leave', title: 'My leave', loadComponent: () => import('../my-leave/my-leave').then(m => m.MyLeave) },
  { path: 'app/attendance/my-permission', title: 'Permission', loadComponent: () => import('../my-permission/my-permission').then(m => m.MyPermission) },
  { path: 'app/attendance/team-approvals', title: 'Approvals', loadComponent: () => import('../team-approvals/team-approvals').then(m => m.TeamApprovals) },
  { path: 'app/attendance/company-calendar', title: 'Company calendar', loadComponent: () => import('../holiday-calendar/holiday-calendar').then(m => m.CompanyCalendar) },
];
