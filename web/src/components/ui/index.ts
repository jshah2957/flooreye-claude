// Shared UI component library — re-exports

export { Button, buttonVariants } from "./Button";
export type { ButtonProps } from "./Button";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Badge, badgeVariants } from "./Badge";
export type { BadgeProps } from "./Badge";

export { Skeleton, SkeletonText, SkeletonCard, SkeletonAvatar, SkeletonTableRow } from "./Skeleton";

export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";

export { Drawer } from "./Drawer";
export type { DrawerProps } from "./Drawer";

export { DataTable } from "./DataTable";
export type { DataTableProps, Column, PaginationConfig } from "./DataTable";

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps, BreadcrumbItem as PageHeaderBreadcrumbItem } from "./PageHeader";

export { Tabs, TabContent } from "./Tabs";
export type { TabsProps, TabItem } from "./Tabs";

export { SearchInput } from "./SearchInput";
export type { SearchInputProps } from "./SearchInput";

export { DateRangePicker } from "./DateRangePicker";
export type { DateRangePickerProps, DateRange, Preset } from "./DateRangePicker";

export { Tooltip } from "./Tooltip";
export type { TooltipProps } from "./Tooltip";

export { Breadcrumbs } from "./Breadcrumbs";
export type { BreadcrumbsProps, BreadcrumbItem } from "./Breadcrumbs";

export { LoadingPage } from "./LoadingPage"; // UNUSED export — LoadingPage has zero consumers. Safe to remove with the file.

export { ErrorState } from "./ErrorState"; // UNUSED export — ErrorState has zero consumers. Safe to remove with the file.
export type { ErrorStateProps } from "./ErrorState"; // UNUSED export — same as above.

export { StatCard } from "./StatCard";
export type { StatCardProps } from "./StatCard";

export { ToastProvider, useToast } from "./Toast";

export { ErrorBoundary } from "./ErrorBoundary";
